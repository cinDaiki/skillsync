import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = ["candidate", "employer"];

async function computeHmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const hmacSecret = Deno.env.get("REGISTRATION_OTP_HMAC_SECRET") || Deno.env.get("LOGIN_OTP_HMAC_SECRET") || "";

    if (!supabaseUrl || !supabaseServiceKey || !hmacSecret) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { challenge_id, email, completion_token, password, full_name, role } = body;

    if (!challenge_id || !UUID_REGEX.test(challenge_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid challenge_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!completion_token || typeof completion_token !== "string" || completion_token.length < 32) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid completion token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanFullName = typeof full_name === "string" && full_name.trim().length > 0 ? full_name.trim() : "SkillSync User";
    const cleanRole = typeof role === "string" ? role.toLowerCase().trim() : "candidate";

    // Strict role allowlist enforcement
    if (!ALLOWED_ROLES.includes(cleanRole)) {
      return new Response(
        JSON.stringify({ error: "Direct registration with this role is not permitted" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Compute HMAC hash of the submitted completion token
    const submittedTokenHash = await computeHmac(hmacSecret, `comp:${completion_token.trim()}`);

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Claim atomic 120-second completion lease and freeze metadata in PostgreSQL
    const { data: leaseRes, error: leaseErr } = await serviceClient.rpc("claim_registration_completion_lease", {
      p_challenge_id: challenge_id,
      p_email: cleanEmail,
      p_submitted_token_hash: submittedTokenHash,
      p_full_name: cleanFullName,
      p_role: cleanRole,
    });

    if (leaseErr) {
      return new Response(
        JSON.stringify({ error: "Failed to claim registration lease" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!leaseRes || leaseRes.success !== true) {
      if (leaseRes?.already_consumed) {
        return new Response(
          JSON.stringify({ success: true, registered: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (leaseRes?.error === "COMPLETION_IN_PROGRESS") {
        return new Response(
          JSON.stringify({
            error: "COMPLETION_IN_PROGRESS",
            message: "Account creation is currently in progress. Please wait a moment.",
            retry_after_seconds: leaseRes.retry_after_seconds || 5,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: leaseRes?.error || "Invalid registration completion request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leaseId = leaseRes.lease_id;
    const frozenFullName = leaseRes.full_name || cleanFullName;
    const frozenRole = leaseRes.role || cleanRole;

    // 3. Create Auth user via Supabase Auth Admin API (with server-controlled app_metadata binding)
    let createdUserId: string | null = null;

    const { data: authUser, error: authError } = await serviceClient.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: frozenFullName,
        role: frozenRole,
      },
      app_metadata: {
        registration_challenge_id: challenge_id,
        registration_verified_at: new Date().toISOString(),
      },
    });

    if (authUser?.user?.id) {
      createdUserId = authUser.user.id;
    } else if (authError) {
      // 4. Handle recovery if Auth user was already created during an interrupted previous attempt
      const isUserExists =
        authError.message?.toLowerCase().includes("already registered") ||
        authError.message?.toLowerCase().includes("already exists") ||
        authError.status === 422;

      if (isUserExists) {
        // Query auth.users directly via SECURITY DEFINER RPC to verify matching server-controlled challenge marker
        const { data: resolvedId, error: resolveErr } = await serviceClient.rpc("resolve_registration_auth_user", {
          p_email: cleanEmail,
          p_challenge_id: challenge_id,
        });

        if (!resolveErr && resolvedId) {
          createdUserId = resolvedId;
        } else {
          // Unrelated foreign account with same email — reject recovery strictly
          return new Response(
            JSON.stringify({ error: "An account with this email already exists. Please sign in." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: authError.message || "Failed to create authentication account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!createdUserId) {
      return new Response(
        JSON.stringify({ error: "Unable to establish user identity" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Commit profile creation and atomically consume the challenge under the active lease
    const { data: commitRes, error: commitErr } = await serviceClient.rpc("commit_registration_completion", {
      p_challenge_id: challenge_id,
      p_lease_id: leaseId,
      p_created_user_id: createdUserId,
    });

    if (commitErr || !commitRes?.success) {
      return new Response(
        JSON.stringify({ error: commitRes?.error || "Failed to finalize account registration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Return minimal, sanitized public response (0 passwords, 0 user IDs leaked)
    return new Response(
      JSON.stringify({
        success: true,
        registered: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
