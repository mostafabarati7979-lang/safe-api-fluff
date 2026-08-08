import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InlineLoading, ErrorState } from "@/components/ui-states";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/attempt/$attemptId")({
  head: () => ({
    meta: [
      { title: "برگزاری آزمون | سامانه آزمون آنلاین" },
      { name: "description", content: "صفحه پاسخ‌گویی به سوالات آزمون با زمان‌سنج و ثبت خودکار پاسخ‌ها." },
      { property: "og:title", content: "برگزاری آزمون" },
      { property: "og:description", content: "پاسخ‌گویی آنلاین به سوالات آزمون استخدامی." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AttemptPage,
});

type Option = { id: string; option_text: string };
type Question = {
  id: string;
  question_text: string;
  score: number;
  options: Option[];
  selected_option_id: string | null;
};
type AttemptState = {
  attempt: { id: string; status: string; started_at: string; expires_at: string; server_now: string };
  exam: { id: string; title: string; duration_minutes: number; passing_score: number };
  questions: Question[];
};

function AttemptPage() {
  const { attemptId } = Route.useParams();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: async (): Promise<AttemptState> => {
      const { data, error } = await supabase.rpc("get_attempt_state", { p_attempt_id: attemptId });
      if (error) throw error;
      return data as unknown as AttemptState;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, string> = {};
    for (const q of data.questions) if (q.selected_option_id) initial[q.id] = q.selected_option_id;
    setAnswers(initial);
    const skew = Date.now() - new Date(data.attempt.server_now).getTime();
    const tick = () =>
      setRemaining(
        Math.max(0, Math.floor((new Date(data.attempt.expires_at).getTime() + skew - Date.now()) / 1000)),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data]);

  const submit = async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_attempt", { p_attempt_id: attemptId });
    setSubmitting(false);
    if (error) {
      submittedRef.current = false;
      toast.error(error.message);
      return;
    }
    toast.success(auto ? "زمان آزمون پایان یافت و پاسخ‌ها ثبت شد" : "پاسخ‌های شما ثبت شد");
    void navigate({ to: "/results" });
  };

  useEffect(() => {
    if (data && remaining === 0 && !submittedRef.current) {
      const started = new Date(data.attempt.expires_at).getTime() < Date.now();
      if (started) void submit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, data]);

  const questions = data?.questions ?? [];
  const current = questions[index];
  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id]).length,
    [questions, answers],
  );

  const choose = async (questionId: string, optionId: string) => {
    setAnswers((a) => ({ ...a, [questionId]: optionId }));
    const { error } = await supabase.rpc("save_answer", {
      p_attempt_id: attemptId,
      p_question_id: questionId,
      p_option_id: optionId,
    });
    if (error) toast.error(error.message);
  };

  if (isLoading) return <InlineLoading />;
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data || !current) return <ErrorState message="سوالی برای این آزمون یافت نشد." />;

  const low = remaining <= 60;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card className="card-elevated">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-bold">{data.exam.title}</p>
            <p className="text-xs text-muted-foreground">
              پاسخ داده‌شده: {answeredCount} از {questions.length}
            </p>
          </div>
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-lg tabular-nums",
              low && "border-destructive text-destructive",
            )}
          >
            <Clock className="size-4" />
            {formatDuration(remaining)}
          </div>
        </CardContent>
      </Card>

      <Progress value={(answeredCount / questions.length) * 100} />

      <Card className="card-elevated">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base font-medium leading-8">
              <span className="ms-2 text-muted-foreground">{index + 1}.</span>
              {current.question_text}
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">بارم {current.score}</span>
          </div>

          <div className="space-y-2">
            {current.options.map((o) => {
              const selected = answers[current.id] === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => void choose(current.id, o.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors hover:bg-accent",
                    selected && "border-primary bg-primary/10",
                  )}
                >
                  <span
                    className={cn(
                      "size-4 shrink-0 rounded-full border",
                      selected && "border-primary bg-primary",
                    )}
                  />
                  <span className="text-sm">{o.option_text}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              سوال قبلی
            </Button>
            {index < questions.length - 1 ? (
              <Button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>
                سوال بعدی
              </Button>
            ) : (
              <Button onClick={() => setConfirmOpen(true)} disabled={submitting}>
                پایان و ثبت آزمون
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardContent className="flex flex-wrap gap-2 p-4">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`سوال ${i + 1}`}
              className={cn(
                "size-9 rounded-lg border text-sm",
                answers[q.id] && "bg-primary/10 border-primary",
                i === index && "ring-2 ring-primary",
              )}
            >
              {i + 1}
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={submitting}>
          <AlertTriangle className="size-4" />
          پایان آزمون
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ثبت نهایی آزمون</AlertDialogTitle>
            <AlertDialogDescription>
              {questions.length - answeredCount > 0
                ? `${questions.length - answeredCount} سوال بدون پاسخ باقی مانده است. پس از ثبت، امکان تغییر پاسخ‌ها وجود ندارد.`
                : "پس از ثبت، امکان تغییر پاسخ‌ها وجود ندارد."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>بازگشت</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit(false)}>ثبت نهایی</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
