import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Plus,
  Trash2,
  Search,
  UserPlus,
  UserMinus,
  Loader2,
  ClipboardList,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PageHeader,
  InlineLoading,
  EmptyState,
  ErrorState,
  RequireAdmin,
} from "@/components/ui-states";
import { difficultyLabels, formatJalali, examStatusLabels } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/exams/$examId")({
  head: () => ({
    meta: [
      { title: "مدیریت آزمون | سامانه آزمون آنلاین" },
      { name: "description", content: "مدیریت سوالات و داوطلبان آزمون." },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <ExamDetailPage />
    </RequireAdmin>
  ),
});

type ExamQuestion = {
  question_id: string;
  score: number;
  display_order: number;
  questions: {
    id: string;
    question_text: string;
    difficulty: string;
    status: string;
    categories: { name: string } | null;
  } | null;
};

type Candidate = {
  id: string;
  full_name: string;
  email: string | null;
};

type Assignment = {
  id: string;
  candidate_id: string;
  assigned_at: string;
  profiles: { full_name: string; email: string | null } | null;
};

function ExamDetailPage() {
  const { examId } = Route.useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"questions" | "assignments">("questions");
  const [addOpen, setAddOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

  const exam = useQuery({
    queryKey: ["exam", examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, status, duration_minutes, passing_score, access_type")
        .eq("id", examId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const examQuestions = useQuery({
    queryKey: ["exam-questions", examId],
    queryFn: async (): Promise<ExamQuestion[]> => {
      const { data, error } = await supabase
        .from("exam_questions")
        .select(
          "question_id, score, display_order, questions(id, question_text, difficulty, status, categories(name))",
        )
        .eq("exam_id", examId)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as ExamQuestion[];
    },
  });

  const assignments = useQuery({
    queryKey: ["exam-assignments", examId],
    queryFn: async (): Promise<Assignment[]> => {
      const { data, error } = await supabase
        .from("exam_assignments")
        .select("id, candidate_id, assigned_at, profiles!exam_assignments_candidate_id_fkey(full_name, email)")
        .eq("exam_id", examId)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });

  const availableQuestions = useQuery({
    queryKey: ["questions", "available", search],
    enabled: addOpen,
    queryFn: async () => {
      let q = supabase
        .from("questions")
        .select("id, question_text, difficulty, status, categories(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (search.trim()) {
        q = q.ilike("question_text", `%${search.trim()}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      const existing = new Set((examQuestions.data ?? []).map((eq) => eq.question_id));
      return (data ?? []).filter((q) => !existing.has(q.id));
    },
  });

  const allCandidates = useQuery({
    queryKey: ["admin-users", "candidates"],
    enabled: assignOpen,
    queryFn: async (): Promise<Candidate[]> => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("status", "active")
          .order("full_name"),
        supabase.from("user_roles").select("user_id, role").eq("role", "candidate"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const candidateIds = new Set((roles ?? []).map((r) => r.user_id));
      return (profiles ?? []).filter((p) => candidateIds.has(p.id));
    },
  });

  const addQuestions = useMutation({
    mutationFn: async () => {
      if (selectedQuestions.length === 0) throw new Error("سوالی انتخاب نشده است");
      for (const qid of selectedQuestions) {
        const { error } = await supabase.rpc("add_exam_question", {
          p_exam_id: examId,
          p_question_id: qid,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("سوالات به آزمون اضافه شدند");
      setAddOpen(false);
      setSelectedQuestions([]);
      void qc.invalidateQueries({ queryKey: ["exam-questions", examId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeQuestion = useMutation({
    mutationFn: async (questionId: string) => {
      const { error } = await supabase.rpc("remove_exam_question", {
        p_exam_id: examId,
        p_question_id: questionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("سوال از آزمون حذف شد");
      void qc.invalidateQueries({ queryKey: ["exam-questions", examId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignCandidates = useMutation({
    mutationFn: async () => {
      if (selectedCandidates.length === 0) throw new Error("داوطلبی انتخاب نشده است");
      const { error } = await supabase.rpc("assign_candidates", {
        p_exam_id: examId,
        p_candidate_ids: selectedCandidates,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("داوطلبان به آزمون دعوت شدند");
      setAssignOpen(false);
      setSelectedCandidates([]);
      void qc.invalidateQueries({ queryKey: ["exam-assignments", examId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase.rpc("unassign_candidate", {
        p_exam_id: examId,
        p_candidate_id: candidateId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("داوطلب از آزمون حذف شد");
      void qc.invalidateQueries({ queryKey: ["exam-assignments", examId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (exam.isLoading) return <InlineLoading />;
  if (exam.error) return <ErrorState message={(exam.error as Error).message} />;
  if (!exam.data) return <ErrorState message="آزمون یافت نشد." />;

  const toggleQuestion = (id: string) =>
    setSelectedQuestions((prev) =>
      prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id],
    );

  const toggleCandidate = (id: string) =>
    setSelectedCandidates((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  const assignedIds = new Set((assignments.data ?? []).map((a) => a.candidate_id));
  const availableCandidates = (allCandidates.data ?? []).filter((c) => !assignedIds.has(c.id));

  return (
    <>
      <PageHeader
        title={exam.data.title}
        description={`مدت: ${exam.data.duration_minutes} دقیقه — حد نصاب: ${exam.data.passing_score}`}
        breadcrumb={
          <Link to="/exams" className="inline-flex items-center gap-1 hover:underline">
            <ArrowRight className="size-3" />
            بازگشت به آزمون‌ها
          </Link>
        }
        action={
          <Badge variant="secondary">{examStatusLabels[exam.data.status] ?? exam.data.status}</Badge>
        }
      />

      <div className="mb-4 flex gap-2">
        <Button
          size="sm"
          variant={tab === "questions" ? "default" : "outline"}
          onClick={() => setTab("questions")}
        >
          <ClipboardList className="size-4" />
          سوالات ({examQuestions.data?.length ?? 0})
        </Button>
        <Button
          size="sm"
          variant={tab === "assignments" ? "default" : "outline"}
          onClick={() => setTab("assignments")}
        >
          <Users className="size-4" />
          داوطلبان ({assignments.data?.length ?? 0})
        </Button>
      </div>

      {tab === "questions" && (
        <Card className="card-elevated">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>سوالات آزمون</CardTitle>
              <CardDescription>سوالات مرتبط با این آزمون</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              افزودن سوال
            </Button>
          </CardHeader>
          <CardContent>
            {examQuestions.isLoading ? (
              <InlineLoading />
            ) : examQuestions.data && examQuestions.data.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>متن سوال</TableHead>
                      <TableHead>دسته‌بندی</TableHead>
                      <TableHead>دشواری</TableHead>
                      <TableHead>بارم</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {examQuestions.data.map((eq, i) => (
                      <TableRow key={eq.question_id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="max-w-md truncate font-medium">
                          {eq.questions?.question_text ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {eq.questions?.categories?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {difficultyLabels[eq.questions?.difficulty ?? "medium"]}
                          </Badge>
                        </TableCell>
                        <TableCell>{eq.score}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => removeQuestion.mutate(eq.question_id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState description="سوالی به این آزمون اضافه نشده است." />
            )}
          </CardContent>
        </Card>
      )}

      {tab === "assignments" && (
        <Card className="card-elevated">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>داوطلبان دعوت‌شده</CardTitle>
              <CardDescription>
                {exam.data.access_type === "private"
                  ? "این آزمون خصوصی است — تنها داوطلبان دعوت‌شده دسترسی دارند"
                  : "این آزمون عمومی است — دعوت اختیاری است"}
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <UserPlus className="size-4" />
              دعوت داوطلب
            </Button>
          </CardHeader>
          <CardContent>
            {assignments.isLoading ? (
              <InlineLoading />
            ) : assignments.data && assignments.data.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>نام</TableHead>
                      <TableHead>ایمیل</TableHead>
                      <TableHead>تاریخ دعوت</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.data.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.profiles?.full_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.profiles?.email ?? "—"}
                        </TableCell>
                        <TableCell>{formatJalali(a.assigned_at)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => unassign.mutate(a.candidate_id)}
                          >
                            <UserMinus className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState description="هیچ داوطلبی دعوت نشده است." />
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Questions Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>افزودن سوال به آزمون</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو در سوالات..."
                className="pr-10"
              />
            </div>
            {availableQuestions.isLoading ? (
              <InlineLoading />
            ) : availableQuestions.data && availableQuestions.data.length > 0 ? (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {availableQuestions.data.map((q) => (
                  <label
                    key={q.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedQuestions.includes(q.id)}
                      onCheckedChange={() => toggleQuestion(q.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{q.question_text}</p>
                      <div className="mt-1 flex gap-2">
                        <Badge variant="outline" className="text-xs">
                          {difficultyLabels[q.difficulty]}
                        </Badge>
                        {q.categories?.name && (
                          <Badge variant="secondary" className="text-xs">
                            {q.categories.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState description="سوال قابل افزودنی وجود ندارد." />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>انصراف</Button>
            <Button
              onClick={() => addQuestions.mutate()}
              disabled={addQuestions.isPending || selectedQuestions.length === 0}
            >
              {addQuestions.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                `افزودن ${selectedQuestions.length} سوال`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Candidates Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>دعوت داوطلبان به آزمون</DialogTitle>
          </DialogHeader>
          {allCandidates.isLoading ? (
            <InlineLoading />
          ) : availableCandidates.length > 0 ? (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {availableCandidates.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedCandidates.includes(c.id)}
                    onCheckedChange={() => toggleCandidate(c.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.email ?? "—"}</p>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <EmptyState description="تمام داوطلبان دعوت شده‌اند یا داوطلب فعالی وجود ندارد." />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>انصراف</Button>
            <Button
              onClick={() => assignCandidates.mutate()}
              disabled={assignCandidates.isPending || selectedCandidates.length === 0}
            >
              {assignCandidates.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                `دعوت ${selectedCandidates.length} داوطلب`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
