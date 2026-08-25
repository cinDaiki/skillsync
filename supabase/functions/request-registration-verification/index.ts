import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function generateSecureOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return (array[0] % 1000000).toString().padStart(6, "0");
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
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") || "";
    const brevoSenderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "";
    const brevoSenderName = Deno.env.get("BREVO_SENDER_NAME") || "SkillSync Security";

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

    const { email } = body;
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const sourceIpHash = await computeHmac(hmacSecret, `ip:${rawIp}`);

    const challengeId = crypto.randomUUID();
    const otp = generateSecureOtp();
    const otpProof = await computeHmac(hmacSecret, `${challengeId}:${otp}`);

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: rpcRes, error: rpcError } = await serviceClient.rpc("create_registration_verification_challenge", {
      p_challenge_id: challengeId,
      p_email: cleanEmail,
      p_otp_proof: otpProof,
      p_source_ip_hash: sourceIpHash,
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: "Failed to create registration challenge" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rpcRes || rpcRes.success !== true) {
      if (rpcRes?.error === "RESEND_COOLDOWN_ACTIVE") {
        return new Response(
          JSON.stringify({
            error: "RESEND_COOLDOWN_ACTIVE",
            retry_after_seconds: rpcRes.retry_after_seconds || 60,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (rpcRes?.error === "EMAIL_RATE_LIMIT_EXCEEDED" || rpcRes?.error === "IP_RATE_LIMIT_EXCEEDED" || rpcRes?.error === "GLOBAL_RATE_LIMIT_EXCEEDED") {
        return new Response(
          JSON.stringify({ error: "Too many verification requests. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: rpcRes?.error || "Registration challenge creation rejected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enumeration-safe check: If email already belongs to a registered account,
    // we do not send an OTP, but return the exact same success structure.
    if (rpcRes.shadow_account) {
      return new Response(
        JSON.stringify({
          success: true,
          challenge_id: challengeId,
          cooldown_seconds: 60,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send OTP via Brevo HTTPS REST API
    let brevoSuccess = false;
    let lastBrevoError = "";
    if (brevoApiKey) {
      if (!brevoSenderEmail || !brevoSenderName) {
        await serviceClient.rpc("cancel_registration_verification_challenge", {
          p_challenge_id: challengeId,
          p_email: cleanEmail,
        });

        return new Response(
          JSON.stringify({ error: "We couldn't send the verification code. Sender configuration missing." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": brevoApiKey,
          },
          body: JSON.stringify({
            sender: { name: brevoSenderName, email: brevoSenderEmail },
            to: [{ email: cleanEmail }],
            subject: "SkillSync Registration Verification Code",
            htmlContent: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 22px;">SkillSync Email Verification</h2>
                <p style="color: #475569; font-size: 15px; line-height: 1.6;">Your single-use registration verification code is:</p>
                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
                  <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1e293b; font-family: monospace;">${otp}</span>
                </div>
                <p style="color: #64748b; font-size: 13px; line-height: 1.5;">This code expires in <strong>10 minutes</strong>. Enter this code to verify ownership of your email address and complete registration.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="color: #94a3b8; font-size: 12px; line-height: 1.4; margin-bottom: 0;">If you did not request this code, you can safely ignore this email.</p>
              </div>
            `,
          }),
        });

        if (brevoRes.ok) {
          brevoSuccess = true;
        } else {
          lastBrevoError = `${brevoRes.status}: ${await brevoRes.text()}`;
          console.error("Brevo API error:", lastBrevoError);
          brevoSuccess = false;
        }
      } catch (fetchErr: any) {
        lastBrevoError = `fetch error: ${fetchErr?.message || String(fetchErr)}`;
        console.error("Brevo fetch error:", lastBrevoError);
        brevoSuccess = false;
      }
    } else {
      // In local development/mock mode without BREVO_API_KEY
      brevoSuccess = true;
    }

    if (!brevoSuccess) {
      await serviceClient.rpc("cancel_registration_verification_challenge", {
        p_challenge_id: challengeId,
        p_email: cleanEmail,
      });

      return new Response(
        JSON.stringify({ error: "We couldn't send the verification code. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        challenge_id: challengeId,
        cooldown_seconds: 60,
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
