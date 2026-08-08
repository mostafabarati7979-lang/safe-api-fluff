import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatJalali, statusLabels } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "مدیریت کاربران | سامانه آزمون آنلاین" },
      { name: "description", content: "مدیریت کاربران، نقش‌ها و وضعیت حساب داوطلبان سامانه آزمون." },
      { property: "og:title", content: "مدیریت کاربران" },
      { property: "og:description", content: "مدیریت نقش و وضعیت کاربران سامانه آزمون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <UsersPage />
    </RequireAdmin>
  ),
});

type Row = {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  status: "active" | "inactive";
  created_at: string;
  role: "admin" | "candidate" | null;
};

function UsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async (): Promise<Row[]> => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, mobile, status, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const map = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
      return (profiles ?? []).map((p) => ({ ...p, role: map.get(p.id) ?? null })) as Row[];
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "admin" | "candidate" }) => {
      const { error } = await supabase.rpc("admin_set_role", { _user_id: id, _role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("نقش کاربر به‌روزرسانی شد");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "inactive" }) => {
      const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("وضعیت کاربر تغییر کرد");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = q.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (r) =>
      !term ||
      r.full_name.toLowerCase().includes(term) ||
      (r.email ?? "").toLowerCase().includes(term) ||
      (r.mobile ?? "").includes(term),
  );

  return (
    <>
      <PageHeader title="مدیریت کاربران" description="نقش و وضعیت حساب کاربران را مدیریت کنید" />
      <Card className="card-elevated">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو بر اساس نام، ایمیل یا موبایل"
            className="max-w-sm"
          />
          {isLoading ? (
            <InlineLoading />
          ) : error ? (
            <ErrorState message={(error as Error).message} />
          ) : rows.length === 0 ? (
            <EmptyState description="کاربری یافت نشد." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام</TableHead>
                    <TableHead>ایمیل</TableHead>
                    <TableHead>موبایل</TableHead>
                    <TableHead>تاریخ عضویت</TableHead>
                    <TableHead>نقش</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.mobile ?? "—"}</TableCell>
                      <TableCell>{formatJalali(r.created_at)}</TableCell>
                      <TableCell>
                        <Select
                          value={r.role ?? "candidate"}
                          onValueChange={(v) =>
                            setRole.mutate({ id: r.id, role: v as "admin" | "candidate" })
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="candidate">داوطلب</SelectItem>
                            <SelectItem value="admin">مدیر سیستم</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "active" ? "default" : "secondary"}>
                          {statusLabels[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setStatus.mutate({
                              id: r.id,
                              status: r.status === "active" ? "inactive" : "active",
                            })
                          }
                        >
                          {r.status === "active" ? "غیرفعال‌سازی" : "فعال‌سازی"}
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
    </>
  );
}
