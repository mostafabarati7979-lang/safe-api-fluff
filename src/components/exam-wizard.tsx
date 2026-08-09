import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Shuffle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { InlineLoading } from "@/components/ui-states";
import { difficultyLabels, slugify } from "@/lib/format";

type SubjectRow = { id: string; name: string };
type SubjectConfig = {
  question_count: string;
  coefficient: string;
  display_order: string;
  time_limit_minutes: string;
  negative_marking: boolean;
};

type BasicForm = {
  title: string;
  description: string;
  category_id: string;
  organization_id: string;
  year: string;
  period: string;
  round: string;
  level: string;
  is_free: boolean;
  price: string;
  duration_minutes: string;
  passing_score: string;
  max_attempts: string;
  status: string;
  access_type: string;
  show_correct_answers: boolean;
  randomize_questions: boolean;
  randomize_options: boolean;
  meta_title: string;
  meta_description: string;
  keywords: string;
};

const emptyBasic: BasicForm = {
  title: "",
  description: "",
  category_id: "",
  organization_id: "",
  year: "",
  period: "",
  round: "",
  level: "",
  is_free: true,
  price: "0",
  duration_minutes: "90",
  passing_score: "50",
  max_attempts: "1",
  status: "draft",
  access_type: "public",
  show_correct_answers: true,
  randomize_questions: false,
  randomize_options: false,
  meta_title: "",
  meta_description: "",
  keywords: "",
};

const defaultConfig: SubjectConfig = {
  question_count: "10",
  coefficient: "1",
  display_order: "1",
  time_limit_minutes: "",
  negative_marking: false,
};

const steps = ["اطلاعات پایه", "انتخاب درس‌ها", "تنظیمات درس‌ها", "انتخاب سوالات"];

