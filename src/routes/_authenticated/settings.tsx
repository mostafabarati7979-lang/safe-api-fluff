import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, ShieldCheck, MessageSquare, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import {
  getSmsSettings,
  saveSmsSettings,
  sendTestSms,
} from "@/lib/sms-settings.functions";
import { otpErrorMessage } from "@/lib/sms-messages";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader, InlineLoading, ErrorState } from "@/components/ui-states";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "تنظیمات سامانه | پنل مدیریت" },
      { name: "description", content: "پیکربندی عمومی سامانه آزمون آنلاین؛ عنوان سامانه، ثبت‌نام و مقادیر پیش‌فرض آزمون." },
      { property: "og:title", content: "تنظیمات سامانه" },
      { property: "og:description", content: "پیکربندی عمومی سامانه آزمون آنلاین." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type General = {
  site_title: string;
  support_email: string;
  allow_signup: boolean;
  default_duration_minutes: number;
  default_passing_score: number;
};

const fallback: General = {
  site_title: "سامانه آزمون آنلاین",
  support_email: "",
  allow_signup: true,
  default_duration_minutes: 30,
  default_passing_score: 50,
};

function SettingsPage() {
  const { role, refresh } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<General>(fallback);

  const settings = useQuery({
    queryKey: ["app-settings"],
    queryFn: async (): Promise<General> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "general")
        .maybeSingle();
      if (error) throw error;
      return { ...fallback, ...((data?.value as Partial<General> | null) ?? {}) };
    },
  });

  const adminCount = useQuery({
    queryKey: ["admin-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .update({ value: form, updated_at: new Date().toISOString() })
        .eq("key", "general");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تنظیمات ذخیره شد");
      void qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const claimAdmin = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("claim_first_admin");
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("دسترسی مدیریت برای حساب شما فعال شد");
      await refresh();
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noAdmin = (adminCount.data ?? 0) === 0;

  if (settings.isLoading) return <InlineLoading />;
  if (settings.error) return <ErrorState message={(settings.error as Error).message} />;

  return (
    <>
      <PageHeader
        title="تنظیمات سامانه"
        description="پیکربندی عمومی سامانه و مقادیر پیش‌فرض آزمون‌ها"
        action={
          <Button onClick={() => save.mutate()} disabled={save.isPending || role !== "admin"}>
            <Save className="size-4" />
            ذخیره تنظیمات
          </Button>
        }
      />

      {noAdmin ? (
        <Card className="card-elevated mb-4 border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" />
              هنوز مدیری برای سامانه تعریف نشده است
            </CardTitle>
            <CardDescription>
              اولین کاربر می‌تواند دسترسی مدیریت را برای خود فعال کند. پس از آن این گزینه غیرفعال می‌شود.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => claimAdmin.mutate()} disabled={claimAdmin.isPending}>
              فعال‌سازی دسترسی مدیریت
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">اطلاعات عمومی</CardTitle>
            <CardDescription>نام سامانه و راه ارتباطی پشتیبانی</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site_title">عنوان سامانه</Label>
              <Input
                id="site_title"
                value={form.site_title}
                onChange={(e) => setForm((f) => ({ ...f, site_title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support_email">ایمیل پشتیبانی</Label>
              <Input
                id="support_email"
                type="email"
                dir="ltr"
                value={form.support_email}
                onChange={(e) => setForm((f) => ({ ...f, support_email: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">امکان ثبت‌نام داوطلبان</p>
                <p className="text-xs text-muted-foreground">
                  در صورت غیرفعال بودن، فقط مدیر می‌تواند کاربر اضافه کند.
                </p>
              </div>
              <Switch
                checked={form.allow_signup}
                onCheckedChange={(v) => setForm((f) => ({ ...f, allow_signup: v }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">پیش‌فرض آزمون‌ها</CardTitle>
            <CardDescription>مقادیر پیشنهادی هنگام ساخت آزمون جدید</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="duration">مدت زمان پیش‌فرض (دقیقه)</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                value={form.default_duration_minutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_duration_minutes: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passing">حد نصاب قبولی پیش‌فرض (درصد)</Label>
              <Input
                id="passing"
                type="number"
                min={0}
                max={100}
                value={form.default_passing_score}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_passing_score: Number(e.target.value) }))
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <SmsSettingsCard isAdmin={role === "admin"} />
    </>
  );
}

/** Admin-managed SMS provider credentials (API key + template ids). */
function SmsSettingsCard({ isAdmin }: { isAdmin: boolean }) {
  const load = useServerFn(getSmsSettings);
  const persist = useServerFn(saveSmsSettings);
  const test = useServerFn(sendTestSms);

  const [apiKey, setApiKey] = useState("");
  const [verifyTemplateId, setVerifyTemplateId] = useState("");
  const [welcomeTemplateId, setWelcomeTemplateId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [testMobile, setTestMobile] = useState("");

  const query = useQuery({
    queryKey: ["sms-settings"],
    queryFn: () => load({ data: undefined }),
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!query.data) return;
    setVerifyTemplateId(query.data.verifyTemplateId);
    setWelcomeTemplateId(query.data.welcomeTemplateId);
    setEnabled(query.data.enabled);
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () =>
      persist({
        data: {
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          verifyTemplateId,
          welcomeTemplateId,
          enabled,
        },
      }),
    onSuccess: async () => {
      setApiKey("");
      toast.success("تنظیمات پیامک ذخیره شد");
      await query.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: async () => test({ data: { mobile: testMobile.trim() } }),
    onSuccess: (res) => {
      if (res.success) toast.success("پیامک آزمایشی ارسال شد");
      else toast.error(otpErrorMessage(res.reason ?? "send_failed"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  return (
    <Card className="card-elevated mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4" />
          پنل پیامک (SMS.ir)
        </CardTitle>
        <CardDescription>
          کلید API و شناسه قالب‌های پیامک برای ارسال کد تأیید و رمز یک‌بار مصرف
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sms_api_key">کلید API</Label>
            <Input
              id="sms_api_key"
              dir="ltr"
              type="password"
              placeholder={query.data?.hasApiKey ? (query.data.apiKeyMasked ?? "****") : "کلید API را وارد کنید"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              برای حفظ کلید فعلی، این فیلد را خالی بگذارید.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms_verify_template">شناسه قالب کد تأیید</Label>
            <Input
              id="sms_verify_template"
              dir="ltr"
              inputMode="numeric"
              value={verifyTemplateId}
              onChange={(e) => setVerifyTemplateId(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">پارامتر قالب باید CODE باشد.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms_welcome_template">شناسه قالب خوش‌آمدگویی (اختیاری)</Label>
            <Input
              id="sms_welcome_template"
              dir="ltr"
              inputMode="numeric"
              value={welcomeTemplateId}
              onChange={(e) => setWelcomeTemplateId(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">پارامتر قالب باید NAME باشد.</p>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">فعال بودن سرویس پیامک</p>
              <p className="text-muted-foreground text-xs">
                در صورت غیرفعال بودن، ارسال کد تأیید انجام نمی‌شود.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="size-4" />
            ذخیره تنظیمات پیامک
          </Button>
          <div className="space-y-2">
            <Label htmlFor="sms_test_mobile">ارسال پیامک آزمایشی</Label>
            <div className="flex gap-2">
              <Input
                id="sms_test_mobile"
                dir="ltr"
                inputMode="numeric"
                placeholder="09121234567"
                value={testMobile}
                onChange={(e) => setTestMobile(e.target.value.replace(/\D/g, ""))}
              />
              <Button
                variant="outline"
                onClick={() => sendTest.mutate()}
                disabled={sendTest.isPending || !/^09\d{9}$/.test(testMobile.trim())}
              >
                <Send className="size-4" />
                ارسال
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
