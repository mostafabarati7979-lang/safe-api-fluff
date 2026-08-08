import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenCheck,
  Users,
  ClipboardList,
  Trophy,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, InlineLoading, EmptyState, ErrorState } from "@/components/ui-states";
import { formatJalali, attemptStatusLabels } from "@/lib/format";
import { SubscriptionBanner } from "@/components/subscription-badges";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "داشبورد | سامانه آزمون آنلاین استخدامی" },
      { name: "description", content: "نمای کلی آزمون‌ها، نتایج و وضعیت کاربران سامانه آزمون." },
      { property: "og:title", content: "داشبورد سامانه آزمون آنلاین" },
      { property: "og:description", content: "نمای کلی آزمون‌ها، نتایج و وضعیت کاربران." },
    ],
  }),
  component: DashboardPage,
});

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: typeof Users;
}) {
  return (
    <Card className="card-elevated">
      <CardContent className="flex items-center gap-4 p-5">
        <span className="rounded-xl bg-primary/10 p-3 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { role, profile, loading } = useAuth();
  if (loading) return <InlineLoading />;
  return (
    <>
      <PageHeader
        title={`سلام ${profile?.full_name ?? "کاربر"} 👋`}
        description={
          role === "admin"
            ? "نمای کلی سامانه و آخرین فعالیت‌های داوطلبان"
            : "آزمون‌های در دسترس و نتایج شما"
        }
      />
      {role === "admin" ? null : <SubscriptionBanner />}
      {role === "admin" ? <AdminDashboard /> : <CandidateDashboard />}
    </>
  );
}

function AdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const [users, exams, questions, attempts, recent] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("exams").select("id", { count: "exact", head: true }),
        supabase.from("questions").select("id", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }),
        supabase
          .from("exam_attempts")
          .select("id, status, earned_score, total_score, passed, submitted_at, started_at, exams(title)")
          .order("started_at", { ascending: false })
          .limit(8),
      ]);
      if (recent.error) throw recent.error;
      return {
        users: users.count ?? 0,
        exams: exams.count ?? 0,
        questions: questions.count ?? 0,
        attempts: attempts.count ?? 0,
        recent: recent.data ?? [],
      };
    },
  });

  if (isLoading) return <InlineLoading />;
  if (error) return <ErrorState message={(error as Error).message} />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="کاربران" value={data!.users} icon={Users} />
        <StatCard title="آزمون‌ها" value={data!.exams} icon={BookOpenCheck} />
        <StatCard title="سوالات بانک" value={data!.questions} icon={ClipboardList} />
        <StatCard title="شرکت در آزمون" value={data!.attempts} icon={Trophy} />
      </div>

      <Card className="card-elevated">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>آخرین شرکت‌ها در آزمون</CardTitle>
            <CardDescription>هشت مورد اخیر</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/results">
              همه نتایج <ArrowLeft className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data!.recent.length === 0 ? (
            <EmptyState description="هنوز آزمونی برگزار نشده است." />
          ) : (
            <ul className="divide-y">
              {data!.recent.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">
                      {(a.exams as { title: string } | null)?.title ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatJalali(a.submitted_at ?? a.started_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === "submitted" ? (
                      <Badge variant={a.passed ? "default" : "destructive"}>
                        {a.earned_score ?? 0} از {a.total_score ?? 0}
                      </Badge>
                    ) : null}
                    <Badge variant="secondary">{attemptStatusLabels[a.status] ?? a.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CandidateDashboard() {
  const { user } = useAuth();

  const exams = useQuery({
    queryKey: ["candidate-exams", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, description, duration_minutes, status, categories!exams_category_id_fkey(name)")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const attempts = useQuery({
    queryKey: ["candidate-attempts", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, status, earned_score, total_score, passed, submitted_at, started_at, exams(title)")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const passedCount = useMemo(
    () => (attempts.data ?? []).filter((a) => a.passed).length,
    [attempts.data],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="آزمون‌های در دسترس" value={exams.data?.length ?? 0} icon={BookOpenCheck} />
        <StatCard title="آزمون‌های داده‌شده" value={attempts.data?.length ?? 0} icon={ClipboardList} />
        <StatCard title="قبولی‌ها" value={passedCount} icon={ShieldCheck} />
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>آزمون‌های در دسترس</CardTitle>
          <CardDescription>برای شروع، آزمون مورد نظر را انتخاب کنید.</CardDescription>
        </CardHeader>
        <CardContent>
          {exams.isLoading ? (
            <InlineLoading />
          ) : exams.data && exams.data.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {exams.data.map((e) => (
                <div key={e.id} className="rounded-xl border p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-semibold">{e.title}</p>
                    <Badge variant="secondary">
                      {(e.categories as { name: string } | null)?.name ?? "عمومی"}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{e.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      مدت زمان: {e.duration_minutes} دقیقه
                    </span>
                    <Button asChild size="sm">
                      <Link to="/exams">مشاهده</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState description="در حال حاضر آزمون فعالی برای شما وجود ندارد." />
          )}
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>نتایج اخیر شما</CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.isLoading ? (
            <InlineLoading />
          ) : attempts.data && attempts.data.length > 0 ? (
            <ul className="divide-y">
              {attempts.data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">
                      {(a.exams as { title: string } | null)?.title ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatJalali(a.submitted_at ?? a.started_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === "submitted" ? (
                      <Badge variant={a.passed ? "default" : "destructive"}>
                        {a.earned_score ?? 0} از {a.total_score ?? 0}
                      </Badge>
                    ) : null}
                    <Badge variant="secondary">{attemptStatusLabels[a.status] ?? a.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState description="هنوز در آزمونی شرکت نکرده‌اید." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
