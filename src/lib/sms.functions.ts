import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const requestSchema = z.object({ mobile: z.string().trim().max(20) });
const verifySchema = z.object({
  mobile: z.string().trim().max(20),
  code: z.string().trim().max(10),
});

export const requestMobileOtp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => requestSchema.parse(data))
  .handler(async ({ data }) => {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    const { issueOtp } = await import("./sms-otp.server");
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const result = await issueOtp(data.mobile, ip);
    if (!result.ok) return { success: false as const, reason: result.reason };
    return { success: true as const, expiresInSeconds: result.expiresInSeconds };
  });

export const verifyMobileOtp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data }) => {
    const { consumeOtp, createSignInToken } = await import("./sms-otp.server");
    const result = await consumeOtp(data.mobile, data.code);
    if (!result.ok) return { success: false as const, reason: result.reason };

    const token = await createSignInToken(data.mobile);
    if (!token) return { success: false as const, reason: "not_registered" as const };

    return { success: true as const, email: token.email, tokenHash: token.tokenHash };
  });

/* ---------------- Registration with one-time password ---------------- */

const signupRequestSchema = z.object({
  mobile: z.string().trim().regex(/^09\d{9}$/),
  fullName: z.string().trim().min(3).max(80),
});

// SECURITY: no e-mail is accepted here. Only the mobile number is verified in
// this flow, so an attacker-supplied address must never be attached to the account.
const signupVerifySchema = z.object({
  mobile: z.string().trim().regex(/^09\d{9}$/),
  code: z.string().trim().regex(/^\d{6}$/),
  fullName: z.string().trim().min(3).max(80),
});


export const requestSignupOtp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => signupRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    const { issueOtp, isMobileRegistered } = await import("./sms-otp.server");

    if (await isMobileRegistered(data.mobile)) {
      return { success: false as const, reason: "already_registered" as const };
    }

    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const result = await issueOtp(data.mobile, ip);
    if (!result.ok) return { success: false as const, reason: result.reason };
    return { success: true as const, expiresInSeconds: result.expiresInSeconds };
  });

export const verifySignupOtp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => signupVerifySchema.parse(data))
  .handler(async ({ data }) => {
    const { registerWithOtp } = await import("./sms-otp.server");
    const result = await registerWithOtp({
      mobile: data.mobile,
      code: data.code,
      fullName: data.fullName,
      email: data.email || undefined,
    });
    if (!result.ok) return { success: false as const, reason: result.reason };
    return { success: true as const, email: result.email, tokenHash: result.tokenHash };
  });
