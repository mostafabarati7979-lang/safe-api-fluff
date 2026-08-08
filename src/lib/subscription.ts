import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type SubscriptionStatus = "trial" | "active" | "expired" | "cancelled";

export interface CurrentSubscription {
  id: string;
  status: SubscriptionStatus;
  started_at: string;
  expires_at: string;
  plan_id: string | null;
  plan_title: string | null;
  remaining_days: number;
}

export interface SubscriptionSnapshot {
  has_active: boolean;
  has_used_trial: boolean;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  server_now: string;
  subscription: CurrentSubscription | null;
}

export interface Plan {
  id: string;
  title: string;
  duration_months: number;
  price: number;
  is_active: boolean;
  display_order: number;
}

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  trial: "دوره آزمایشی",
  active: "فعال",
  expired: "منقضی‌شده",
  cancelled: "لغو شده",
};

export const SUBSCRIPTION_QUERY_KEY = ["my-subscription"] as const;

/** Single source of truth for the current user's subscription state (server calculated). */
export function useSubscription() {
  const { user, role, loading } = useAuth();

  const query = useQuery({
    queryKey: [...SUBSCRIPTION_QUERY_KEY, user?.id],
    enabled: Boolean(user?.id) && !loading,
    staleTime: 60_000,
    queryFn: async (): Promise<SubscriptionSnapshot> => {
      const { data, error } = await supabase.rpc("my_subscription");
      if (error) throw error;
      return data as unknown as SubscriptionSnapshot;
    },
  });

  const snapshot = query.data ?? null;
  const isAdmin = role === "admin";

  return {
    ...query,
    snapshot,
    subscription: snapshot?.subscription ?? null,
    /** Admins always keep full access. */
    hasAccess: isAdmin || Boolean(snapshot?.has_active),
    isTrial: snapshot?.subscription?.status === "trial" && Boolean(snapshot?.has_active),
    remainingDays: snapshot?.subscription?.remaining_days ?? 0,
    checking: query.isLoading || loading,
  };
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, title, duration_months, price, is_active, display_order")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
}

export function formatToman(value: number | string) {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("fa-IR")} تومان`;
}
