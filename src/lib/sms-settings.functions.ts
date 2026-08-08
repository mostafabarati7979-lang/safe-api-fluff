import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";


const saveSchema = z.object({
  apiKey: z.string().trim().max(300).optional(),
  verifyTemplateId: z.string().trim().max(50).optional(),
  welcomeTemplateId: z.string().trim().max(50).optional(),
  enabled: z.boolean().optional(),
});

const testSchema = z.object({ mobile: z.string().trim().regex(/^09\d{9}$/) });

async function assertAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (data !== true) throw new Error("دسترسی مجاز نیست");
}


export const getSmsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getSmsConfig, maskSecret } = await import("./sms-settings.server");
    const config = await getSmsConfig();
    return {
      provider: config.provider,
      apiKeyMasked: maskSecret(config.apiKey),
      hasApiKey: Boolean(config.apiKey),
      verifyTemplateId: config.verifyTemplateId ?? "",
      welcomeTemplateId: config.welcomeTemplateId ?? "",
      enabled: config.enabled,
    };
  });

export const saveSmsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { saveSmsConfig } = await import("./sms-settings.server");
    await saveSmsConfig(data, context.userId);
    return { success: true as const };
  });

export const sendTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { sendVerificationCode } = await import("./sms.server");
    const result = await sendVerificationCode(data.mobile, "123456");
    return { success: result.success, reason: result.reason ?? null };
  });
