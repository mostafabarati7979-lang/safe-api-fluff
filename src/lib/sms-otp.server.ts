/**
 * OTP issuing / verification. SERVER ONLY.
 *
 * Codes are never stored in plain text: only a SHA-256 hash of
 * `pepper:mobile:code` is persisted, together with an expiry timestamp and a
 * failed-attempt counter.
 */
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { maskMobile, sendVerificationCode, sendWelcomeSMS } from "./sms.server";

export const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_PER_MOBILE_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 15;
const MAX_VERIFY_ATTEMPTS = 5;

export const MOBILE_PATTERN = /^09\d{9}$/;

export type OtpFailure =
  | "invalid_mobile"
  | "rate_limited"
  | "cooldown"
  | "send_failed"
  | "not_registered"
  | "expired"
  | "invalid_code"
  | "too_many_attempts"
  | "server_error";

function hashCode(mobile: string, code: string): string {
  const pepper = process.env["SMS_OTP_PEPPER"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createHash("sha256").update(`${pepper}:${mobile}:${code}`).digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function generateCode(): string {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return String(100000 + ((buf[0] ?? 0) % 900000));
}

async function logDelivery(mobile: string, success: boolean, status?: number) {
  await supabaseAdmin.from("sms_delivery_logs").insert({
    mobile_masked: maskMobile(mobile),
    purpose: "verification",
    success,
    provider_status: status ?? null,
  });
}

export async function issueOtp(
  mobile: string,
  ip: string | null,
): Promise<{ ok: true; expiresInSeconds: number } | { ok: false; reason: OtpFailure }> {
  if (!MOBILE_PATTERN.test(mobile)) return { ok: false, reason: "invalid_mobile" };

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: recent, error: recentError } = await supabaseAdmin
    .from("sms_otp_codes")
    .select("created_at")
    .eq("mobile", mobile)
    .gte("created_at", hourAgo)
    .order("created_at", { ascending: false });

  if (recentError) {
    console.error("[otp] failed to read recent codes");
    return { ok: false, reason: "server_error" };
  }

  if ((recent?.length ?? 0) >= MAX_PER_MOBILE_PER_HOUR) return { ok: false, reason: "rate_limited" };

  const last = recent?.[0]?.created_at;
  if (last && Date.now() - new Date(last).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    return { ok: false, reason: "cooldown" };
  }

  if (ip) {
    const { count } = await supabaseAdmin
      .from("sms_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("request_ip", ip)
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) return { ok: false, reason: "rate_limited" };
  }

  // Invalidate any still-valid previous codes for this mobile.
  await supabaseAdmin
    .from("sms_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("mobile", mobile)
    .is("consumed_at", null);

  const code = generateCode();
  const { error: insertError } = await supabaseAdmin.from("sms_otp_codes").insert({
    mobile,
    code_hash: hashCode(mobile, code),
    expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
    request_ip: ip,
  });

  if (insertError) {
    console.error("[otp] failed to persist code");
    return { ok: false, reason: "server_error" };
  }

  const result = await sendVerificationCode(mobile, code);
  await logDelivery(mobile, result.success, result.status);

  if (!result.success) return { ok: false, reason: "send_failed" };
  return { ok: true, expiresInSeconds: OTP_TTL_SECONDS };
}

export async function consumeOtp(
  mobile: string,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: OtpFailure }> {
  if (!MOBILE_PATTERN.test(mobile)) return { ok: false, reason: "invalid_mobile" };
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "invalid_code" };

  const { data: row, error } = await supabaseAdmin
    .from("sms_otp_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("mobile", mobile)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[otp] failed to read code");
    return { ok: false, reason: "server_error" };
  }
  if (!row) return { ok: false, reason: "expired" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    await supabaseAdmin
      .from("sms_otp_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    return { ok: false, reason: "too_many_attempts" };
  }

  if (!safeEquals(row.code_hash, hashCode(mobile, code))) {
    await supabaseAdmin
      .from("sms_otp_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return { ok: false, reason: "invalid_code" };
  }

  await supabaseAdmin
    .from("sms_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  return { ok: true };
}

/**
 * Turns a verified mobile number into a one-time sign-in token for the
 * matching Supabase Auth user. Returns null when the mobile is unknown.
 */
export async function createSignInToken(
  mobile: string,
): Promise<{ email: string; tokenHash: string } | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("mobile", mobile)
    .maybeSingle();

  if (!profile?.email) return null;

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
  });

  if (error || !data.properties?.hashed_token) {
    console.error("[otp] failed to mint sign-in token");
    return null;
  }

  return { email: profile.email, tokenHash: data.properties.hashed_token };
}

/* ------------------------------------------------------------------ *
 * Registration with one-time password
 * ------------------------------------------------------------------ */

/** Synthetic auth e-mail used when a candidate registers with a mobile only. */
export function mobileEmail(mobile: string): string {
  return `${mobile}@mobile.local`;
}

export async function isMobileRegistered(mobile: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("mobile", mobile)
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * Completes a mobile registration: verifies the one-time code, creates the
 * auth user (already confirmed, since the mobile itself was verified) and
 * returns a single-use sign-in token so the browser can open a session.
 */
export async function registerWithOtp(params: {
  mobile: string;
  code: string;
  fullName: string;
  email?: string | undefined;
}): Promise<
  { ok: true; email: string; tokenHash: string } | { ok: false; reason: OtpFailure | "already_registered" }
> {
  const { mobile, code, fullName } = params;

  if (await isMobileRegistered(mobile)) return { ok: false, reason: "already_registered" };

  const verified = await consumeOtp(mobile, code);
  if (!verified.ok) return { ok: false, reason: verified.reason };

  const loginEmail = params.email?.trim() ? params.email.trim().toLowerCase() : mobileEmail(mobile);

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: loginEmail,
    email_confirm: true,
    user_metadata: { full_name: fullName, mobile },
  });

  if (createError || !created.user) {
    console.error(`[otp] failed to create account for ${maskMobile(mobile)}`);
    if ((createError?.message ?? "").toLowerCase().includes("already")) {
      return { ok: false, reason: "already_registered" };
    }
    return { ok: false, reason: "server_error" };
  }

  await supabaseAdmin
    .from("profiles")
    .update({ full_name: fullName, mobile, email: loginEmail })
    .eq("id", created.user.id);

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: loginEmail,
  });

  if (linkError || !link.properties?.hashed_token) {
    console.error("[otp] failed to mint sign-in token after registration");
    return { ok: false, reason: "server_error" };
  }

  void sendWelcomeSMS(mobile, fullName).catch(() => undefined);

  return { ok: true, email: loginEmail, tokenHash: link.properties.hashed_token };
}
