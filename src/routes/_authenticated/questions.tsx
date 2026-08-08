import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { difficultyLabels, statusLabels } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/questions")({
  head: () => ({
    meta: [
      { title: "بانک سوالات | سامانه آزمون آنلاین" },
      {
        name: "description",
        content: "ثبت و ویرایش سوالات چهارگزینه‌ای، تعیین سطح دشواری و بارم هر سوال.",
      },
      { property: "og:title", content: "بانک سوالات" },
      { property: "og:description", content: "مدیریت سوالات چهارگزینه‌ای آزمون‌های استخدامی." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <QuestionsPage />
    </RequireAdmin>
  ),
});

type Difficulty = "easy" | "medium" | "hard";
type QStatus = "draft" | "published";

type QuestionRow = {
  id: string;
  question_text: string;
  difficulty: Difficulty;
  default_score: number;
  status: QStatus;
  category_id: string | null;
  categories: { name: string } | null;
  question_options: { id: string; option_text: string; is_correct: boolean; display_order: number }[];
};

type FormState = {
  id: string;
  category_id: string;
  question_text: string;
  difficulty: Difficulty;
  score: string;
  status: QStatus;
  options: string[];
  correct: number;
};

const emptyForm: FormState = {
  id: "",
  category_id: "",
  question_text: "",
  difficulty: "medium",
  score: "1",
  status: "published",
  options: ["", "", "", ""],
  correct: 0,
};

function QuestionsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

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
    queryKey: ["questions"],
    queryFn: async (): Promise<QuestionRow[]> => {
      const { data, error } = await supabase
        .from("questions")
        .select(
          "id, question_text, difficulty, default_score, status, category_id, categories(name), question_options(id, option_text, is_correct, display_order)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as QuestionRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const text = form.question_text.trim();
      if (!text) throw new Error("متن سوال الزامی است");
      if (text.length > 2000) throw new Error("متن سوال بیش از حد طولانی است");
      const options = form.options.map((o) => o.trim());
      if (options.some((o) => !o)) throw new Error("هر چهار گزینه باید تکمیل شوند");
      const score = Number(form.score);
      if (!Number.isFinite(score) || score <= 0) throw new Error("بارم سوال نامعتبر است");

      const { error } = await supabase.rpc("save_question", {
        p_id: form.id || (null as unknown as string),
        p_category_id: form.category_id || (null as unknown as string),
        p_text: text,
        p_difficulty: form.difficulty,
        p_score: score,
        p_status: form.status,
        p_options: options.map((o, i) => ({ option_text: o, is_correct: i === form.correct })),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("سوال ذخیره شد");
      setOpen(false);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (q: QuestionRow) => {
    const opts = [...q.question_options].sort((a, b) => a.display_order - b.display_order);
    setForm({
      id: q.id,
      category_id: q.category_id ?? "",
      question_text: q.question_text,
      difficulty: q.difficulty,
      score: String(q.default_score),
      status: q.status,
      options: [0, 1, 2, 3].map((i) => opts[i]?.option_text ?? ""),
      correct: Math.max(0, opts.findIndex((o) => o.is_correct)),
    });
    setOpen(true);
  };

  const term = search.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (q) =>
      (categoryFilter === "all" || q.category_id === categoryFilter) &&
      (!term || q.question_text.toLowerCase().includes(term)),
  );

  return (
    <>
      <PageHeader
        title="بانک سوالات"
        description="سوالات چهارگزینه‌ای با یک پاسخ صحیح"
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            سوال جدید
          </Button>
        }
      />
      <Card className="card-elevated">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو در متن سوال"
              className="max-w-sm"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="همه دسته‌بندی‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه دسته‌بندی‌ها</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <InlineLoading />
          ) : error ? (
            <ErrorState message={(error as Error).message} />
          ) : rows.length === 0 ? (
            <EmptyState description="سوالی یافت نشد." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/2">متن سوال</TableHead>
                    <TableHead>دسته‌بندی</TableHead>
                    <TableHead>دشواری</TableHead>
                    <TableHead>بارم</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="max-w-md truncate font-medium">
                        {q.question_text}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {q.categories?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{difficultyLabels[q.difficulty]}</Badge>
                      </TableCell>
                      <TableCell>{q.default_score}</TableCell>
                      <TableCell>
                        <Badge variant={q.status === "published" ? "default" : "secondary"}>
                          {statusLabels[q.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => openEdit(q)}>
                          <Pencil className="size-4" />
                          ویرایش
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش سوال" : "سوال جدید"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="q-text">متن سوال</Label>
              <Textarea
                id="q-text"
                rows={3}
                maxLength={2000}
                value={form.question_text}
                onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>دسته‌بندی</Label>
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
                <Label>سطح دشواری</Label>
                <Select
                  value={form.difficulty}
                  onValueChange={(v) => setForm((f) => ({ ...f, difficulty: v as Difficulty }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">آسان</SelectItem>
                    <SelectItem value="medium">متوسط</SelectItem>
                    <SelectItem value="hard">دشوار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="q-score">بارم</Label>
                <Input
                  id="q-score"
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={form.score}
                  onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>گزینه‌ها (گزینه صحیح را انتخاب کنید)</Label>
              <RadioGroup
                value={String(form.correct)}
                onValueChange={(v) => setForm((f) => ({ ...f, correct: Number(v) }))}
                className="space-y-2"
              >
                {form.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <RadioGroupItem value={String(i)} id={`opt-${i}`} />
                    <Input
                      aria-label={`گزینه ${i + 1}`}
                      maxLength={500}
                      value={opt}
                      onChange={(e) =>
                        setForm((f) => {
                          const options = [...f.options];
                          options[i] = e.target.value;
                          return { ...f, options };
                        })
                      }
                    />
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>وضعیت انتشار</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as QStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">منتشر شده</SelectItem>
                  <SelectItem value="draft">پیش‌نویس</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              ذخیره سوال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
