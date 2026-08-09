import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { slugify, statusLabels } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/subjects")({
  head: () => ({
    meta: [
      { title: "درس‌ها | سامانه آزمون آنلاین" },
      {
        name: "description",
        content: "مدیریت درس‌های آزمون مانند زبان تخصصی، ادبیات فارسی، معارف اسلامی و هوش و استعداد.",
      },
      { property: "og:title", content: "مدیریت درس‌های آزمون" },
      { property: "og:description", content: "افزودن و ویرایش درس‌هایی که در آزمون‌ها استفاده می‌شوند." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <SubjectsPage />
    </RequireAdmin>
  ),
});

type Subject = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  display_order: number;
};

const emptyForm = { id: "", name: "", description: "", status: "active", display_order: "0" };

function SubjectsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [toDelete, setToDelete] = useState<Subject | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["subjects"],
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, slug, description, status, display_order")
        .order("display_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Subject[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("نام درس الزامی است");
      const { error } = await supabase.rpc("save_subject", {
        p_id: (form.id || null) as unknown as string,
        p_name: name,
        p_slug: slugify(name),
        p_description: (form.description.trim() || null) as unknown as string,
        p_status: form.status,
        p_display_order: Number(form.display_order) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("درس ذخیره شد");
      setOpen(false);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_subject", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("درس حذف شد");
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="درس‌ها"
        description="درس‌هایی که می‌توانند در آزمون‌های مختلف استفاده شوند"
        action={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            درس جدید
          </Button>
        }
      />
      <Card className="card-elevated">
        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <InlineLoading />
          ) : error ? (
            <ErrorState message={(error as Error).message} />
          ) : !data || data.length === 0 ? (
            <EmptyState description="هنوز درسی ثبت نشده است." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام درس</TableHead>
                    <TableHead>شناسه</TableHead>
                    <TableHead>توضیحات</TableHead>
                    <TableHead>ترتیب</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.slug}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {s.description ?? "—"}
                      </TableCell>
                      <TableCell>{s.display_order}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "secondary"}>
                          {statusLabels[s.status] ?? s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setForm({
                                id: s.id,
                                name: s.name,
                                description: s.description ?? "",
                                status: s.status,
                                display_order: String(s.display_order),
                              });
                              setOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                            ویرایش
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => setToDelete(s)}
                          >
                            <Trash2 className="size-4" />
                            حذف
                          </Button>
                        </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش درس" : "درس جدید"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject-name">نام درس</Label>
              <Input
                id="subject-name"
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject-desc">توضیحات</Label>
              <Textarea
                id="subject-desc"
                maxLength={500}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="subject-order">ترتیب نمایش</Label>
                <Input
                  id="subject-order"
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>وضعیت</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">فعال</SelectItem>
                    <SelectItem value="inactive">غیرفعال</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف درس</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            آیا از حذف درس «{toDelete?.name}» مطمئن هستید؟ اگر این درس در آزمون‌ها یا بانک سوالات
            استفاده شده باشد، حذف انجام نمی‌شود.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              disabled={remove.isPending}
            >
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
