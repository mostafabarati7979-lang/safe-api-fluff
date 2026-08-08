import type { SubscriptionSnapshot } from "@/lib/subscription";

/**
 * Expiry notification service (placeholder).
 * Reminder thresholds are shared with the future server-side scheduler so the
 * in-app banner and the e-mail/SMS reminders stay in sync.
 */
export const EXPIRY_REMINDER_DAYS = [7, 3, 1] as const;

export type NotificationKind = "expiry_7" | "expiry_3" | "expiry_1" | "expired";

export interface ExpiryNotification {
  kind: NotificationKind;
  title: string;
  description: string;
}

export function getExpiryNotification(snapshot: SubscriptionSnapshot | null): ExpiryNotification | null {
  if (!snapshot) return null;
  if (!snapshot.has_active) {
    return {
      kind: "expired",
      title: "اشتراک شما منقضی شده است.",
      description: "برای ادامه استفاده از همه امکانات ویژه، اشتراک خود را تمدید کنید.",
    };
  }
  const days = snapshot.subscription?.remaining_days ?? 0;
  const threshold = EXPIRY_REMINDER_DAYS.find((d) => days <= d);
  if (!threshold) return null;
  return {
    kind: `expiry_${threshold}` as NotificationKind,
    title: `${days} روز تا پایان اشتراک شما باقی مانده است.`,
    description: "برای جلوگیری از قطع دسترسی، اشتراک خود را تمدید کنید.",
  };
}

/** Placeholder dispatcher — wire to e-mail/SMS provider later. */
export async function sendExpiryNotification(userId: string, kind: NotificationKind) {
  console.info("[notifications] queued", { userId, kind });
  return { queued: true };
}
