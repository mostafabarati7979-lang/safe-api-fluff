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
import { formatJalali, slugify, statusLabels } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/categories")({
  head: () => ({
    meta: [
      { title: "دسته‌بندی‌ها | سامانه آزمون آنلاین" },
      { name: "description", content: "ایجاد و ویرایش دسته‌بندی‌های آزمون و بانک سوالات." },
      { property: "og:title", content: "دسته‌بندی‌های آزمون" },
      { property: "og:description", content: "مدیریت دسته‌بندی‌های آزمون‌ها و سوالات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <CategoriesPage />
    </RequireAdmin>
  ),
});

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "active" | "inactive";
  created_at: string;
};

const emptyForm = { id: "", name: "", description: "", status: "active" as "active" | "inactive" };

function CategoriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, description, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("نام دسته‌بندی الزامی است");
      if (name.length > 100) throw new Error("نام نباید بیش از ۱۰۰ نویسه باشد");
      const payload = {
        name,
        slug: slugify(name),
        description: form.description.trim() || null,
        status: form.status,
      };
      if (form.id) {
        const { error } = await supabase.from("categories").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("دسته‌بندی ذخیره شد");
      setOpen(false);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_category", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("دسته‌بندی حذف شد");
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (c: Category) => {
    setForm({ id: c.id, name: c.name, description: c.description ?? "", status: c.status });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="دسته‌بندی‌ها"
        description="دسته‌بندی آزمون‌ها و سوالات"
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            دسته‌بندی جدید
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
            <EmptyState description="هنوز دسته‌بندی‌ای ثبت نشده است." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام</TableHead>
                    <TableHead>شناسه</TableHead>
                    <TableHead>توضیحات</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>تاریخ ایجاد</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.slug}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {c.description ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.status === "active" ? "default" : "secondary"}>
                          {statusLabels[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatJalali(c.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                            <Pencil className="size-4" />
                            ویرایش
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => setToDelete(c)}
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
            <DialogTitle>{form.id ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">نام</Label>
              <Input
                id="cat-name"
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">توضیحات</Label>
              <Textarea
                id="cat-desc"
                maxLength={500}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>وضعیت</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as "active" | "inactive" }))
                }
              >
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
            <DialogTitle>حذف دسته‌بندی</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            آیا از حذف دسته‌بندی «{toDelete?.name}» مطمئن هستید؟ این عمل قابل بازگشت نیست. اگر این
            دسته‌بندی در سوالات یا آزمون‌ها استفاده شده باشد، حذف انجام نمی‌شود.
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
