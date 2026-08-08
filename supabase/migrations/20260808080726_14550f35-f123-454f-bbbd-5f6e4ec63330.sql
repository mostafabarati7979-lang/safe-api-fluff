CREATE TABLE public.sms_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  request_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.sms_otp_codes TO service_role;
ALTER TABLE public.sms_otp_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sms_otp_codes_mobile_created ON public.sms_otp_codes (mobile, created_at DESC);
CREATE INDEX idx_sms_otp_codes_ip_created ON public.sms_otp_codes (request_ip, created_at DESC);

CREATE TRIGGER trg_sms_otp_codes_updated_at
BEFORE UPDATE ON public.sms_otp_codes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sms_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_masked text NOT NULL,
  purpose text NOT NULL DEFAULT 'verification',
  success boolean NOT NULL DEFAULT false,
  provider_status integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.sms_delivery_logs TO service_role;
ALTER TABLE public.sms_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_delivery_logs_admin_select ON public.sms_delivery_logs
FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.sms_delivery_logs TO authenticated;

CREATE INDEX idx_sms_delivery_logs_created ON public.sms_delivery_logs (created_at DESC);