import { Link } from "@tanstack/react-router";
import { AlertTriangle, Crown, Lock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { formatJalali } from "@/lib/format";
import { useSubscription, subscriptionStatusLabels, type CurrentSubscription } from "@/lib/subscription";
import { getExpiryNotification } from "@/lib/notifications";

export function CurrentPlanBadge({ subscription }: { subscription: CurrentSubscription | null }) {
  if (!subscription) return <Badge variant="outline">بدون اشتراک</Badge>;
  const expired = new Date(subscription.expires_at).getTime() <= Date.now();
  const status = expired && subscription.status !== "cancelled" ? "expired" : subscription.status;
  if (status === "trial")
    return (
      <Badge className="gap-1" variant="secondary">
        <Sparkles className="size-3" /> دوره آزمایشی
      </Badge>
    );
  if (status === "active")
    return (
      <Badge className="gap-1">
        <Crown className="size-3" /> {subscription.plan_title ?? "اشتراک فعال"}
      </Badge>
    );
  return <Badge variant="destructive">{subscriptionStatusLabels[status]}</Badge>;
}

export function RemainingDaysBadge({ days }: { days: number }) {
  if (days <= 0) return <Badge variant="destructive">منقضی‌شده</Badge>;
  return (
    <Badge variant={days <= 7 ? "destructive" : "outline"}>{days.toLocaleString("fa-IR")} روز باقی‌مانده</Badge>
  );
}

export function ExpiredBadge() {
  return <Badge variant="destructive">منقضی‌شده</Badge>;
}

/** Slim banner shown on candidate pages when the subscription expires soon or has expired. */
export function SubscriptionBanner() {
  const { snapshot, hasAccess, checking } = useSubscription();
  if (checking) return null;
  const note = getExpiryNotification(snapshot);
  if (!note) return null;
  return (
    <Alert variant={hasAccess ? "default" : "destructive"} className="mb-4">
      <AlertTriangle className="size-4" />
      <AlertTitle>{note.title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{note.description}</span>
        <Button asChild size="sm" variant="outline">
          <Link to="/subscription">مشاهده اشتراک</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Wraps premium content; renders an upgrade card when access is missing. */
export function PremiumGate({
  children,
  title = "این بخش نیازمند اشتراک فعال است",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { hasAccess, checking } = useSubscription();
  if (checking || hasAccess) return <>{children}</>;
  return (
    <Card className="card-elevated">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="rounded-xl bg-destructive/10 p-3 text-destructive">
          <Lock className="size-5" />
        </span>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">
          اشتراک شما منقضی شده است. برای ادامه استفاده از همه امکانات، اشتراک خود را تمدید کنید.
        </p>
        <Button asChild>
          <Link to="/subscription">خرید / تمدید اشتراک</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ExpiryDate({ value }: { value?: string | null }) {
  return <span className="tabular-nums">{formatJalali(value)}</span>;
}
