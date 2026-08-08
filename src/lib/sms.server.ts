/**
 * SMS provider integration (SMS.ir).
 *
 * SERVER ONLY. The API key and template id are managed by admins in the admin
 * panel (falling back to server secrets) and never leave this module.
 */
import { getSmsConfig } from "./sms-settings.server";

export interface SmsParameter {
  name: string;
  value: string;
}


export interface SmsResult {
  success: boolean;
  /** Non-sensitive provider status code, safe to log. */
  status?: number | undefined;
  /** Internal reason code, never shown raw to end users. */
  reason?: "not_configured" | "provider_rejected" | "network_error" | undefined;
}

const SMS_IR_VERIFY_URL = "https://api.sms.ir/v1/send/verify";

/** 09123456789 -> 0912***6789 (used for logs only). */
export function maskMobile(mobile: string): string {
  if (mobile.length < 8) return "***";
  return `${mobile.slice(0, 4)}***${mobile.slice(-4)}`;
}

/** Low-level call to the SMS.ir verification endpoint. */
async function sendVerifyTemplate(
  mobile: string,
  parameters: SmsParameter[],
  templateOverride?: string | null,
): Promise<SmsResult> {
  const config = await getSmsConfig();
  const apiKey = config.apiKey;
  const templateId = templateOverride ?? config.verifyTemplateId;

  if (!config.enabled) {
    console.error("[sms] provider is disabled in admin settings");
    return { success: false, reason: "not_configured" };
  }

  if (!apiKey || !templateId) {
    console.error("[sms] provider is not configured (missing api key or template id)");
    return { success: false, reason: "not_configured" };
  }


  try {
    const response = await fetch(SMS_IR_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/plain",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        mobile,
        templateId: Number(templateId) || templateId,
        parameters,
      }),
    });

    const raw = await response.text();
    let providerStatus: number | undefined;
    try {
      providerStatus = (JSON.parse(raw) as { status?: number }).status;
    } catch {
      providerStatus = undefined;
    }

    const success = response.ok && (providerStatus === undefined || providerStatus === 1);
    console.info(
      `[sms] verify to ${maskMobile(mobile)} at ${new Date().toISOString()} — ` +
        `http=${response.status} provider=${providerStatus ?? "n/a"} success=${success}`,
    );
    return { success, status: providerStatus ?? response.status, reason: success ? undefined : "provider_rejected" };
  } catch {
    console.error(`[sms] network error while sending to ${maskMobile(mobile)}`);
    return { success: false, reason: "network_error" };
  }
}

/* ------------------------------------------------------------------ *
 * Public, extensible SMS service surface.
 * Only sendVerificationCode is enabled for now; the rest are reserved.
 * ------------------------------------------------------------------ */

export function sendVerificationCode(mobile: string, code: string): Promise<SmsResult> {
  return sendVerifyTemplate(mobile, [{ name: "CODE", value: code }]);
}

export async function sendWelcomeSMS(mobile: string, name: string): Promise<SmsResult> {
  const config = await getSmsConfig();
  if (!config.welcomeTemplateId) return { success: false, reason: "not_configured" };
  return sendVerifyTemplate(mobile, [{ name: "NAME", value: name }], config.welcomeTemplateId);
}


export async function sendSubscriptionExpiringSMS(): Promise<SmsResult> {
  return { success: false, reason: "not_configured" };
}

export async function sendSubscriptionExpiredSMS(): Promise<SmsResult> {
  return { success: false, reason: "not_configured" };
}

export async function sendAdminNotificationSMS(): Promise<SmsResult> {
  return { success: false, reason: "not_configured" };
}