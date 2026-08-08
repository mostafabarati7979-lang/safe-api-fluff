import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flag, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const reasons = [
  { value: "wrong_answer", label: "پاسخ صحیح اشتباه است" },
  { value: "typo", label: "غلط تایپی / نگارشی" },
  { value: "unclear", label: "صورت سوال مبهم است" },
  { value: "duplicate", label: "سوال تکراری است" },
  { value: "other", label: "سایر موارد" },
];

export function ReportQuestionButton({
  questionId,
  examId,
  attemptId,
}: {
  questionId: string;
  examId?: string | null;
  attemptId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("wrong_answer");
  const [description, setDescription] = useState("");
  const [sent, setSent] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const args: {
        p_question_id: string;
        p_reason: string;
        p_description?: string;
        p_exam_id?: string;
        p_attempt_id?: string;
      } = { p_question_id: questionId, p_reason: reason };
      const desc = description.trim();
      if (desc) args.p_description = desc;
      if (examId) args.p_exam_id = examId;
      if (attemptId) args.p_attempt_id = attemptId;
      const { error } = await supabase.rpc("report_question", args);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("گزارش شما ثبت شد و توسط مدیر بررسی می‌شود");
      setOpen(false);
      setDescription("");
      setSent(true);
    },
    onError: (e: Error) => toast.error(e.message || "ثبت گزارش انجام نشد"),
  });

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
        disabled={sent}
      >
        <Flag className="size-4" />
        {sent ? "گزارش ثبت شد" : "گزارش خطا"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>گزارش خطا در سوال</DialogTitle>
            <DialogDescription>
              اگر در این سوال یا پاسخ آن اشکالی می‌بینید، برای مدیر سامانه گزارش کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>نوع خطا</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-desc">توضیح (اختیاری)</Label>
              <Textarea
                id="report-desc"
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="توضیح کوتاهی درباره اشکال این سوال بنویسید..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="gap-2">
              {submit.isPending && <Loader2 className="size-4 animate-spin" />}
              ثبت گزارش
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
