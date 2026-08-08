import { supabase } from "@/integrations/supabase/client";

/**
 * Payment gateway abstraction.
 * Concrete gateways (Zarinpal / IDPay / NextPay) can be registered here later
 * without touching the UI: every provider only has to implement `startPayment`.
 */
export type GatewayId = "manual" | "zarinpal" | "idpay" | "nextpay";

export interface PaymentIntent {
  payment_id: string;
  amount: number;
  plan_title: string;
}

export interface StartPaymentResult {
  /** URL the user should be redirected to, when the gateway is online. */
  redirectUrl?: string;
  /** Human readable message when no online gateway is wired up yet. */
  message?: string;
}

export interface PaymentProvider {
  id: GatewayId;
  title: string;
  enabled: boolean;
  startPayment(intent: PaymentIntent): Promise<StartPaymentResult>;
}

/** Placeholder provider: records the payment intent, activation stays manual (admin). */
const manualProvider: PaymentProvider = {
  id: "manual",
  title: "پرداخت دستی / هماهنگی با پشتیبانی",
  enabled: true,
  startPayment: async (intent) => ({
    message: `درخواست خرید «${intent.plan_title}» ثبت شد. پس از پرداخت، اشتراک توسط مدیر فعال می‌شود.`,
  }),
};

const registry: Record<GatewayId, PaymentProvider> = {
  manual: manualProvider,
  zarinpal: { id: "zarinpal", title: "زرین‌پال", enabled: false, startPayment: notConfigured("زرین‌پال") },
  idpay: { id: "idpay", title: "آیدی‌پی", enabled: false, startPayment: notConfigured("آیدی‌پی") },
  nextpay: { id: "nextpay", title: "نکست‌پی", enabled: false, startPayment: notConfigured("نکست‌پی") },
};

function notConfigured(name: string) {
  return async (): Promise<StartPaymentResult> => ({
    message: `درگاه ${name} هنوز پیکربندی نشده است.`,
  });
}

export function getPaymentProvider(id: GatewayId = "manual"): PaymentProvider {
  const provider = registry[id];
  return provider.enabled ? provider : manualProvider;
}

export function listPaymentProviders(): PaymentProvider[] {
  return Object.values(registry);
}

/** Creates the payment record server side (amount is taken from the plan, never the client). */
export async function createPaymentIntent(planId: string, gateway: GatewayId = "manual") {
  const { data, error } = await supabase.rpc("create_payment_intent", {
    p_plan_id: planId,
    p_gateway: gateway,
  });
  if (error) throw error;
  return data as unknown as PaymentIntent;
}

export async function purchasePlan(planId: string, gateway: GatewayId = "manual") {
  const intent = await createPaymentIntent(planId, gateway);
  return getPaymentProvider(gateway).startPayment(intent);
}
