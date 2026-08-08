import type { ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  FolderTree,
  ClipboardList,
  Database,
  FileSpreadsheet,
  BarChart3,
  User as UserIcon,
  LogOut,
  GraduationCap,
  ListChecks,
  Loader2,
  Settings,
  History,
  Flag,
  KeyRound,
  CreditCard,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";

const adminItems = [
  { title: "داشبورد", url: "/dashboard", icon: LayoutDashboard },
  { title: "کاربران", url: "/users", icon: Users },
  { title: "دسته‌بندی‌ها", url: "/categories", icon: FolderTree },
  { title: "آزمون‌ها", url: "/exams", icon: ClipboardList },
  { title: "بانک سوالات", url: "/questions", icon: Database },
  { title: "بارگذاری اکسل", url: "/import", icon: FileSpreadsheet },
  { title: "گزارش‌ها", url: "/reports", icon: BarChart3 },
  { title: "گزارش خطای سوالات", url: "/question-reports", icon: Flag },
  { title: "گزارش فعالیت‌ها", url: "/audit", icon: History },
  { title: "مدیریت اشتراک‌ها", url: "/subscriptions", icon: CreditCard },
  { title: "کلید API هوش مصنوعی", url: "/ai-settings", icon: KeyRound },
  { title: "تنظیمات", url: "/settings", icon: Settings },
  { title: "پروفایل", url: "/profile", icon: UserIcon },
] as const;

const candidateItems = [
  { title: "داشبورد", url: "/dashboard", icon: LayoutDashboard },
  { title: "آزمون‌های در دسترس", url: "/my-exams", icon: GraduationCap },
  { title: "نتایج من", url: "/my-results", icon: ListChecks },
  { title: "اشتراک من", url: "/subscription", icon: CreditCard },
  { title: "پروفایل", url: "/profile", icon: UserIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const focusMode = pathname.startsWith("/attempt");

  const items = role === "admin" ? adminItems : candidateItems;

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (focusMode) return <div className="min-h-screen bg-muted/40">{children}</div>;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        در حال بارگذاری...
      </div>
    );
  }

  if (profile?.status === "inactive") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">حساب کاربری شما غیرفعال است</h1>
        <p className="text-sm text-muted-foreground">
          برای فعال‌سازی حساب با مدیر سامانه تماس بگیرید.
        </p>
        <Button variant="outline" onClick={handleSignOut}>
          خروج از حساب
        </Button>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/30">
        <Sidebar side="right" collapsible="icon">
          <SidebarContent>
            <div className="px-4 py-5 text-sidebar-foreground">
              <p className="truncate text-sm font-bold">سامانه آزمون آنلاین</p>
              <p className="mt-1 truncate text-xs opacity-70">
                {role === "admin" ? "پنل مدیریت" : "پنل داوطلب"}
              </p>
            </div>
            <SidebarGroup>
              <SidebarGroupLabel>منو</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={pathname === item.url}>
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="size-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleSignOut}>
                      <LogOut className="size-4" />
                      <span>خروج</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="flex items-center gap-3">
              <Badge variant={role === "admin" ? "default" : "secondary"}>
                {role === "admin" ? "مدیر سیستم" : "داوطلب"}
              </Badge>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {profile?.full_name || profile?.email}
              </span>
            </div>
          </header>
          <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
