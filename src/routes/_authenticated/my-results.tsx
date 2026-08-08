import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, InlineLoading, EmptyState, ErrorState } from "@/components/ui-states";
import { formatJalali, attemptStatusLabels } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-results")({
  head: () => ({
    meta: [
      { title: "نتایج من | سامانه آزمون آنلاین" },
      { name: "description", content: "کارنامه و نتایج آزمون‌های شما." },
    ],
  }),
  component: MyResultsPage,
});

function MyResultsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select(
          "id, status, earned_score, total_score, passed, submitted_at, started_at, exams(title)",
        )
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader title="نتایج من" description="کارنامه آزمون‌های شرکت‌شده" />
      {isLoading ? (
        <InlineLoading />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : data && data.length > 0 ? (
        <Card className="card-elevated">
          <CardContent className="p-0">
            <ul className="divide-y">
              {data.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"
                >
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
                    <Badge variant="secondary">
                      {attemptStatusLabels[a.status] ?? a.status}
                    </Badge>
                    {a.status !== "in_progress" && (
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/review/$attemptId" params={{ attemptId: a.id }}>
                          <Eye className="size-4" />
                          مرور
                        </Link>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <EmptyState description="هنوز در آزمونی شرکت نکرده‌اید." />
      )}
    </>
  );
}
