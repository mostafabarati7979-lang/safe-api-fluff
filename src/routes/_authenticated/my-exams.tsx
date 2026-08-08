import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, InlineLoading, EmptyState, ErrorState } from "@/components/ui-states";
import { StartExamDialog } from "@/components/start-exam-dialog";
import { SubscriptionBanner } from "@/components/subscription-badges";
import { useSubscription } from "@/lib/subscription";

export const Route = createFileRoute("/_authenticated/my-exams")({
  head: () => ({
    meta: [
      { title: "آزمون‌های من | سامانه آزمون آنلاین" },
      { name: "description", content: "آزمون‌های در دسترس شما برای شرکت." },
    ],
  }),
  component: MyExamsPage,
});

type ExamRow = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  passing_score: number;
  category_id: string | null;
  categories: { name: string } | null;
  exam_categories: { category_id: string; categories: { name: string } | null }[];
};

function MyExamsPage() {
  const [startExam, setStartExam] = useState<ExamRow | null>(null);
  const { hasAccess } = useSubscription();

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-exams"],
    queryFn: async (): Promise<ExamRow[]> => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, description, duration_minutes, passing_score, category_id, categories!exams_category_id_fkey(name), exam_categories!exam_categories_exam_id_fkey(category_id, categories!exam_categories_category_id_fkey(name))")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ExamRow[];
    },
  });

  const getCategories = (e: ExamRow): string[] => {
    const names = new Set<string>();
    if (e.categories?.name) names.add(e.categories.name);
    if (e.exam_categories) {
      for (const ec of e.exam_categories) {
        if (ec.categories?.name) names.add(ec.categories.name);
      }
    }
    return [...names];
  };

  return (
    <>
      <PageHeader title="آزمون‌های در دسترس" description="آزمون‌هایی که می‌توانید در آن‌ها شرکت کنید" />
      <SubscriptionBanner />
      {isLoading ? (
        <InlineLoading />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : data && data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((e) => {
            const cats = getCategories(e);
            return (
            <Card key={e.id} className="card-elevated">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{e.title}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cats.length > 0 ? (
                    cats.map((c) => (
                      <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                    ))
                  ) : (
                    <Badge variant="secondary" className="text-xs">عمومی</Badge>
                  )}
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">{e.description}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {e.duration_minutes} دقیقه
                  </span>
                  <span className="flex items-center gap-1">
                    <GraduationCap className="size-3.5" />
                    حد نصاب: {e.passing_score}
                  </span>
                </div>
                <Button className="w-full" disabled={!hasAccess} onClick={() => setStartExam(e)}>
                  {hasAccess ? "شروع آزمون" : "نیازمند اشتراک فعال"}
                </Button>
              </CardContent>
            </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState description="در حال حاضر آزمون فعالی برای شما وجود ندارد." />
      )}
      <StartExamDialog
        examId={startExam?.id ?? null}
        examTitle={startExam?.title}
        onOpenChange={(o) => !o && setStartExam(null)}
      />
    </>
  );
}
