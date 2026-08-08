import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, ClipboardList, Trophy, TrendingUp, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageHeader,
  InlineLoading,
  EmptyState,
  ErrorState,
  RequireAdmin,
} from "@/components/ui-states";
import { formatJalali, percent } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "گزارش‌ها | سامانه آزمون آنلاین" },
      { name: "description", content: "گزارش‌های مدیریتی آزمون‌ها، نرخ قبولی و میانگین نمرات." },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <ReportsPage />
    </RequireAdmin>
  ),
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

function ReportsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const [attempts, exams] = await Promise.all([
        supabase
          .from("exam_attempts")
          .select("id, exam_id, status, earned_score, total_score, passed, submitted_at, exams(title)")
          .order("submitted_at", { ascending: false })
          .limit(200),
        supabase.from("exams").select("id, title, status"),
      ]);
      if (attempts.error) throw attempts.error;
      if (exams.error) throw exams.error;
      const all = attempts.data ?? [];
      const submitted = all.filter((a) => a.status === "submitted");
      const passed = submitted.filter((a) => a.passed);
      const avgScore =
        submitted.length > 0
          ? Math.round(
              (submitted.reduce((s, a) => s + (a.earned_score ?? 0), 0) / submitted.length) * 10,
            ) / 10
          : 0;
      const passRate = percent(passed.length, submitted.length);

      const byExam = new Map<string, { title: string; total: number; passed: number; avg: number }>();
      for (const a of submitted) {
        const title = (a.exams as { title: string } | null)?.title ?? "—";
        const existing = byExam.get(a.exam_id) ?? { title, total: 0, passed: 0, avg: 0 };
        existing.total++;
        if (a.passed) existing.passed++;
        existing.avg += a.earned_score ?? 0;
        byExam.set(a.exam_id, existing);
      }
      const examRows = Array.from(byExam.entries()).map(([id, v]) => ({
        id,
        title: v.title,
        total: v.total,
        passed: v.passed,
        passRate: percent(v.passed, v.total),
        avg: v.total > 0 ? Math.round((v.avg / v.total) * 10) / 10 : 0,
      }));

      return {
        totalAttempts: all.length,
        submittedCount: submitted.length,
        passedCount: passed.length,
        passRate,
        avgScore,
        examRows,
      };
    },
  });

  if (isLoading) return <InlineLoading />;
  if (error) return <ErrorState message={(error as Error).message} />;

  return (
    <>
      <PageHeader title="گزارش‌های مدیریتی" description="نمای کلی عملکرد آزمون‌ها" />
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="کل شرکت‌ها" value={data!.totalAttempts} icon={ClipboardList} />
          <StatCard title="ثبت‌شده" value={data!.submittedCount} icon={Trophy} />
          <StatCard title="نرخ قبولی" value={`${data!.passRate}٪`} icon={TrendingUp} />
          <StatCard title="میانگین نمره" value={data!.avgScore} icon={Award} />
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>گزارش به‌تفکیک آزمون</CardTitle>
            <CardDescription>نرخ قبولی و میانگین نمرات هر آزمون</CardDescription>
          </CardHeader>
          <CardContent>
            {data!.examRows.length === 0 ? (
              <EmptyState description="هنوز آزمونی برگزار نشده است." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>عنوان آزمون</TableHead>
                      <TableHead>شرکت‌کنندگان</TableHead>
                      <TableHead>قبول‌شده</TableHead>
                      <TableHead>نرخ قبولی</TableHead>
                      <TableHead>میانگین نمره</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.examRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell>{r.total}</TableCell>
                        <TableCell>{r.passed}</TableCell>
                        <TableCell>
                          <Badge variant={r.passRate >= 50 ? "default" : "destructive"}>
                            {r.passRate}٪
                          </Badge>
                        </TableCell>
                        <TableCell>{r.avg}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
