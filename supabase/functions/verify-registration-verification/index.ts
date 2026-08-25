import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OTP_REGEX = /^\d{6}$/;

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

function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
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

    const { challenge_id, email, otp } = body;

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

    if (!otp || typeof otp !== "string" || !OTP_REGEX.test(otp.trim())) {
      return new Response(
        JSON.stringify({ error: "OTP must be exactly 6 numeric digits" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.trim();

    // 1. Generate 256-bit random completion token and compute its HMAC hash
    const rawCompletionToken = generateSecureToken();
    const completionTokenHash = await computeHmac(hmacSecret, `comp:${rawCompletionToken}`);

    // 2. Compute submitted OTP HMAC proof
    const submittedOtpProof = await computeHmac(hmacSecret, `${challenge_id}:${cleanOtp}`);

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Atomically verify OTP in PostgreSQL (locks row, validates proof, stores completion token hash)
    const { data: rpcRes, error: rpcError } = await serviceClient.rpc("verify_registration_otp", {
      p_challenge_id: challenge_id,
      p_email: cleanEmail,
      p_submitted_otp_proof: submittedOtpProof,
      p_token_hash: completionTokenHash,
      p_token_ttl_seconds: 900, // 15 minutes TTL for completing registration
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify registration challenge" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rpcRes || rpcRes.success !== true) {
      if (rpcRes?.error === "INVALID_OTP") {
        return new Response(
          JSON.stringify({
            error: "INVALID_OTP",
            message: "Invalid verification code. Please check and try again.",
            remaining_attempts: rpcRes.remaining_attempts ?? 0,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (rpcRes?.error === "CHALLENGE_LOCKED") {
        return new Response(
          JSON.stringify({
            error: "CHALLENGE_LOCKED",
            message: "Too many failed attempts. Please request a new verification code.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (rpcRes?.error === "CHALLENGE_EXPIRED") {
        return new Response(
          JSON.stringify({
            error: "CHALLENGE_EXPIRED",
            message: "Verification code has expired. Please request a new code.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (rpcRes?.error === "CHALLENGE_ALREADY_CONSUMED") {
        return new Response(
          JSON.stringify({
            error: "CHALLENGE_ALREADY_CONSUMED",
            message: "This verification challenge has already been used.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: rpcRes?.error || "Verification failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the raw 256-bit completion token over HTTPS to legitimate client only
    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        completion_token: rawCompletionToken,
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
