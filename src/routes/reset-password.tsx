import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تغییر رمز عبور | سامانه آزمون آنلاین" },
      { name: "description", content: "تعیین رمز عبور جدید برای حساب کاربری سامانه آزمون آنلاین." },
      { property: "og:title", content: "تغییر رمز عبور" },
      { property: "og:description", content: "تعیین رمز عبور جدید در سامانه آزمون آنلاین." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async () => {
    if (password.length < 6) {
      toast.error("رمز عبور حداقل ۶ کاراکتر است");
      return;
    }
    if (password !== confirm) {
      toast.error("تکرار رمز عبور مطابقت ندارد");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("تغییر رمز عبور ناموفق بود");
      return;
    }
    toast.success("رمز عبور با موفقیت تغییر کرد");
    navigate({ to: "/dashboard" });
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader>
          <CardTitle>تعیین رمز عبور جدید</CardTitle>
          <CardDescription>
            {ready
              ? "رمز عبور جدید خود را وارد کنید."
              : "برای تغییر رمز عبور باید از لینک ارسال‌شده به ایمیل وارد شوید."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>رمز عبور جدید</Label>
            <Input
              dir="ltr"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>تکرار رمز عبور</Label>
            <Input
              dir="ltr"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button className="w-full" onClick={submit} disabled={loading || !ready}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "ذخیره رمز عبور"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
