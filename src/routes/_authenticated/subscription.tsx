import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Crown, Loader2, Receipt, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, InlineLoading, ErrorState, EmptyState } from "@/components/ui-states";
import { formatJalali, formatJalaliDateTime } from "@/lib/format";
import { useSubscription, usePlans, formatToman, type Plan } from "@/lib/subscription";
import { purchasePlan } from "@/lib/payments";
import { CurrentPlanBadge, RemainingDaysBadge } from "@/components/subscription-badges";

export const Route = createFileRoute("/_authenticated/subscription")({
  head: () => ({
    meta: [
      { title: "اشتراک من | سامانه آزمون آنلاین" },
      { name: "description", content: "وضعیت اشتراک، دوره آزمایشی و خرید طرح‌های اشتراک." },
      { property: "og:title", content: "اشتراک من" },
      { property: "og:description", content: "وضعیت اشتراک و خرید طرح‌های اشتراک." },
    ],
  }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const queryClient = useQueryClient();
  const { snapshot, subscription, hasAccess, isTrial, remainingDays, isLoading, error } = useSubscription();
  const plans = usePlans();
  const [selected, setSelected] = useState<Plan | null>(null);
  const [buying, setBuying] = useState(false);

  const payments = useQuery({
    queryKey: ["my-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, gateway, status, paid_at, created_at, plans(title)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const buy = async () => {
    if (!selected) return;
    setBuying(true);
    try {
      const result = await purchasePlan(selected.id);
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      toast.success(result.message ?? "درخواست خرید ثبت شد.");
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ["my-payments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت درخواست خرید");
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="اشتراک من" description="وضعیت اشتراک و طرح‌های قابل خرید" />

      {isLoading ? (
        <InlineLoading />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : (
        <Card className={hasAccess ? "card-elevated" : "card-elevated border-destructive/40"}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="flex items-center gap-2">
                {isTrial ? <Sparkles className="size-5 text-primary" /> : <Crown className="size-5 text-primary" />}
                وضعیت فعلی
              </CardTitle>
              <CurrentPlanBadge subscription={subscription} />
              {hasAccess ? <RemainingDaysBadge days={remainingDays} /> : null}
            </div>
            <CardDescription>
              {hasAccess
                ? isTrial
                  ? "شما در دوره آزمایشی ۳۰ روزه هستید."
                  : "اشتراک شما فعال است."
                : "اشتراک شما منقضی شده است. برای ادامه استفاده از همه امکانات ویژه، تمدید کنید."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Info label="طرح فعلی" value={subscription?.plan_title ?? (isTrial ? "دوره آزمایشی" : "—")} />
            <Info label="تاریخ انقضا" value={formatJalali(subscription?.expires_at)} />
            <Info
              label="روزهای باقی‌مانده"
              value={hasAccess ? `${remainingDays.toLocaleString("fa-IR")} روز` : "۰ روز"}
            />
            {snapshot?.trial_ends_at ? (
              <Info label="پایان دوره آزمایشی" value={formatJalali(snapshot.trial_ends_at)} />
            ) : null}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold">طرح‌های اشتراک</h2>
        {plans.isLoading ? (
          <InlineLoading />
        ) : plans.error ? (
          <ErrorState message={(plans.error as Error).message} />
        ) : (plans.data ?? []).length === 0 ? (
          <EmptyState title="طرحی برای فروش وجود ندارد" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(plans.data ?? []).map((plan) => (
              <Card key={plan.id} className="card-elevated flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base">{plan.title}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <CalendarClock className="size-4" />
                    {plan.duration_months.toLocaleString("fa-IR")} ماه دسترسی کامل
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <p className="text-xl font-bold">{formatToman(plan.price)}</p>
                  <Button className="w-full" onClick={() => setSelected(plan)}>
                    خرید اشتراک
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" /> پرداخت‌های من
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments.isLoading ? (
            <InlineLoading />
          ) : (payments.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">پرداختی ثبت نشده است.</p>
          ) : (
            <ul className="divide-y">
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>{(p as { plans: { title: string } | null }).plans?.title ?? "—"}</span>
                  <span className="tabular-nums">{formatToman(p.amount)}</span>
                  <Badge variant={p.status === "paid" ? "default" : "outline"}>
                    {p.status === "paid" ? "پرداخت‌شده" : p.status === "failed" ? "ناموفق" : "در انتظار"}
                  </Badge>
                  <span className="text-muted-foreground">{formatJalaliDateTime(p.paid_at ?? p.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>خرید {selected?.title}</DialogTitle>
            <DialogDescription>
              مبلغ قابل پرداخت: {selected ? formatToman(selected.price) : "—"} — مدت:{" "}
              {selected?.duration_months.toLocaleString("fa-IR")} ماه
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            درگاه پرداخت آنلاین هنوز فعال نشده است. با ثبت درخواست، پس از هماهنگی پرداخت، اشتراک شما توسط مدیر فعال
            می‌شود.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              انصراف
            </Button>
            <Button onClick={buy} disabled={buying}>
              {buying ? <Loader2 className="size-4 animate-spin" /> : null}
              ثبت درخواست خرید
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
