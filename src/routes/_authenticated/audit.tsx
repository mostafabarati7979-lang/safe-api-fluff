import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, InlineLoading, ErrorState, EmptyState } from "@/components/ui-states";
import { formatJalaliDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "گزارش فعالیت‌ها | پنل مدیریت" },
      { name: "description", content: "تاریخچه اقدامات مدیران سامانه؛ ساخت و ویرایش آزمون، سوالات، نقش کاربران و بارگذاری گروهی." },
      { property: "og:title", content: "گزارش فعالیت‌ها" },
      { property: "og:description", content: "تاریخچه اقدامات مدیران سامانه آزمون آنلاین." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditPage,
});

type LogRow = {
  id: string;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: unknown;
  created_at: string;
};

const actionLabels: Record<string, string> = {
  create: "ایجاد",
  update: "ویرایش",
  delete: "حذف",
  assign: "دعوت داوطلب",
  import: "بارگذاری گروهی",
  set_role: "تغییر نقش",
  claim_admin: "فعال‌سازی مدیر",
};

const entityLabels: Record<string, string> = {
  exam: "آزمون",
  question: "سوال",
  user: "کاربر",
};

function AuditPage() {
  const [q, setQ] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async (): Promise<LogRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_name, action, entity, entity_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const term = q.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (r) =>
      !term ||
      (r.actor_name ?? "").toLowerCase().includes(term) ||
      (actionLabels[r.action] ?? r.action).includes(term) ||
      (entityLabels[r.entity] ?? r.entity).includes(term),
  );

  return (
    <>
      <PageHeader
        title="گزارش فعالیت‌ها"
        description="آخرین اقدامات انجام‌شده توسط مدیران سامانه"
      />

      <Card className="card-elevated">
        <CardContent className="p-4">
          <Input
            placeholder="جستجو بر اساس کاربر، اقدام یا بخش..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-4 max-w-sm"
          />

          {isLoading ? (
            <InlineLoading />
          ) : error ? (
            <ErrorState message={(error as Error).message} />
          ) : rows.length === 0 ? (
            <EmptyState title="فعالیتی ثبت نشده است" description="پس از انجام اقدامات مدیریتی، تاریخچه اینجا نمایش داده می‌شود." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>زمان</TableHead>
                    <TableHead>کاربر</TableHead>
                    <TableHead>اقدام</TableHead>
                    <TableHead>بخش</TableHead>
                    <TableHead>جزئیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatJalaliDateTime(r.created_at)}
                      </TableCell>
                      <TableCell>{r.actor_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{actionLabels[r.action] ?? r.action}</Badge>
                      </TableCell>
                      <TableCell>{entityLabels[r.entity] ?? r.entity}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                        {JSON.stringify(r.details)}
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
