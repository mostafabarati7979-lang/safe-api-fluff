CREATE TABLE IF NOT EXISTS public.sms_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider text NOT NULL DEFAULT 'smsir',
  api_key text,
  verify_template_id text,
  welcome_template_id text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

REVOKE ALL ON public.sms_settings FROM anon, authenticated;
GRANT ALL ON public.sms_settings TO service_role;
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.sms_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

DROP FUNCTION IF EXISTS public._tmp_exec_sql(text);