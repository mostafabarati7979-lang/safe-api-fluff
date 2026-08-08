import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Timer, BarChart3, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سامانه آزمون آنلاین استخدامی | برگزاری آزمون سازمانی" },
      {
        name: "description",
        content:
          "پلتفرم برگزاری آزمون آنلاین استخدامی، تخصصی و مهارتی؛ بانک سوالات، تایمر امن، تصحیح خودکار و گزارش‌های مدیریتی.",
      },
      { property: "og:title", content: "سامانه آزمون آنلاین استخدامی | برگزاری آزمون سازمانی" },
      {
        property: "og:description",
        content: "پلتفرم برگزاری آزمون آنلاین استخدامی، تخصصی و مهارتی؛ بانک سوالات، تایمر امن، تصحیح خودکار و گزارش‌های مدیریتی.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: ShieldCheck,
    title: "امنیت آزمون",
    text: "پاسخ صحیح پیش از پایان آزمون هرگز به مرورگر ارسال نمی‌شود و نمره در سرور محاسبه می‌گردد.",
  },
  {
    icon: Timer,
    title: "تایمر سروری",
    text: "زمان آزمون بر اساس ساعت سرور کنترل می‌شود و با بستن مرورگر از بین نمی‌رود.",
  },
  {
    icon: FileSpreadsheet,
    title: "ورود گروهی سوالات",
    text: "بارگذاری سوالات از فایل اکسل همراه با پیش‌نمایش و اعتبارسنجی ردیف‌به‌ردیف.",
  },
  {
    icon: BarChart3,
    title: "گزارش‌های مدیریتی",
    text: "میانگین نمرات، نرخ قبولی، آزمون‌های پرمخاطب و خروجی اکسل.",
  },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <header className="surface-gradient text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <span className="text-lg font-bold">سامانه آزمون آنلاین</span>
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/auth">ورود / ثبت‌نام</Link>
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 text-center">
          <h1 className="text-3xl font-bold leading-relaxed sm:text-5xl">
            برگزاری آزمون‌های استخدامی، تخصصی و مهارتی به‌صورت آنلاین
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-loose opacity-90 sm:text-base">
            ساخت بانک سوالات، تعریف آزمون، دعوت داوطلبان، برگزاری امن آزمون و دریافت گزارش‌های
            دقیق؛ همه در یک سامانه یکپارچه.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">شروع کنید</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto -mt-12 max-w-6xl px-4 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title} className="card-elevated border-border/60">
              <CardContent className="space-y-3 p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </span>
                <h2 className="text-base font-semibold">{f.title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
