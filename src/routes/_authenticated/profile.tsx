import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader, InlineLoading } from "@/components/ui-states";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "پروفایل | سامانه آزمون آنلاین" },
      { name: "description", content: "ویرایش اطلاعات پروفایل کاربری." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, role, loading, refresh } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setMobile(profile.mobile ?? "");
  }, [profile?.id, profile?.full_name, profile?.mobile]);

  if (loading) return <InlineLoading />;

  const save = async () => {
    if (!profile) {
      toast.error("اطلاعات کاربر دریافت نشده است");
      return;
    }
    const name = fullName.trim();
    if (name.length < 3) {
      toast.error("نام و نام خانوادگی الزامی است");
      return;
    }
    setSaving(true);
    // Mobile is verified via SMS OTP and enforced unique in the database;
    // it is intentionally not part of this update.
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("id", profile.id);

    setSaving(false);
    if (error) {
      toast.error("ذخیره تغییرات ناموفق بود");
      return;
    }
    toast.success("پروفایل به‌روزرسانی شد");
    await refresh();
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  return (
    <>
      <PageHeader title="پروفایل" description="اطلاعات حساب کاربری خود را ویرایش کنید" />
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="card-elevated">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-primary/10 p-3 text-primary">
                <UserIcon className="size-5" />
              </span>
              <div>
                <CardTitle>اطلاعات کاربری</CardTitle>
                <CardDescription>{profile?.email ?? "—"}</CardDescription>
              </div>
              <Badge variant={role === "admin" ? "default" : "secondary"} className="mr-auto">
                {role === "admin" ? "مدیر سیستم" : "داوطلب"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full-name">نام و نام خانوادگی</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile">شماره موبایل</Label>
              <Input
                id="mobile"
                dir="ltr"
                value={mobile}
                readOnly
                disabled
                placeholder="ثبت‌نشده"
              />
              <p className="text-muted-foreground text-xs">
                شماره موبایل با تأیید پیامکی ثبت می‌شود و قابل ویرایش دستی نیست. برای تغییر آن با
                پشتیبانی تماس بگیرید.
              </p>
            </div>

            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "ذخیره تغییرات"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
