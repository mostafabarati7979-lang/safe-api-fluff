import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { difficultyLabels } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "بارگذاری اکسل | سامانه آزمون آنلاین" },
      { name: "description", content: "بارگذاری گروهی سوالات از فایل اکسل." },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <ImportPage />
    </RequireAdmin>
  ),
});

type ParsedRow = {
  question_text: string;
  difficulty: "easy" | "medium" | "hard";
  score: number;
  options: string[];
  correct: number;
  category_name: string | null;
};

type ExamOption = { id: string; title: string };
type CategoryOption = { id: string; name: string };

function ImportPage() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [examMode, setExamMode] = useState<"existing" | "new">("existing");
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [newExamTitle, setNewExamTitle] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const exams = useQuery<ExamOption[]>({
    queryKey: ["exams", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExamOption[];
    },
  });

  const categories = useQuery<CategoryOption[]>({
    queryKey: ["categories", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CategoryOption[];
    },
  });

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      toast.error("فایل خالی یا بدون هدر است");
      return;
    }
    const headers = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase());
    const required = ["question", "option1", "option2", "option3", "option4", "correct", "difficulty", "score"];
    const missing = required.filter((r) => !headers.includes(r));
    if (missing.length > 0) {
      toast.error(`ستون‌های ناقص: ${missing.join(", ")}`);
      return;
    }
    const idx = (k: string) => headers.indexOf(k);
    const parsed: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i] ?? "");
      if (cols.length < headers.length) continue;
      const correct = Number(cols[idx("correct")]) - 1;
      if (correct < 0 || correct > 3) continue;
      const difficulty = (cols[idx("difficulty")] ?? "") as "easy" | "medium" | "hard";
      if (!["easy", "medium", "hard"].includes(difficulty)) continue;
      parsed.push({
        question_text: cols[idx("question")] ?? "",
        difficulty,
        score: Number(cols[idx("score")]) || 1,
        options: [0, 1, 2, 3].map((n) => cols[idx(`option${n + 1}`)] ?? ""),
        correct,
        category_name: idx("category") >= 0 ? cols[idx("category")] || null : null,
      });
    }
    setRows(parsed);
    if (parsed.length > 0) toast.success(`${parsed.length} سوال آماده بارگذاری است`);
    else toast.error("هیچ سوال معتبری یافت نشد");
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setRows([]);
    const text = await file.text();
    parseCsv(text);
    setLoading(false);
  };

  const doImport = useMutation({
    mutationFn: async () => {
      if (rows.length === 0) throw new Error("سوالی برای بارگذاری وجود ندارد");

      let examId: string | null = null;
      let examTitle: string | null = null;

      if (examMode === "existing") {
        if (!selectedExamId) throw new Error("یک آزمون انتخاب کنید");
        examId = selectedExamId;
      } else {
        const trimmed = newExamTitle.trim();
        if (!trimmed) throw new Error("نام آزمون جدید را وارد کنید");
        examTitle = trimmed;
      }

      setImporting(true);
      const { data, error } = await supabase.rpc("import_questions", {
        p_rows: rows.map((r) => ({
          question_text: r.question_text,
          difficulty: r.difficulty,
          score: r.score,
          options: r.options.map((o, i) => ({ option_text: o, is_correct: i === r.correct })),
          category_name: r.category_name,
        })),
        p_exam_id: examId as unknown as string,
        p_exam_title: examTitle as unknown as string,
        p_category_ids: (selectedCategoryIds.length > 0 ? selectedCategoryIds : null) as unknown as string[],
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("سوالات با موفقیت بارگذاری و به آزمون اضافه شدند");
      setRows([]);
      void qc.invalidateQueries({ queryKey: ["questions"] });
      void qc.invalidateQueries({ queryKey: ["exams"] });
      void qc.invalidateQueries({ queryKey: ["my-exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setImporting(false),
  });

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const selectedExam = exams.data?.find((e) => e.id === selectedExamId);

  return (
    <>
      <PageHeader
        title="بارگذاری گروهی سوالات"
        description="فایل CSV سوالات را بارگذاری کنید و سپس آزمون و دسته‌بندی‌ها را انتخاب نمایید"
      />

      <div className="space-y-4">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>۱. انتخاب فایل سوالات</CardTitle>
            <CardDescription>
              فایل CSV با کدگذاری UTF-8 و کاما به‌عنوان جداکننده
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept=".csv,text/csv"
                className="max-w-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              {loading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
            </div>

            {!loading && rows.length === 0 && (
              <EmptyState
                title="فایلی انتخاب نشده"
                description="برای شروع، فایل CSV سوالات را انتخاب کنید."
                action={
                  <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="size-4" />
                      question,option1,option2,option3,option4,correct,difficulty,score,category
                    </div>
                    <p className="text-xs">
                      correct: شماره گزینه صحیح (۱ تا ۴) — category: دسته‌بندی سوال (اختیاری)
                    </p>
                  </div>
                }
              />
            )}

            {rows.length > 0 && (
              <div className="overflow-x-auto">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {rows.length} سوال پیش‌نمایش داده شد
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/2">متن سوال</TableHead>
                      <TableHead>گزینه‌ها</TableHead>
                      <TableHead>پاسخ صحیح</TableHead>
                      <TableHead>دشواری</TableHead>
                      <TableHead>بارم</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 50).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-xs truncate font-medium">
                          {r.question_text}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.options.length} گزینه
                        </TableCell>
                        <TableCell>
                          <Badge variant="default">گزینه {r.correct + 1}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{difficultyLabels[r.difficulty]}</Badge>
                        </TableCell>
                        <TableCell>{r.score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > 50 && (
                  <p className="pt-2 text-center text-xs text-muted-foreground">
                    و {rows.length - 50} سوال دیگر…
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>۲. انتخاب آزمون و دسته‌بندی‌ها</CardTitle>
              <CardDescription>
                سوالات به آزمون انتخاب‌شده اضافه می‌شوند. اگر آزمون جدید است، ساخته می‌شود.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>آزمون مقصد</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={examMode === "existing" ? "default" : "outline"}
                    onClick={() => setExamMode("existing")}
                  >
                    آزمون موجود
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={examMode === "new" ? "default" : "outline"}
                    onClick={() => setExamMode("new")}
                  >
                    <Plus className="size-4" />
                    آزمون جدید
                  </Button>
                </div>

                {examMode === "existing" ? (
                  <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue placeholder="یک آزمون انتخاب کنید" />
                    </SelectTrigger>
                    <SelectContent>
                      {exams.isLoading ? (
                        <SelectItem value="_loading" disabled>در حال بارگذاری…</SelectItem>
                      ) : (
                        (exams.data ?? []).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.title}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="max-w-md"
                    placeholder="نام آزمون جدید"
                    value={newExamTitle}
                    onChange={(e) => setNewExamTitle(e.target.value)}
                  />
                )}

                {examMode === "existing" && selectedExam && (
                  <p className="text-xs text-muted-foreground">
                    سوالات به انتهای آزمون «{selectedExam.title}» اضافه می‌شوند.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label>دسته‌بندی‌های آزمون (می‌توانید چند مورد انتخاب کنید)</Label>
                {categories.isLoading ? (
                  <InlineLoading />
                ) : (categories.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    هیچ دسته‌بندی‌ای ثبت نشده است.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {(categories.data ?? []).map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedCategoryIds.includes(c.id)}
                          onCheckedChange={() => toggleCategory(c.id)}
                        />
                        <span className="text-sm">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedCategoryIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">انتخاب‌شده:</span>
                    {selectedCategoryIds.map((id) => {
                      const cat = (categories.data ?? []).find((c) => c.id === id);
                      return cat ? (
                        <Badge key={id} variant="secondary">{cat.name}</Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => doImport.mutate()}
                  disabled={importing || (examMode === "existing" && !selectedExamId) || (examMode === "new" && !newExamTitle.trim())}
                >
                  {importing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  بارگذاری {rows.length} سوال و اضافه به آزمون
                </Button>
                <Button variant="outline" onClick={() => { setRows([]); setSelectedCategoryIds([]); }}>
                  انصراف
                </Button>
              </div>

              {doImport.isError && (
                <ErrorState message={(doImport.error as Error).message} />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
