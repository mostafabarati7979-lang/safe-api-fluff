import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, ShieldCheck, TrendingUp, Users2, AlarmClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, InlineLoading, EmptyState, ErrorState } from "@/components/ui-states";
import { formatJalali } from "@/lib/format";
import { formatToman, subscriptionStatusLabels, type SubscriptionStatus } from "@/lib/subscription";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({
    meta: [
      { title: "مدیریت اشتراک‌ها | پنل مدیر" },
      { name: "description", content: "مدیریت اشتراک کاربران، تمدید، لغو و اعطای دسترسی." },
      { property: "og:title", content: "مدیریت اشتراک‌ها" },
      { property: "og:description", content: "مدیریت اشتراک کاربران و آمار درآمد." },
    ],
  }),
  component: AdminSubscriptionsPage,
});

type Row = {
  user_id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  subscription_id: string | null;
  status: SubscriptionStatus;
  plan_title: string | null;
  started_at: string | null;
  expires_at: string | null;
  remaining_days: number | null;
  has_used_trial: boolean;
};

type Stats = {
  active: number;
  trial: number;
  expired: number;
  expiring_7d: number;
  revenue_month: number;
  revenue_total: number;
  newest: { full_name: string; email: string | null; status: string; expires_at: string }[];
};

const PRESETS = [7, 30, 60, 90, 180, 365];

function AdminSubscriptionsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [status, setStatus] = useState("all");
  const [grantFor, setGrantFor] = useState<Row | null>(null);
  const [days, setDays] = useState<number>(30);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const stats = useQuery({
    queryKey: ["subscription-stats"],
    enabled: role === "admin",
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await supabase.rpc("admin_subscription_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });

  const list = useQuery({
    queryKey: ["admin-subscriptions", applied, status],
    enabled: role === "admin",
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("admin_list_subscriptions", {
        ...(applied ? { p_search: applied } : {}),
        p_status: status,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    void queryClient.invalidateQueries({ queryKey: ["subscription-stats"] });
  };

  const grant = async () => {
    if (!grantFor) return;
    if (!days || days <= 0) {
      toast.error("تعداد روز را وارد کنید");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_grant_subscription", {
      p_user_id: grantFor.user_id,
      p_days: days,
      ...(reason ? { p_reason: reason } : {}),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("اشتراک با موفقیت اعمال شد");
    setGrantFor(null);
    setReason("");
    setDays(30);
    refresh();
  };

  const setStatusFor = async (row: Row, next: "active" | "expired" | "cancelled") => {
    const { error } = await supabase.rpc("admin_set_subscription_status", {
      p_user_id: row.user_id,
      p_status: next,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("وضعیت اشتراک به‌روزرسانی شد");
    refresh();
  };

  if (role !== "admin") {
    return <EmptyState title="دسترسی مجاز نیست" description="این بخش فقط برای مدیر سامانه است." />;
  }

  const s = stats.data;

  return (
    <div className="space-y-6">
      <PageHeader title="مدیریت اشتراک‌ها" description="فعال‌سازی، تمدید و لغو اشتراک کاربران" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="اشتراک‌های فعال" value={s?.active ?? 0} icon={ShieldCheck} />
        <Stat title="کاربران آزمایشی" value={s?.trial ?? 0} icon={Users2} />
        <Stat title="منقضی‌شده" value={s?.expired ?? 0} icon={AlarmClock} />
        <Stat title="انقضا در ۷ روز آینده" value={s?.expiring_7d ?? 0} icon={AlarmClock} />
        <Stat title="درآمد این ماه" value={formatToman(s?.revenue_month ?? 0)} icon={TrendingUp} />
        <Stat title="درآمد کل" value={formatToman(s?.revenue_total ?? 0)} icon={TrendingUp} />
      </div>

      {s?.newest?.length ? (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">جدیدترین مشترکین</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {s.newest.map((n, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">{n.full_name || n.email}</span>
                  <Badge variant="outline">
                    {subscriptionStatusLabels[n.status as SubscriptionStatus] ?? n.status}
                  </Badge>
                  <span className="text-muted-foreground">تا {formatJalali(n.expires_at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className="card-elevated">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-52 flex-1">
            <Label htmlFor="q">جستجوی کاربر</Label>
            <Input
              id="q"
              value={search}
              placeholder="نام، ایمیل یا موبایل"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setApplied(search)}
            />
          </div>
          <div className="w-44">
            <Label>وضعیت</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="trial">دوره آزمایشی</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="expired">منقضی‌شده</SelectItem>
                <SelectItem value="cancelled">لغو شده</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setApplied(search)} className="gap-1">
            <Search className="size-4" /> جستجو
          </Button>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <InlineLoading />
      ) : list.error ? (
        <ErrorState message={(list.error as Error).message} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState title="کاربری یافت نشد" />
      ) : (
        <div className="grid gap-3">
          {(list.data ?? []).map((row) => (
            <Card key={row.user_id} className="card-elevated">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-48">
                  <p className="font-semibold">{row.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{row.email ?? row.mobile ?? "—"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={row.status === "active" ? "default" : row.status === "trial" ? "secondary" : "destructive"}>
                    {subscriptionStatusLabels[row.status] ?? row.status}
                  </Badge>
                  <span>{row.plan_title ?? "—"}</span>
                  <span className="text-muted-foreground">تا {formatJalali(row.expires_at)}</span>
                  {row.remaining_days ? (
                    <Badge variant="outline">{row.remaining_days.toLocaleString("fa-IR")} روز</Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setGrantFor(row)}>
                    فعال‌سازی / تمدید
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void setStatusFor(row, "expired")}>
                    انقضا
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void setStatusFor(row, "cancelled")}>
                    لغو
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(grantFor)} onOpenChange={(o) => !o && setGrantFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اعطای اشتراک به {grantFor?.full_name || grantFor?.email}</DialogTitle>
            <DialogDescription>
              اگر کاربر اشتراک فعال دارد، مدت جدید به انتهای اشتراک فعلی اضافه می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={days === d ? "default" : "outline"}
                  onClick={() => setDays(d)}
                >
                  {d.toLocaleString("fa-IR")} روز
                </Button>
              ))}
            </div>
            <div>
              <Label htmlFor="days">تعداد روز دلخواه</Label>
              <Input
                id="days"
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="reason">دلیل (اختیاری)</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantFor(null)}>
              انصراف
            </Button>
            <Button onClick={grant} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              اعمال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: typeof Users2;
}) {
  return (
    <Card className="card-elevated">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-lg font-bold">{typeof value === "number" ? value.toLocaleString("fa-IR") : value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
