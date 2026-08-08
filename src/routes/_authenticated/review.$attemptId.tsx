import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Circle,
  Award,
  Clock,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { explainAnswer } from "@/lib/ai.functions";
import { ReportQuestionButton } from "@/components/report-question-button";
import { useSubscription } from "@/lib/subscription";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InlineLoading, ErrorState } from "@/components/ui-states";
import { formatJalaliDateTime, attemptStatusLabels } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/review/$attemptId")({
  head: () => ({
    meta: [
      { title: "مرور آزمون | سامانه آزمون آنلاین" },
      { name: "description", content: "مرور پاسخ‌ها و پاسخ‌های صحیح آزمون." },
    ],
  }),
  component: ReviewPage,
});

type ReviewItem = {
  question_id: string;
  question_text: string;
  score: number;
  selected_option_id: string | null;
  correct_option_id: string | null;
  options: { id: string; option_text: string }[];
};

type ReviewData = {
  attempt: {
    id: string;
    status: string;
    earned_score: number;
    total_score: number;
    correct_count: number;
    incorrect_count: number;
    unanswered_count: number;
    passed: boolean;
    started_at: string;
    submitted_at: string | null;
  };
  exam: {
    id: string;
    title: string;
    passing_score: number;
    show_correct_answers: boolean;
  };
  can_review: boolean;
  items: ReviewItem[];
};

