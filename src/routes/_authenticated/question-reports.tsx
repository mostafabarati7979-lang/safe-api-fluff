import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatJalaliDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/question-reports")({
  head: () => ({
    meta: [
      { title: "گزارش خطای سوالات | سامانه آزمون آنلاین" },
      { name: "description", content: "بررسی و رسیدگی به گزارش‌های خطای ثبت‌شده توسط داوطلبان." },
      { property: "og:title", content: "گزارش خطای سوالات" },
      { property: "og:description", content: "مدیریت گزارش‌های خطای سوالات آزمون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <QuestionReportsPage />
    </RequireAdmin>
  ),
});

export const reasonLabels: Record<string, string> = {
  wrong_answer: "پاسخ صحیح اشتباه است",
  typo: "غلط تایپی / نگارشی",
  unclear: "صورت سوال مبهم است",
  duplicate: "سوال تکراری است",
  other: "سایر موارد",
};

const statusLabels: Record<string, string> = {
  open: "در انتظار بررسی",
  reviewed: "بررسی شد",
  rejected: "رد شد",
};

type Report = {
  id: string;
  question_id: string;
  question_text: string | null;
  exam_title: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  reason: string;
  description: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

function QuestionReportsPage() {
  const qc = useQueryClient();
  const [active, setActive] = useState<Report | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["question-reports"],
    queryFn: async (): Promise<Report[]> => {
      const { data, error } = await supabase.rpc("list_question_reports");
      if (error) throw error;
      return (data ?? []) as Report[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("question_reports")
        .update({ status, admin_note: note.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("وضعیت گزارش به‌روزرسانی شد");
      setActive(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["question-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openReport = (r: Report) => {
    setActive(r);
    setNote(r.admin_note ?? "");
  };

  return (
    <>
      <PageHeader title="گزارش خطای سوالات" description="گزارش‌های ثبت‌شده توسط داوطلبان" />
      <Card className="card-elevated">
        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <InlineLoading />
          ) : error ? (
            <ErrorState message={(error as Error).message} />
          ) : !data || data.length === 0 ? (
            <EmptyState description="هنوز گزارشی ثبت نشده است." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>سوال</TableHead>
                    <TableHead>نوع خطا</TableHead>
                    <TableHead>آزمون</TableHead>
                    <TableHead>گزارش‌دهنده</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-sm truncate font-medium">
                        {r.question_text ?? "—"}
                      </TableCell>
                      <TableCell>{reasonLabels[r.reason] ?? r.reason}</TableCell>
                      <TableCell className="text-muted-foreground">{r.exam_title ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.reporter_name || r.reporter_email || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "open"
                              ? "destructive"
                              : r.status === "reviewed"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {statusLabels[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatJalaliDateTime(r.created_at)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => openReport(r)}>
                          <Flag className="size-4" />
                          بررسی
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>بررسی گزارش خطا</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">متن سوال</p>
                <p className="leading-7">{active.question_text ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">نوع خطا</p>
                <p>{reasonLabels[active.reason] ?? active.reason}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">توضیح داوطلب</p>
                <p className="whitespace-pre-wrap leading-7">{active.description || "—"}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-note">یادداشت مدیر</Label>
                <Textarea
                  id="admin-note"
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => active && setStatus.mutate({ id: active.id, status: "rejected" })}
              disabled={setStatus.isPending}
            >
              <X className="size-4" />
              رد گزارش
            </Button>
            <Button
              onClick={() => active && setStatus.mutate({ id: active.id, status: "reviewed" })}
              disabled={setStatus.isPending}
            >
              <Check className="size-4" />
              بررسی شد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
