-- 1) Unique, admin-only mobile on profiles
UPDATE public.profiles p SET mobile = NULL
WHERE mobile IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.profiles q
  WHERE q.mobile = p.mobile AND q.id <> p.id AND q.created_at < p.created_at
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_mobile_unique
  ON public.profiles (mobile) WHERE mobile IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'تغییر وضعیت حساب فقط توسط مدیر سامانه امکان‌پذیر است';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'تغییر ایمیل فقط توسط مدیر سامانه امکان‌پذیر است';
  END IF;
  IF NEW.mobile IS DISTINCT FROM OLD.mobile THEN
    RAISE EXCEPTION 'تغییر شماره موبایل فقط با تایید پیامکی امکان‌پذیر است';
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) SECURITY DEFINER functions: no anonymous execution at all
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- internal helpers / trigger functions must never be callable from the API
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_profile_admin_fields() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM authenticated, anon, PUBLIC;

-- 3) Question bank / answer key: never reachable by anonymous Data API callers
REVOKE ALL ON public.questions FROM anon;
REVOKE ALL ON public.question_options FROM anon;
REVOKE ALL ON public.exam_questions FROM anon;

-- candidates read questions only through SECURITY DEFINER RPCs that mask is_correct
DROP POLICY IF EXISTS question_options_admin ON public.question_options;
CREATE POLICY question_options_admin ON public.question_options
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON COLUMN public.question_options.is_correct IS
  'Answer key. Never expose to candidates via RLS; only get_attempt_review() may reveal it after submission.';

-- 4) OTP + SMS provider settings are server-only (service_role / SECURITY DEFINER)
REVOKE ALL ON public.sms_otp_codes FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.sms_settings FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.sms_otp_codes TO service_role;
GRANT ALL ON public.sms_settings TO service_role;
ALTER TABLE public.sms_otp_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sms_settings FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE public.sms_otp_codes IS
  'Server-only: written/read exclusively with the service role. RLS enabled with zero policies = deny all API access.';
COMMENT ON TABLE public.sms_settings IS
  'Server-only: SMS provider credentials. RLS enabled with zero policies = deny all API access.';