function ReviewPage() {
  const { attemptId } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["review", attemptId],
    queryFn: async (): Promise<ReviewData> => {
      const { data, error } = await supabase.rpc("get_attempt_review", {
        p_attempt_id: attemptId,
      });
      if (error) throw error;
      return data as unknown as ReviewData;
    },
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <InlineLoading />;
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data) return <ErrorState message="اطلاعات آزمون یافت نشد." />;

  const { attempt, exam, can_review, items } = data;
  const scorePercent = attempt.total_score > 0
    ? Math.round((attempt.earned_score / attempt.total_score) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        to="/results"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowRight className="size-4" />
        بازگشت به نتایج
      </Link>

      <Card className="card-elevated">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{exam.title}</CardTitle>
              <CardDescription>
                {attemptStatusLabels[attempt.status] ?? attempt.status}
                {" — "}
                {formatJalaliDateTime(attempt.submitted_at ?? attempt.started_at)}
              </CardDescription>
            </div>
            {attempt.status !== "in_progress" && (
              <Badge variant={attempt.passed ? "default" : "destructive"} className="text-sm">
                {attempt.passed ? "قبول" : "مردود"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border p-4 text-center">
              <Award className="mx-auto mb-1 size-5 text-primary" />
              <p className="text-2xl font-bold">
                {attempt.earned_score} / {attempt.total_score}
              </p>
              <p className="text-xs text-muted-foreground">نمره</p>
            </div>
            <div className="rounded-xl border p-4 text-center">
              <CheckCircle2 className="mx-auto mb-1 size-5 text-green-600" />
              <p className="text-2xl font-bold">{attempt.correct_count}</p>
              <p className="text-xs text-muted-foreground">پاسخ صحیح</p>
            </div>
            <div className="rounded-xl border p-4 text-center">
              <XCircle className="mx-auto mb-1 size-5 text-destructive" />
              <p className="text-2xl font-bold">
                {attempt.incorrect_count + attempt.unanswered_count}
              </p>
              <p className="text-xs text-muted-foreground">نادرست / بدون پاسخ</p>
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">درصد نمره</span>
              <span className="font-medium">{scorePercent}%</span>
            </div>
            <Progress value={scorePercent} />
          </div>
        </CardContent>
      </Card>

      {can_review ? (
        <div className="space-y-3">
          {items.map((item, i) => (
            <QuestionCard
              key={item.question_id}
              item={item}
              index={i}
              examId={exam.id}
              attemptId={attempt.id}
            />
          ))}

        </div>
      ) : (
        <Card className="card-elevated">
          <CardContent className="p-6 text-center">
            <Clock className="mx-auto mb-2 size-8 text-muted-foreground" />
            <p className="font-medium">مرور پاسخ‌ها در دسترس نیست</p>
            <p className="text-sm text-muted-foreground">
              نمایش پاسخ‌های صحیح برای این آزمون غیرفعال است یا آزمون هنوز پایان نیافته است.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuestionCard({
  item,
  index,
  examId,
  attemptId,
}: {
  item: ReviewItem;
  index: number;
  examId?: string;
  attemptId?: string;
}) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const { hasAccess } = useSubscription();

  const isCorrect = item.selected_option_id === item.correct_option_id;
  const isUnanswered = !item.selected_option_id;

  const correctOption = item.options.find((o) => o.id === item.correct_option_id);
  const selectedOption = item.options.find((o) => o.id === item.selected_option_id);

  const askAI = useMutation({
    mutationFn: async () => {
      if (!attemptId) throw new Error("شناسه آزمون یافت نشد");
      return await explainAnswer({
        data: {
          question_id: item.question_id,
          attempt_id: attemptId,
        },
      });
    },


    onSuccess: (data) => {
      setExplanation(data.explanation || null);
      setShowExplanation(true);
    },
    onError: (err: Error) => toast.error(err.message || "خطا در ارتباط با هوش مصنوعی"),
  });

  const toggleExplanation = () => {
    if (explanation) {
      setShowExplanation((v) => !v);
    } else {
      askAI.mutate();
    }
  };

  return (
    <Card className="card-elevated">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-7">
            <span className="ms-1 text-muted-foreground">{index + 1}.</span>
            {item.question_text}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">بارم {item.score}</span>
            {isUnanswered ? (
              <Circle className="size-4 text-muted-foreground" />
            ) : isCorrect ? (
              <CheckCircle2 className="size-4 text-green-600" />
            ) : (
              <XCircle className="size-4 text-destructive" />
            )}
          </div>
        </div>
        <div className="space-y-2">
          {item.options.map((opt) => {
            const isSelected = opt.id === item.selected_option_id;
            const isCorrectOpt = opt.id === item.correct_option_id;
            return (
              <div
                key={opt.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-sm",
                  isCorrectOpt && "border-green-600 bg-green-50 dark:bg-green-950/30",
                  isSelected && !isCorrectOpt && "border-destructive bg-destructive/5",
                  !isCorrectOpt && !isSelected && "border-border",
                )}
              >
                <span
                  className={cn(
                    "size-4 shrink-0 rounded-full border",
                    isCorrectOpt && "border-green-600 bg-green-600",
                    isSelected && !isCorrectOpt && "border-destructive bg-destructive",
                    !isCorrectOpt && !isSelected && "border-muted-foreground",
                  )}
                />
                <span className="flex-1">{opt.option_text}</span>
                {isCorrectOpt && (
                  <Badge variant="outline" className="text-green-600">
                    پاسخ صحیح
                  </Badge>
                )}
                {isSelected && !isCorrectOpt && (
                  <Badge variant="outline" className="text-destructive">
                    پاسخ شما
                  </Badge>
                )}
              </div>
            );
          })}
          {isUnanswered && (
            <p className="text-xs text-muted-foreground">به این سوال پاسخ داده نشده است.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleExplanation}
            disabled={askAI.isPending || !hasAccess}
            title={hasAccess ? undefined : "برای استفاده از توضیح هوش مصنوعی، اشتراک فعال لازم است"}
            className="gap-2"
          >
            {askAI.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال دریافت پاسخ...
              </>
            ) : (
              <>
                <Sparkles className="size-4 text-primary" />
                {explanation ? "توضیح هوش مصنوعی" : "پرسیدن از هوش مصنوعی"}
              </>
            )}
            {explanation && (
              showExplanation
                ? <ChevronUp className="size-4" />
                : <ChevronDown className="size-4" />
            )}
          </Button>
          <ReportQuestionButton
            questionId={item.question_id}
            examId={examId ?? null}
            attemptId={attemptId ?? null}
          />
        </div>

        {showExplanation && explanation && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="size-4" />
              توضیح تشریحی
            </div>
            <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
              {explanation}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
