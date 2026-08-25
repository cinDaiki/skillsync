import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email || "";
  const [user, domain] = email.split("@");
  if (user.length <= 2) {
    return `${user.charAt(0)}***@${domain}`;
  }
  return `${user.charAt(0)}***${user.charAt(user.length - 1)}@${domain}`;
}

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
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") || "";
    const brevoSenderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "";
    const brevoSenderName = Deno.env.get("BREVO_SENDER_NAME") || "SkillSync Security";

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

    // 2. Extract and validate session_id and identity server-side
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
    const userEmail = user.email || payload.email;
    const sessionId = payload.session_id;

    if (!userId || !userEmail || !sessionId || !UUID_REGEX.test(sessionId)) {
      return new Response(
        JSON.stringify({ error: "Invalid session: Missing or malformed session identity" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Resolve role and determine server-authoritative recipient email
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("role, is_suspended")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Unable to verify account profile." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.is_suspended && profile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Account is suspended." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let recipientEmail = "";
    if (profile.role === "admin") {
      const adminOtpEmail = user.app_metadata?.admin_otp_email;
      const isVerified = user.app_metadata?.admin_otp_email_verified === true;

      if (!adminOtpEmail || !isVerified) {
        return new Response(
          JSON.stringify({ error: "Admin security email is not configured or verified." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      recipientEmail = String(adminOtpEmail).trim().toLowerCase();
    } else {
      // Candidate and Employer use their own authenticated account email
      recipientEmail = String(userEmail).trim().toLowerCase();
    }

    if (!recipientEmail || !recipientEmail.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Invalid recipient email configuration." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Generate challenge_id, 6-digit OTP, and HMAC proof
    const challengeId = crypto.randomUUID();
    const otp = generateSecureOtp();
    const otpProof = await computeOtpProof(hmacSecret, challengeId, otp);

    const { data: rpcRes, error: rpcError } = await serviceClient.rpc("create_login_verification_challenge", {
      p_challenge_id: challengeId,
      p_user_id: userId,
      p_session_id: sessionId,
      p_otp_proof: otpProof,
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: "Failed to create verification challenge" }),
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
      return new Response(
        JSON.stringify({ error: rpcRes?.error || "Challenge creation rejected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Send OTP via Brevo HTTPS REST API
    let brevoSuccess = false;
    if (brevoApiKey) {
      if (!brevoSenderEmail || !brevoSenderName) {
        await serviceClient.rpc("cancel_login_verification_challenge", {
          p_challenge_id: challengeId,
          p_user_id: userId,
          p_session_id: sessionId,
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
            to: [{ email: recipientEmail }],
            subject: "SkillSync Login Verification Code",
            htmlContent: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 22px;">SkillSync Login Verification</h2>
                <p style="color: #475569; font-size: 15px; line-height: 1.6;">Your single-use login verification code is:</p>
                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
                  <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1e293b; font-family: monospace;">${otp}</span>
                </div>
                <p style="color: #64748b; font-size: 13px; line-height: 1.5;">This code expires in <strong>10 minutes</strong>. Never share this code with anyone.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="color: #94a3b8; font-size: 12px; line-height: 1.4; margin-bottom: 0;">If you did not attempt this sign-in, someone may know your password. Please change your password immediately.</p>
              </div>
            `,
          }),
        });

        if (brevoRes.ok) {
          brevoSuccess = true;
        } else {
          brevoSuccess = false;
        }
      } catch {
        brevoSuccess = false;
      }
    } else {
      // In local development/mock mode without BREVO_API_KEY
      brevoSuccess = true;
    }

    // 6. Rollback challenge on definite Brevo failure
    if (!brevoSuccess) {
      await serviceClient.rpc("cancel_login_verification_challenge", {
        p_challenge_id: challengeId,
        p_user_id: userId,
        p_session_id: sessionId,
      });

      return new Response(
        JSON.stringify({ error: "We couldn't send the verification code. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Return challenge_id and cooldown seconds with masked recipient hint
    return new Response(
      JSON.stringify({
        success: true,
        challenge_id: challengeId,
        cooldown_seconds: 60,
        masked_email: maskEmail(recipientEmail),
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
