import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, GraduationCap, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  requestMobileOtp,
  verifyMobileOtp,
  requestSignupOtp,
  verifySignupOtp,
} from "@/lib/sms.functions";
import { otpErrorMessage } from "@/lib/sms-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ورود و ثبت‌نام | سامانه آزمون آنلاین استخدامی" },
      { name: "description", content: "ورود داوطلبان و مدیران به سامانه آزمون آنلاین استخدامی." },
      { property: "og:title", content: "ورود به سامانه آزمون آنلاین" },
      { property: "og:description", content: "ورود و ثبت‌نام داوطلبان سامانه آزمون آنلاین." },
    ],
  }),
  component: AuthPage,
});

const loginSchema = z.object({
  email: z.string().trim().email("ایمیل معتبر وارد کنید").max(255),
  password: z.string().min(6, "رمز عبور حداقل ۶ کاراکتر است").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onLogin = async (values: z.infer<typeof loginSchema>) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(values);
    setLoading(false);
    if (error) {
      toast.error(
        error.message.includes("Invalid login")
          ? "ایمیل یا رمز عبور نادرست است"
          : "ورود ناموفق بود",
      );
      return;
    }
    toast.success("خوش آمدید");
    navigate({ to: "/dashboard" });
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="surface-gradient hidden flex-col justify-center gap-6 p-12 text-primary-foreground lg:flex">
        <GraduationCap className="size-12" />
        <h1 className="text-3xl font-bold leading-relaxed">سامانه آزمون آنلاین استخدامی</h1>
        <p className="max-w-md text-sm leading-loose opacity-90">
          آزمون‌های استخدامی، تخصصی، عمومی و مهارتی را به‌صورت امن برگزار کنید؛ نتایج به‌صورت
          خودکار محاسبه و گزارش‌ها لحظه‌ای در دسترس مدیران قرار می‌گیرد.
        </p>
        <Link to="/" className="text-sm underline opacity-80">
          بازگشت به صفحه اصلی
        </Link>
      </section>

      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md card-elevated">
          <CardHeader>
            <CardTitle>ورود به سامانه</CardTitle>
            <CardDescription>برای شرکت در آزمون‌ها وارد شوید یا ثبت‌نام کنید.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">ورود</TabsTrigger>
                <TabsTrigger value="sms">ورود با پیامک</TabsTrigger>
                <TabsTrigger value="signup">ثبت‌نام داوطلب</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="pt-4">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ایمیل</FormLabel>
                          <FormControl>
                            <Input dir="ltr" placeholder="name@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>رمز عبور</FormLabel>
                          <FormControl>
                            <Input dir="ltr" type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="size-4 animate-spin" /> : "ورود"}
                    </Button>
                    <ForgotPasswordDialog />
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="sms" className="pt-4">
                <MobileOtpLogin />
              </TabsContent>

              <TabsContent value="signup" className="pt-4">
                <MobileOtpSignup />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function ForgotPasswordDialog() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      toast.error("ایمیل معتبر وارد کنید");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (error) toast.error("ارسال ایمیل بازیابی ناموفق بود");
    else toast.success("در صورت وجود حساب، ایمیل بازیابی ارسال شد");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="link" className="w-full">
          رمز عبور خود را فراموش کرده‌اید؟
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>بازیابی رمز عبور</DialogTitle>
          <DialogDescription>
            ایمیل خود را وارد کنید تا لینک بازیابی برای شما ارسال شود.
          </DialogDescription>
        </DialogHeader>
        <Input
          dir="ltr"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button onClick={send} disabled={sending}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : "ارسال لینک بازیابی"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function MobileOtpLogin() {
  const navigate = useNavigate();
  const requestOtp = useServerFn(requestMobileOtp);
  const verifyOtp = useServerFn(verifyMobileOtp);

  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"mobile" | "code">("mobile");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const send = async () => {
    if (!/^09\d{9}$/.test(mobile.trim())) {
      toast.error(otpErrorMessage("invalid_mobile"));
      return;
    }
    setBusy(true);
    try {
      const res = await requestOtp({ data: { mobile: mobile.trim() } });
      if (!res.success) {
        toast.error(otpErrorMessage(res.reason));
        return;
      }
      setStep("code");
      setCode("");
      setSecondsLeft(res.expiresInSeconds);
      toast.success("کد تأیید به شماره موبایل شما ارسال شد.");
    } catch {
      toast.error(otpErrorMessage("server_error"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error(otpErrorMessage("invalid_code"));
      return;
    }
    setBusy(true);
    try {
      const res = await verifyOtp({ data: { mobile: mobile.trim(), code: code.trim() } });
      if (!res.success) {
        toast.error(otpErrorMessage(res.reason));
        return;
      }
      const { error } = await supabase.auth.verifyOtp({
        email: res.email,
        token_hash: res.tokenHash,
        type: "email",
      });
      if (error) {
        toast.error(otpErrorMessage("server_error"));
        return;
      }
      toast.success("خوش آمدید");
      navigate({ to: "/dashboard" });
    } catch {
      toast.error(otpErrorMessage("server_error"));
    } finally {
      setBusy(false);
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (step === "mobile") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="otp-mobile">
            شماره موبایل
          </label>
          <Input
            id="otp-mobile"
            dir="ltr"
            inputMode="numeric"
            placeholder="09121234567"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </div>
        <Button className="w-full" onClick={send} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "دریافت کد تأیید"}
        </Button>
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <MessageSquare className="size-3.5" />
          کد تأیید فقط برای شماره‌های ثبت‌شده در سامانه ارسال می‌شود.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">کد تأیید به شماره موبایل شما ارسال شد.</p>
      <Input
        dir="ltr"
        inputMode="numeric"
        maxLength={6}
        placeholder="------"
        className="text-center tracking-[0.5em]"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <p className="text-muted-foreground text-center text-sm">
        {secondsLeft > 0 ? `اعتبار کد: ${mm}:${ss}` : "کد منقضی شده است"}
      </p>
      <Button className="w-full" onClick={verify} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : "ورود"}
      </Button>
      <div className="flex items-center justify-between">
        <Button type="button" variant="link" onClick={() => setStep("mobile")}>
          تغییر شماره
        </Button>
        <Button type="button" variant="link" onClick={send} disabled={busy || secondsLeft > 240}>
          {secondsLeft > 240 ? `ارسال مجدد (${secondsLeft - 240}s)` : "ارسال مجدد کد"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Candidate registration through a one-time password.
 * Step 1 collects the profile and sends a verification code; step 2 verifies
 * the code, creates the account and signs the candidate in.
 */
function MobileOtpSignup() {
  const navigate = useNavigate();
  const requestOtp = useServerFn(requestSignupOtp);
  const verifyOtp = useServerFn(verifySignupOtp);

  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"info" | "code">("info");
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const send = async () => {
    if (fullName.trim().length < 3) {
      toast.error("نام و نام خانوادگی را کامل وارد کنید");
      return;
    }
    if (!/^09\d{9}$/.test(mobile.trim())) {
      toast.error(otpErrorMessage("invalid_mobile"));
      return;
    }
    setBusy(true);
    try {
      const res = await requestOtp({ data: { mobile: mobile.trim(), fullName: fullName.trim() } });
      if (!res.success) {
        toast.error(otpErrorMessage(res.reason));
        return;
      }
      setStep("code");
      setCode("");
      setSecondsLeft(res.expiresInSeconds);
      toast.success("کد تأیید به شماره موبایل شما ارسال شد.");
    } catch {
      toast.error(otpErrorMessage("server_error"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error(otpErrorMessage("invalid_code"));
      return;
    }
    setBusy(true);
    try {
      const res = await verifyOtp({
        data: {
          mobile: mobile.trim(),
          code: code.trim(),
          fullName: fullName.trim(),
        },

      });
      if (!res.success) {
        toast.error(otpErrorMessage(res.reason));
        return;
      }
      const { error } = await supabase.auth.verifyOtp({
        email: res.email,
        token_hash: res.tokenHash,
        type: "email",
      });
      if (error) {
        toast.error(otpErrorMessage("server_error"));
        return;
      }
      toast.success("ثبت‌نام شما با موفقیت انجام شد");
      navigate({ to: "/dashboard" });
    } catch {
      toast.error(otpErrorMessage("server_error"));
    } finally {
      setBusy(false);
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (step === "info") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="signup-name">
            نام و نام خانوادگی
          </label>
          <Input
            id="signup-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="signup-mobile">
            شماره موبایل
          </label>
          <Input
            id="signup-mobile"
            dir="ltr"
            inputMode="numeric"
            placeholder="09121234567"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Button className="w-full" onClick={send} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "ارسال کد تأیید"}
        </Button>
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <MessageSquare className="size-3.5" />
          ثبت‌نام بدون رمز عبور انجام می‌شود؛ ورودهای بعدی نیز با رمز یک‌بار مصرف پیامکی است.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        کد تأیید به شماره {mobile} ارسال شد.
      </p>
      <Input
        dir="ltr"
        inputMode="numeric"
        maxLength={6}
        placeholder="------"
        className="text-center tracking-[0.5em]"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <p className="text-muted-foreground text-center text-sm">
        {secondsLeft > 0 ? `اعتبار کد: ${mm}:${ss}` : "کد منقضی شده است"}
      </p>
      <Button className="w-full" onClick={verify} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : "تأیید و ثبت‌نام"}
      </Button>
      <div className="flex items-center justify-between">
        <Button type="button" variant="link" onClick={() => setStep("info")}>
          اصلاح اطلاعات
        </Button>
        <Button type="button" variant="link" onClick={send} disabled={busy || secondsLeft > 240}>
          {secondsLeft > 240 ? `ارسال مجدد (${secondsLeft - 240}s)` : "ارسال مجدد کد"}
        </Button>
      </div>
    </div>
  );
}
