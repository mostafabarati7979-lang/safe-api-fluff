/** Client-safe mapping of OTP/SMS failure codes to user-facing Persian text. */
export const OTP_ERROR_MESSAGES: Record<string, string> = {
  invalid_mobile: "شماره موبایل معتبر وارد کنید (۰۹xxxxxxxxx)",
  rate_limited: "تعداد درخواست‌های شما زیاد است؛ کمی بعد دوباره تلاش کنید",
  cooldown: "برای ارسال مجدد کد کمی صبر کنید",
  send_failed: "ارسال پیامک انجام نشد؛ لطفاً دوباره تلاش کنید",
  not_registered: "حسابی با این شماره موبایل ثبت نشده است",
  expired: "کد تأیید منقضی شده است؛ کد جدید دریافت کنید",
  invalid_code: "کد تأیید نادرست است",
  too_many_attempts: "تعداد تلاش‌های ناموفق زیاد است؛ کد جدید دریافت کنید",
  already_registered: "این شماره موبایل قبلاً ثبت شده است؛ وارد شوید",
  not_configured: "سرویس پیامک هنوز پیکربندی نشده است",
  server_error: "خطای موقت سامانه؛ لطفاً دوباره تلاش کنید",
};

export function otpErrorMessage(reason?: string | null): string {
  return (reason && OTP_ERROR_MESSAGES[reason]) || OTP_ERROR_MESSAGES["server_error"]!;
}
