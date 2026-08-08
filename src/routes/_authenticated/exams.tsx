import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Settings, Clock, GraduationCap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
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
import {
  PageHeader,
  InlineLoading,
  EmptyState,
  ErrorState,
  RequireAdmin,
} from "@/components/ui-states";
import { Checkbox } from "@/components/ui/checkbox";
import { StartExamDialog } from "@/components/start-exam-dialog";
import { examStatusLabels, slugify } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/exams")({
  head: () => ({
    meta: [
      { title: "آزمون‌ها | سامانه آزمون آنلاین استخدامی" },
      { name: "description", content: "مدیریت آزمون‌های استخدامی، ایجاد و ویرایش آزمون‌ها." },
      { property: "og:title", content: "آزمون‌ها" },
      { property: "og:description", content: "مدیریت آزمون‌های سامانه." },
    ],
  }),
  component: ExamsPage,
});

type ExamRow = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  status: string;
  passing_score: number;
  access_type: string;
  category_id: string | null;
  categories: { name: string } | null;
  exam_categories: { category_id: string; categories: { name: string } | null }[];
};

type ExamStatus = "draft" | "published" | "finished";
type AccessType = "public" | "private";

type FormState = {
  id: string;
  title: string;
  description: string;
  duration_minutes: string;
  passing_score: string;
  status: ExamStatus;
  access_type: AccessType;
  max_attempts: string;
  show_correct_answers: boolean;
  randomize_questions: boolean;
  randomize_options: boolean;
  category_id: string;
  category_ids: string[];
};

const emptyForm: FormState = {
  id: "",
  title: "",
  description: "",
  duration_minutes: "30",
  passing_score: "50",
  status: "draft",
  access_type: "public",
  max_attempts: "1",
  show_correct_answers: true,
  randomize_questions: false,
  randomize_options: false,
  category_id: "",
  category_ids: [],
};

function ExamsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [startExam, setStartExam] = useState<ExamRow | null>(null);

  const categories = useQuery({
    queryKey: ["categories", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["exams"],
    queryFn: async (): Promise<ExamRow[]> => {
      const { data, error } = await supabase
        .from("exams")
        .select(
          "id, title, description, duration_minutes, status, passing_score, access_type, category_id, categories!exams_category_id_fkey(name), exam_categories!exam_categories_exam_id_fkey(category_id, categories!exam_categories_category_id_fkey(name))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ExamRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const title = form.title.trim();
      if (!title) throw new Error("عنوان آزمون الزامی است");
      const duration = Number(form.duration_minutes);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("مدت زمان نامعتبر است");
      const passing = Number(form.passing_score);
      if (!Number.isFinite(passing) || passing < 0) throw new Error("حد نصاب نامعتبر است");
      const maxAtt = Number(form.max_attempts);
      if (!Number.isFinite(maxAtt) || maxAtt <= 0) throw new Error("حداکثر تعداد شرکت نامعتبر است");

      const { data, error } = await supabase.rpc("save_exam", {
        p_id: (form.id || null) as unknown as string,
        p_title: title,
        p_slug: slugify(title),
        p_description: (form.description.trim() || null) as unknown as string,
        p_duration_minutes: duration,
        p_passing_score: passing,
        p_status: form.status,
        p_access_type: form.access_type,
        p_max_attempts: maxAtt,
        p_show_correct_answers: form.show_correct_answers,
        p_randomize_questions: form.randomize_questions,
        p_randomize_options: form.randomize_options,
        p_category_id: (form.category_id || null) as unknown as string,
      });
      if (error) throw error;
      const examId = (data as string | null) ?? form.id;
      if (examId) {
        const cats = [...new Set([...form.category_ids, ...(form.category_id ? [form.category_id] : [])])];
        const { error: catError } = await supabase.rpc("set_exam_categories", {
          p_exam_id: examId,
          p_category_ids: cats,
        });
        if (catError) throw catError;
      }
    },
    onSuccess: () => {
      toast.success("آزمون ذخیره شد");
      setOpen(false);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteExam = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_exam", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("آزمون حذف شد");
      setDeleteId(null);
      void qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (e: ExamRow) => {
    setForm({
      id: e.id,
      title: e.title,
      description: e.description ?? "",
      duration_minutes: String(e.duration_minutes),
      passing_score: String(e.passing_score),
      status: e.status as ExamStatus,
      access_type: e.access_type as AccessType,
      max_attempts: "1",
      show_correct_answers: true,
      randomize_questions: false,
      randomize_options: false,
      category_id: e.category_id ?? "",
      category_ids: (e.exam_categories ?? []).map((ec) => ec.category_id),
    });
    setOpen(true);
  };

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

  const isAdmin = role === "admin";

  return (
    <>
      <PageHeader
        title="آزمون‌ها"
        description={isAdmin ? "مدیریت و ایجاد آزمون‌های سامانه" : "فهرست آزمون‌های در دسترس"}
        action={
          isAdmin ? (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              آزمون جدید
            </Button>
          ) : undefined
        }
      />
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
                    <Badge variant="secondary">{examStatusLabels[e.status] ?? e.status}</Badge>
                  </div>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{e.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cats.length > 0 ? (
                      cats.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">عمومی</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {e.duration_minutes} دقیقه
                    </span>
                    <span className="flex items-center gap-1">
                      <GraduationCap className="size-3.5" />
                      حد نصاب: {e.passing_score}
                    </span>
                    {e.access_type === "private" && (
                      <Badge variant="outline" className="text-xs">خصوصی</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {e.status === "published" ? (
                      <Button className="flex-1" variant="default" onClick={() => setStartExam(e)}>
                        شروع آزمون
                      </Button>
                    ) : null}
                    {isAdmin ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void navigate({ to: "/exams/$examId", params: { examId: e.id } })}
                        >
                          <Settings className="size-4" />
                          مدیریت
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(e)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => setDeleteId(e.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState description="آزمونی ثبت نشده است." />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش آزمون" : "آزمون جدید"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exam-title">عنوان آزمون</Label>
              <Input
                id="exam-title"
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exam-desc">توضیحات</Label>
              <Textarea
                id="exam-desc"
                rows={3}
                maxLength={2000}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>مباحث (دسته‌بندی‌های) آزمون</Label>
              <p className="text-xs text-muted-foreground">
                داوطلب می‌تواند فقط در مباحث انتخاب‌شده شرکت کند.
              </p>
              <div className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                {(categories.data ?? []).length === 0 ? (
                  <span className="text-xs text-muted-foreground">دسته‌بندی‌ای ثبت نشده است.</span>
                ) : (
                  (categories.data ?? []).map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.category_ids.includes(c.id)}
                        onCheckedChange={() =>
                          setForm((f) => ({
                            ...f,
                            category_ids: f.category_ids.includes(c.id)
                              ? f.category_ids.filter((x) => x !== c.id)
                              : [...f.category_ids, c.id],
                          }))
                        }
                      />
                      {c.name}
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>دسته‌بندی اصلی</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-duration">مدت زمان (دقیقه)</Label>
                <Input
                  id="exam-duration"
                  type="number"
                  min={1}
                  value={form.duration_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-passing">حد نصاب قبولی (درصد)</Label>
                <Input
                  id="exam-passing"
                  type="number"
                  min={0}
                  max={100}
                  value={form.passing_score}
                  onChange={(e) => setForm((f) => ({ ...f, passing_score: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-max-attempts">حداکثر تعداد شرکت</Label>
                <Input
                  id="exam-max-attempts"
                  type="number"
                  min={1}
                  value={form.max_attempts}
                  onChange={(e) => setForm((f) => ({ ...f, max_attempts: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>وضعیت</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as ExamStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">پیش‌نویس</SelectItem>
                    <SelectItem value="published">منتشر شده</SelectItem>
                    <SelectItem value="finished">پایان‌یافته</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نوع دسترسی</Label>
                <Select
                  value={form.access_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, access_type: v as AccessType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">عمومی</SelectItem>
                    <SelectItem value="private">خصوصی (دعوت‌محور)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.show_correct_answers}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, show_correct_answers: v }))}
                />
                نمایش پاسخ صحیح پس از آزمون
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.randomize_questions}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, randomize_questions: v }))}
                />
                تصادفی‌سازی ترتیب سوالات
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.randomize_options}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, randomize_options: v }))}
                />
                تصادفی‌سازی ترتیب گزینه‌ها
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "ذخیره آزمون"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف آزمون</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف این آزمون مطمئن هستید؟ تمام سوالات مرتبط و شرکت‌های ثبت‌شده نیز حذف خواهند شد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteExam.mutate(deleteId)}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StartExamDialog
        examId={startExam?.id ?? null}
        examTitle={startExam?.title}
        onOpenChange={(o) => !o && setStartExam(null)}
      />
    </>
  );
}
