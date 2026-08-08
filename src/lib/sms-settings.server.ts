/**
 * SMS provider configuration. SERVER ONLY.
 *
 * The API key and template ids are managed by admins from the admin panel and
 * stored in the `sms_settings` table (service-role only). Environment
 * variables are used as a fallback so existing deployments keep working.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface SmsConfig {
  provider: string;
  apiKey: string | null;
  verifyTemplateId: string | null;
  welcomeTemplateId: string | null;
  enabled: boolean;
}

let cache: { value: SmsConfig; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

export function invalidateSmsConfigCache() {
  cache = null;
}

export async function getSmsConfig(): Promise<SmsConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const envApiKey = process.env["SMS_IR_API_KEY"] ?? null;
  const envTemplate = process.env["SMS_IR_TEMPLATE_ID"] ?? null;

  const { data, error } = await supabaseAdmin
    .from("sms_settings")
    .select("provider, api_key, verify_template_id, welcome_template_id, enabled")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    console.error("[sms] failed to read provider settings");
  }

  const value: SmsConfig = {
    provider: data?.provider ?? "smsir",
    apiKey: (data?.api_key?.trim() || envApiKey) ?? null,
    verifyTemplateId: (data?.verify_template_id?.trim() || envTemplate) ?? null,
    welcomeTemplateId: data?.welcome_template_id?.trim() || null,
    enabled: data?.enabled ?? true,
  };

  cache = { value, at: Date.now() };
  return value;
}

export interface SmsSettingsInput {
  apiKey?: string | undefined;
  verifyTemplateId?: string | undefined;
  welcomeTemplateId?: string | undefined;
  enabled?: boolean | undefined;
}

/** Persists admin-provided settings. An undefined field keeps its stored value. */
export async function saveSmsConfig(input: SmsSettingsInput, actorId: string): Promise<void> {
  const patch: {
    updated_at: string;
    updated_by: string;
    api_key?: string | null;
    verify_template_id?: string | null;
    welcome_template_id?: string | null;
    enabled?: boolean;
  } = {
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  };
  if (input.apiKey !== undefined) patch.api_key = input.apiKey.trim() || null;
  if (input.verifyTemplateId !== undefined)
    patch.verify_template_id = input.verifyTemplateId.trim() || null;
  if (input.welcomeTemplateId !== undefined)
    patch.welcome_template_id = input.welcomeTemplateId.trim() || null;
  if (input.enabled !== undefined) patch.enabled = input.enabled;

  const { error } = await supabaseAdmin.from("sms_settings").update(patch).eq("id", true);
  if (error) throw new Error(error.message);
  invalidateSmsConfigCache();
}

/** 5f3a...c91 -> ****c91 — safe to send to the admin UI. */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}
