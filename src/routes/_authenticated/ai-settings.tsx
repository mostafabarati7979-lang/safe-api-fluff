import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, InlineLoading, ErrorState, RequireAdmin } from "@/components/ui-states";

export const Route = createFileRoute("/_authenticated/ai-settings")({
  head: () => ({
    meta: [
      { title: "مدیریت کلید API هوش مصنوعی | سامانه آزمون آنلاین" },
      {
        name: "description",
        content: "تنظیم ارائه‌دهنده، مدل و کلید API سرویس هوش مصنوعی سامانه آزمون.",
      },
      { property: "og:title", content: "مدیریت کلید API هوش مصنوعی" },
      { property: "og:description", content: "تنظیم کلید API و مدل هوش مصنوعی سامانه آزمون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <AiSettingsPage />
    </RequireAdmin>
  ),
});

type AiSettings = {
  provider: string;
  model: string;
  api_key: string | null;
  cache_enabled: boolean;
};

function AiSettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<AiSettings>({
    provider: "lovable",
    model: "google/gemini-3.5-flash",
    api_key: "",
    cache_enabled: true,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: async (): Promise<AiSettings> => {
      const { data, error } = await supabase
        .from("ai_settings")
        .select("provider, model, api_key, cache_enabled")
        .maybeSingle();
      if (error) throw error;
      return (
        (data as AiSettings | null) ?? {
          provider: "lovable",
          model: "google/gemini-3.5-flash",
          api_key: "",
          cache_enabled: true,
        }
      );
    },
  });

  useEffect(() => {
    if (data) setForm({ ...data, api_key: data.api_key ?? "" });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (form.provider === "custom" && !(form.api_key ?? "").trim()) {
        throw new Error("برای ارائه‌دهنده اختصاصی، کلید API الزامی است");
      }
      const { error } = await supabase.from("ai_settings").update({
        provider: form.provider,
        model: form.model.trim(),
        api_key: (form.api_key ?? "").trim() || null,
        cache_enabled: form.cache_enabled,
      }).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تنظیمات هوش مصنوعی ذخیره شد");
      void qc.invalidateQueries({ queryKey: ["ai-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="مدیریت کلید API هوش مصنوعی"
        description="ارائه‌دهنده، مدل و کلید API سرویس هوش مصنوعی"
      />
      <Card className="card-elevated mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" />
            تنظیمات سرویس
          </CardTitle>
          <CardDescription>
            در حالت پیش‌فرض از سرویس داخلی استفاده می‌شود و نیازی به کلید نیست.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <InlineLoading />
          ) : error ? (
            <ErrorState message={(error as Error).message} />
          ) : (
            <>
              <div className="space-y-2">
                <Label>ارائه‌دهنده</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lovable">سرویس داخلی (بدون کلید)</SelectItem>
                    <SelectItem value="custom">کلید اختصاصی</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-model">مدل</Label>
                <Input
                  id="ai-model"
                  dir="ltr"
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="google/gemini-3.5-flash"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-key">کلید API</Label>
                <Input
                  id="ai-key"
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  value={form.api_key ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                  placeholder="••••••••"
                />
                <p className="text-xs text-muted-foreground">
                  کلید فقط روی سرور استفاده می‌شود و برای داوطلبان قابل مشاهده نیست.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">ذخیره پاسخ‌های هوش مصنوعی</p>
                  <p className="text-xs text-muted-foreground">
                    پاسخ هر سوال یک‌بار تولید و برای داوطلبان بعدی از حافظه ارسال می‌شود.
                  </p>
                </div>
                <Switch
                  checked={form.cache_enabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, cache_enabled: v }))}
                />
              </div>

              <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
                <Save className="size-4" />
                ذخیره تنظیمات
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
