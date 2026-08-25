import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OTP_REGEX = /^\d{6}$/;

async function computeOtpProof(secret: string, challengeId: string, otp: string): Promise<string> {
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
    encoder.encode(`${challengeId}:${otp}`)
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const hmacSecret = Deno.env.get("LOGIN_OTP_HMAC_SECRET") || "";

    if (!supabaseUrl || !supabaseServiceKey || !hmacSecret) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Cryptographically validate JWT using Supabase Auth
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Extract and validate session_id server-side
    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
      return new Response(
        JSON.stringify({ error: "Invalid token format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: Record<string, any>;
    try {
      const decoded = atob(tokenParts[1].replace(/-/g, "+").replace(/_/g, "/"));
      payload = JSON.parse(decoded);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid token payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const sessionId = payload.session_id;

    if (!userId || !sessionId || !UUID_REGEX.test(sessionId)) {
      return new Response(
        JSON.stringify({ error: "Invalid session: Missing or malformed session identity" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse and strictly validate request payload
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { challenge_id, otp, remember_device, device_token, device_name } = body;

    if (!challenge_id || !UUID_REGEX.test(challenge_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid challenge_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!otp || typeof otp !== "string" || !OTP_REGEX.test(otp.trim())) {
      return new Response(
        JSON.stringify({ error: "OTP must be exactly 6 numeric digits" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanOtp = otp.trim();
    const rememberDevice = Boolean(remember_device);
    const cleanDeviceToken = typeof device_token === "string" && device_token.length >= 32 ? device_token.trim() : null;
    const cleanDeviceName = typeof device_name === "string" ? device_name.slice(0, 100).trim() : null;

    if (rememberDevice && !cleanDeviceToken) {
      return new Response(
        JSON.stringify({ error: "High-entropy device token required when remember_device is true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Compute HMAC proof
    const otpProof = await computeOtpProof(hmacSecret, challenge_id, cleanOtp);

    // 5. Atomic single-RPC finalization inside PostgreSQL via service-role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: finalizeRes, error: finalizeError } = await serviceClient.rpc("finalize_login_verification", {
      p_challenge_id: challenge_id,
      p_user_id: userId,
      p_session_id: sessionId,
      p_submitted_otp_proof: otpProof,
      p_remember_device: rememberDevice,
      p_raw_device_token: cleanDeviceToken,
      p_device_name: cleanDeviceName,
    });

    if (finalizeError) {
      return new Response(
        JSON.stringify({ error: "Verification failed due to a database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!finalizeRes || finalizeRes.success !== true) {
      const err = finalizeRes?.error || "VERIFICATION_FAILED";
      const remainingAttempts = finalizeRes?.remaining_attempts;

      return new Response(
        JSON.stringify({
          success: false,
          error: err,
          remaining_attempts: remainingAttempts,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Return minimized verification success response (is_admin removed to avoid role authority dispersion)
    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        trusted_device_registered: rememberDevice,
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
