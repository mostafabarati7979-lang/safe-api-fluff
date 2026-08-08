import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubscription } from "@/lib/subscription";

type Props = {
  examId: string | null;
  examTitle?: string | undefined;
  onOpenChange: (open: boolean) => void;
};

export function StartExamDialog({ examId, examTitle, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const { hasAccess } = useSubscription();

  const topics = useQuery({
    queryKey: ["exam-topics", examId],
    enabled: Boolean(examId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exam_topics", { p_exam_id: examId! });
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = topics.data ?? [];
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const start = async (all: boolean) => {
    if (!examId) return;
    if (!hasAccess) {
      toast.error("اشتراک شما منقضی شده است. برای شروع آزمون، اشتراک خود را تمدید کنید.");
      return;
    }
    setStarting(true);
    const { data, error } = await supabase.rpc("start_attempt", {
      p_exam_id: examId,
      ...(all || selected.length === 0 ? {} : { p_category_ids: selected }),
    });
    setStarting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onOpenChange(false);
    setSelected([]);
    void navigate({ to: "/attempt/$attemptId", params: { attemptId: data as string } });
  };

  return (
    <Dialog open={Boolean(examId)} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="size-4" />
            انتخاب مباحث آزمون
          </DialogTitle>
          <DialogDescription>
            {examTitle
              ? `می‌توانید فقط در مباحث خاصی از «${examTitle}» شرکت کنید.`
              : "می‌توانید فقط در مباحث خاصی از این آزمون شرکت کنید."}
          </DialogDescription>
        </DialogHeader>

        {topics.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">مبحثی برای این آزمون تعریف نشده است.</p>
        ) : (
          <div className="space-y-2">
            {list.map((t) => (
              <label
                key={t.category_id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Checkbox
                    checked={selected.includes(t.category_id)}
                    onCheckedChange={() => toggle(t.category_id)}
                  />
                  {t.category_name}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {t.question_count} سوال
                </Badge>
              </label>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={starting || !hasAccess} onClick={() => void start(true)}>
            شرکت در کل آزمون
          </Button>
          <Button
            disabled={starting || selected.length === 0 || !hasAccess}
            onClick={() => void start(false)}
          >
            {starting ? <Loader2 className="size-4 animate-spin" /> : "شروع مباحث انتخاب‌شده"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