export function ExamWizard({
  open,
  examId,
  onOpenChange,
}: {
  open: boolean;
  examId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [basic, setBasic] = useState<BasicForm>(emptyBasic);
  const [selected, setSelected] = useState<string[]>([]);
  const [configs, setConfigs] = useState<Record<string, SubjectConfig>>({});
  const [savedExamId, setSavedExamId] = useState<string | null>(null);
  const [activeSubject, setActiveSubject] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [randomCount, setRandomCount] = useState("10");

  const currentExamId = savedExamId ?? examId;

  const categories = useQuery({
    queryKey: ["categories", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, parent_id")
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const organizations = useQuery({
    queryKey: ["organizations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const subjects = useQuery({
    queryKey: ["subjects", "all"],
    queryFn: async (): Promise<SubjectRow[]> => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .order("display_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });

  const existing = useQuery({
    enabled: open && Boolean(examId),
    queryKey: ["exam-wizard", examId],
    queryFn: async () => {
      const { data: exam, error } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId!)
        .maybeSingle();
      if (error) throw error;
      const { data: es, error: esError } = await supabase
        .from("exam_subjects")
        .select("subject_id, question_count, coefficient, display_order, time_limit_minutes, negative_marking")
        .eq("exam_id", examId!)
        .order("display_order");
      if (esError) throw esError;
      return { exam, examSubjects: es ?? [] };
    },
  });

  useEffect(() => {
    if (!open) return;
    if (!examId) {
      setBasic(emptyBasic);
      setSelected([]);
      setConfigs({});
      setSavedExamId(null);
      setStep(0);
      return;
    }
    const e = existing.data?.exam;
    if (!e) return;
    setBasic({
      title: e.title,
      description: e.description ?? "",
      category_id: e.category_id ?? "",
      organization_id: e.organization_id ?? "",
      year: e.year ? String(e.year) : "",
      period: e.period ?? "",
      round: e.round ?? "",
      level: e.level ?? "",
      is_free: e.is_free,
      price: String(e.price ?? 0),
      duration_minutes: String(e.duration_minutes),
      passing_score: String(e.passing_score),
      max_attempts: String(e.max_attempts),
      status: e.status,
      access_type: e.access_type,
      show_correct_answers: e.show_correct_answers,
      randomize_questions: e.randomize_questions,
      randomize_options: e.randomize_options,
      meta_title: e.meta_title ?? "",
      meta_description: e.meta_description ?? "",
      keywords: e.keywords ?? "",
    });
    const rows = existing.data?.examSubjects ?? [];
    setSelected(rows.map((r) => r.subject_id));
    setConfigs(
      Object.fromEntries(
        rows.map((r) => [
          r.subject_id,
          {
            question_count: String(r.question_count),
            coefficient: String(r.coefficient),
            display_order: String(r.display_order),
            time_limit_minutes: r.time_limit_minutes ? String(r.time_limit_minutes) : "",
            negative_marking: r.negative_marking,
          },
        ]),
      ),
    );
    setSavedExamId(examId);
    setStep(0);
  }, [open, examId, existing.data]);

  const examSubjectRows = useQuery({
    enabled: open && step === 3 && Boolean(currentExamId),
    queryKey: ["exam-subject-rows", currentExamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_subjects")
        .select("id, subject_id, question_count, display_order, subjects(name)")
        .eq("exam_id", currentExamId!)
        .order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const rows = examSubjectRows.data;
    if (rows && rows.length > 0 && !rows.some((r) => r.subject_id === activeSubject)) {
      setActiveSubject(rows[0]!.subject_id);
    }
  }, [examSubjectRows.data, activeSubject]);

  const activeExamSubject = useMemo(
    () => (examSubjectRows.data ?? []).find((r) => r.subject_id === activeSubject) ?? null,
    [examSubjectRows.data, activeSubject],
  );

  const pool = useQuery({
    enabled: open && step === 3 && Boolean(activeSubject),
    queryKey: ["question-pool", activeSubject, difficulty],
    queryFn: async () => {
      let q = supabase
        .from("questions")
        .select("id, question_text, difficulty, default_score")
        .eq("subject_id", activeSubject)
        .eq("status", "active")
        .limit(300);
      if (difficulty !== "all") q = q.eq("difficulty", difficulty);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const attached = useQuery({
    enabled: open && step === 3 && Boolean(currentExamId),
    queryKey: ["exam-attached-questions", currentExamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_questions")
        .select("id, question_id, exam_subject_id, display_order")
        .eq("exam_id", currentExamId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const attachedIds = useMemo(
    () => new Set((attached.data ?? []).map((r) => r.question_id)),
    [attached.data],
  );

  const saveBasics = useMutation({
    mutationFn: async () => {
      const title = basic.title.trim();
      if (!title) throw new Error("عنوان آزمون الزامی است");
      if (selected.length === 0) throw new Error("حداقل یک درس انتخاب کنید");

      const { data, error } = await supabase.rpc("save_exam_v2", {
        p_id: (currentExamId ?? null) as unknown as string,
        p_title: title,
        p_slug: slugify(title),
        p_description: (basic.description.trim() || null) as unknown as string,
        p_duration_minutes: Number(basic.duration_minutes) || 30,
        p_passing_score: Number(basic.passing_score) || 50,
        p_status: basic.status,
        p_access_type: basic.access_type,
        p_max_attempts: Number(basic.max_attempts) || 1,
        p_show_correct_answers: basic.show_correct_answers,
        p_randomize_questions: basic.randomize_questions,
        p_randomize_options: basic.randomize_options,
        p_category_id: (basic.category_id || null) as unknown as string,
        p_organization_id: (basic.organization_id || null) as unknown as string,
        p_year: (basic.year ? Number(basic.year) : null) as unknown as number,
        p_period: basic.period,
        p_round: basic.round,
        p_level: basic.level,
        p_is_free: basic.is_free,
        p_price: Number(basic.price) || 0,
        p_meta_title: basic.meta_title,
        p_meta_description: basic.meta_description,
        p_keywords: basic.keywords,
      });
      if (error) throw error;
      const id = (data as string | null) ?? currentExamId;
      if (!id) throw new Error("ذخیره آزمون ناموفق بود");

      const rows = selected.map((sid, i) => {
        const c = configs[sid] ?? defaultConfig;
        return {
          subject_id: sid,
          question_count: Number(c.question_count) || 0,
          coefficient: Number(c.coefficient) || 1,
          display_order: Number(c.display_order) || i + 1,
          time_limit_minutes: c.time_limit_minutes || null,
          negative_marking: c.negative_marking,
        };
      });
      const { error: esError } = await supabase.rpc("set_exam_subjects", {
        p_exam_id: id,
        p_rows: rows,
      });
      if (esError) throw esError;
      return id;
    },
    onSuccess: (id) => {
      setSavedExamId(id);
      void qc.invalidateQueries({ queryKey: ["exams"] });
      void qc.invalidateQueries({ queryKey: ["exam-subject-rows"] });
      setStep(3);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleQuestion = useMutation({
    mutationFn: async (questionId: string) => {
      if (!currentExamId || !activeExamSubject) throw new Error("ابتدا آزمون را ذخیره کنید");
      if (attachedIds.has(questionId)) {
        const { error } = await supabase
          .from("exam_questions")
          .delete()
          .eq("exam_id", currentExamId)
          .eq("question_id", questionId);
        if (error) throw error;
      } else {
        const nextOrder = (attached.data ?? []).length + 1;
        const { error } = await supabase.from("exam_questions").insert({
          exam_id: currentExamId,
          question_id: questionId,
          exam_subject_id: activeExamSubject.id,
          score: 1,
          display_order: nextOrder,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["exam-attached-questions", currentExamId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addRandom = useMutation({
    mutationFn: async () => {
      if (!currentExamId || !activeExamSubject) throw new Error("ابتدا آزمون را ذخیره کنید");
      const count = Number(randomCount) || 0;
      const candidates = (pool.data ?? []).filter((q) => !attachedIds.has(q.id));
      if (candidates.length === 0) throw new Error("سوال جدیدی برای افزودن وجود ندارد");
      const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, count);
      let order = (attached.data ?? []).length;
      const rows = shuffled.map((q) => {
        order += 1;
        return {
          exam_id: currentExamId,
          question_id: q.id,
          exam_subject_id: activeExamSubject.id,
          score: q.default_score ?? 1,
          display_order: order,
        };
      });
      const { error } = await supabase.from("exam_questions").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} سوال به آزمون اضافه شد`);
      void qc.invalidateQueries({ queryKey: ["exam-attached-questions", currentExamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attachedPerSubject = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of attached.data ?? []) {
      if (!row.exam_subject_id) continue;
      map[row.exam_subject_id] = (map[row.exam_subject_id] ?? 0) + 1;
    }
    return map;
  }, [attached.data]);

  const goNext = () => {
    if (step === 0) {
      if (!basic.title.trim()) {
        toast.error("عنوان آزمون الزامی است");
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (selected.length === 0) {
        toast.error("حداقل یک درس انتخاب کنید");
        return;
      }
      setConfigs((prev) => {
        const next = { ...prev };
        selected.forEach((sid, i) => {
          next[sid] = next[sid] ?? { ...defaultConfig, display_order: String(i + 1) };
        });
        return next;
      });
      setStep(2);
      return;
    }
    if (step === 2) {
      saveBasics.mutate();
    }
  };

  const setConfig = (sid: string, patch: Partial<SubjectConfig>) =>
    setConfigs((prev) => ({ ...prev, [sid]: { ...(prev[sid] ?? defaultConfig), ...patch } }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{examId ? "ویرایش آزمون" : "ایجاد آزمون جدید"}</DialogTitle>
        </DialogHeader>

        <ol className="flex flex-wrap gap-2 text-xs">
          {steps.map((s, i) => (
            <li key={s}>
              <Badge variant={i === step ? "default" : i < step ? "secondary" : "outline"}>
                {i + 1}. {s}
              </Badge>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="w-title">عنوان آزمون</Label>
              <Input
                id="w-title"
                maxLength={200}
                value={basic.title}
                onChange={(e) => setBasic((b) => ({ ...b, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="w-desc">توضیحات</Label>
              <Textarea
                id="w-desc"
                rows={3}
                maxLength={2000}
                value={basic.description}
                onChange={(e) => setBasic((b) => ({ ...b, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>دسته‌بندی</Label>
                <Select
                  value={basic.category_id}
                  onValueChange={(v) => setBasic((b) => ({ ...b, category_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.parent_id ? `— ${c.name}` : c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>سازمان برگزارکننده</Label>
                <Select
                  value={basic.organization_id}
                  onValueChange={(v) => setBasic((b) => ({ ...b, organization_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {(organizations.data ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-year">سال</Label>
                <Input
                  id="w-year"
                  type="number"
                  placeholder="۱۴۰۴"
                  value={basic.year}
                  onChange={(e) => setBasic((b) => ({ ...b, year: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-period">دوره</Label>
                <Input
                  id="w-period"
                  placeholder="استخدامی"
                  value={basic.period}
                  onChange={(e) => setBasic((b) => ({ ...b, period: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-round">نوبت</Label>
                <Input
                  id="w-round"
                  placeholder="اول"
                  value={basic.round}
                  onChange={(e) => setBasic((b) => ({ ...b, round: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>سطح</Label>
                <Select value={basic.level} onValueChange={(v) => setBasic((b) => ({ ...b, level: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="آسان">آسان</SelectItem>
                    <SelectItem value="متوسط">متوسط</SelectItem>
                    <SelectItem value="دشوار">دشوار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-duration">مدت کل (دقیقه)</Label>
                <Input
                  id="w-duration"
                  type="number"
                  min={1}
                  value={basic.duration_minutes}
                  onChange={(e) => setBasic((b) => ({ ...b, duration_minutes: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-passing">حد نصاب قبولی (درصد)</Label>
                <Input
                  id="w-passing"
                  type="number"
                  min={0}
                  max={100}
                  value={basic.passing_score}
                  onChange={(e) => setBasic((b) => ({ ...b, passing_score: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-attempts">حداکثر تعداد شرکت</Label>
                <Input
                  id="w-attempts"
                  type="number"
                  min={1}
                  value={basic.max_attempts}
                  onChange={(e) => setBasic((b) => ({ ...b, max_attempts: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>وضعیت انتشار</Label>
                <Select value={basic.status} onValueChange={(v) => setBasic((b) => ({ ...b, status: v }))}>
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
                  value={basic.access_type}
                  onValueChange={(v) => setBasic((b) => ({ ...b, access_type: v }))}
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
              <div className="space-y-2">
                <Label htmlFor="w-price">قیمت (تومان)</Label>
                <Input
                  id="w-price"
                  type="number"
                  min={0}
                  disabled={basic.is_free}
                  value={basic.price}
                  onChange={(e) => setBasic((b) => ({ ...b, price: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={basic.is_free}
                  onCheckedChange={(v) => setBasic((b) => ({ ...b, is_free: v, price: v ? "0" : b.price }))}
                />
                آزمون رایگان
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={basic.show_correct_answers}
                  onCheckedChange={(v) => setBasic((b) => ({ ...b, show_correct_answers: v }))}
                />
                نمایش پاسخ صحیح پس از آزمون
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={basic.randomize_questions}
                  onCheckedChange={(v) => setBasic((b) => ({ ...b, randomize_questions: v }))}
                />
                تصادفی‌سازی سوالات
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={basic.randomize_options}
                  onCheckedChange={(v) => setBasic((b) => ({ ...b, randomize_options: v }))}
                />
                تصادفی‌سازی گزینه‌ها
              </label>
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">تنظیمات جست‌وجو و سئو</p>
              <div className="space-y-2">
                <Label htmlFor="w-meta-title">عنوان سئو</Label>
                <Input
                  id="w-meta-title"
                  maxLength={60}
                  value={basic.meta_title}
                  onChange={(e) => setBasic((b) => ({ ...b, meta_title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-meta-desc">توضیح متا</Label>
                <Textarea
                  id="w-meta-desc"
                  rows={2}
                  maxLength={160}
                  value={basic.meta_description}
                  onChange={(e) => setBasic((b) => ({ ...b, meta_description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w-keywords">کلیدواژه‌ها (با ویرگول جدا کنید)</Label>
                <Input
                  id="w-keywords"
                  value={basic.keywords}
                  onChange={(e) => setBasic((b) => ({ ...b, keywords: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              درس‌هایی که این آزمون شامل آن‌هاست را انتخاب کنید.
            </p>
            {subjects.isLoading ? (
              <InlineLoading />
            ) : (
              <div className="grid max-h-80 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                {(subjects.data ?? []).map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.includes(s.id)}
                      onCheckedChange={() =>
                        setSelected((prev) =>
                          prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                        )
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              برای هر درس تعداد سوال، ضریب، ترتیب نمایش و در صورت نیاز زمان اختصاصی را تعیین کنید.
            </p>
            {selected.map((sid) => {
              const s = (subjects.data ?? []).find((x) => x.id === sid);
              const c = configs[sid] ?? defaultConfig;
              return (
                <div key={sid} className="space-y-3 rounded-lg border p-3">
                  <p className="font-medium">{s?.name ?? sid}</p>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">تعداد سوال</Label>
                      <Input
                        type="number"
                        min={0}
                        value={c.question_count}
                        onChange={(e) => setConfig(sid, { question_count: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">ضریب</Label>
                      <Input
                        type="number"
                        min={1}
                        step="0.5"
                        value={c.coefficient}
                        onChange={(e) => setConfig(sid, { coefficient: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">ترتیب</Label>
                      <Input
                        type="number"
                        min={1}
                        value={c.display_order}
                        onChange={(e) => setConfig(sid, { display_order: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">زمان اختصاصی (دقیقه)</Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="اختیاری"
                        value={c.time_limit_minutes}
                        onChange={(e) => setConfig(sid, { time_limit_minutes: e.target.value })}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={c.negative_marking}
                      onCheckedChange={(v) => setConfig(sid, { negative_marking: v })}
                    />
                    نمره منفی برای این درس
                  </label>
                </div>
              );
            })}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {examSubjectRows.isLoading ? (
              <InlineLoading />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {(examSubjectRows.data ?? []).map((r) => (
                    <Button
                      key={r.id}
                      size="sm"
                      variant={r.subject_id === activeSubject ? "default" : "outline"}
                      onClick={() => setActiveSubject(r.subject_id)}
                    >
                      {r.subjects?.name ?? "درس"}
                      <Badge variant="secondary" className="mr-1 text-xs">
                        {attachedPerSubject[r.id] ?? 0}/{r.question_count}
                      </Badge>
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">سطح دشواری</Label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">همه</SelectItem>
                        <SelectItem value="easy">آسان</SelectItem>
                        <SelectItem value="medium">متوسط</SelectItem>
                        <SelectItem value="hard">دشوار</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">تعداد تصادفی</Label>
                    <Input
                      type="number"
                      min={1}
                      className="w-28"
                      value={randomCount}
                      onChange={(e) => setRandomCount(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" onClick={() => addRandom.mutate()} disabled={addRandom.isPending}>
                    <Shuffle className="size-4" />
                    افزودن تصادفی
                  </Button>
                </div>

                {pool.isLoading ? (
                  <InlineLoading />
                ) : (pool.data ?? []).length === 0 ? (
                  <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                    برای این درس سوالی در بانک سوالات ثبت نشده است. ابتدا از بخش بانک سوالات، سوال‌ها را به
                    این درس اختصاص دهید.
                  </p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3">
                    {(pool.data ?? []).map((q) => (
                      <label key={q.id} className="flex cursor-pointer items-start gap-2 text-sm">
                        <Checkbox
                          checked={attachedIds.has(q.id)}
                          onCheckedChange={() => toggleQuestion.mutate(q.id)}
                        />
                        <span className="flex-1">{q.question_text}</span>
                        <Badge variant="outline" className="text-xs">
                          {difficultyLabels[q.difficulty] ?? q.difficulty}
                        </Badge>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => s - 1))}
          >
            {step === 0 ? "انصراف" : "مرحله قبل"}
          </Button>
          {step < 3 ? (
            <Button onClick={goNext} disabled={saveBasics.isPending}>
              {saveBasics.isPending ? <Loader2 className="size-4 animate-spin" /> : "مرحله بعد"}
            </Button>
          ) : (
            <Button
              onClick={() => {
                toast.success("آزمون ذخیره شد");
                void qc.invalidateQueries({ queryKey: ["exams"] });
                onOpenChange(false);
              }}
            >
              <Check className="size-4" />
              پایان
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
