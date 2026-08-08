CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  duration_months integer NOT NULL CHECK (duration_months > 0),
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_select ON public.plans FOR SELECT TO authenticated USING (is_active OR public.is_admin());
CREATE POLICY plans_admin_all ON public.plans FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.plans (title, duration_months, price, display_order) VALUES
  ('اشتراک یک‌ماهه', 1, 150000, 1),
  ('اشتراک سه‌ماهه', 3, 450000, 2),
  ('اشتراک شش‌ماهه', 6, 900000, 3),
  ('اشتراک یک‌ساله', 12, 1800000, 4);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','expired','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON public.subscriptions (user_id, expires_at DESC);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY subscriptions_admin_all ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  gateway text NOT NULL DEFAULT 'manual',
  transaction_id text,
  authority text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_user ON public.payments (user_id, created_at DESC);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY payments_admin_all ON public.payments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.admin_subscription_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  days integer NOT NULL,
  reason text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_subscription_grants TO authenticated;
GRANT ALL ON public.admin_subscription_grants TO service_role;
ALTER TABLE public.admin_subscription_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY grants_admin_all ON public.admin_subscription_grants FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.profiles
  ADD COLUMN trial_started_at timestamptz,
  ADD COLUMN trial_ends_at timestamptz,
  ADD COLUMN has_used_trial boolean NOT NULL DEFAULT false;

CREATE TABLE public.trial_claims (
  email text PRIMARY KEY,
  first_user_id uuid,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trial_claims TO authenticated;
GRANT ALL ON public.trial_claims TO service_role;
ALTER TABLE public.trial_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY trial_claims_admin ON public.trial_claims FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.status IN ('trial','active')
      AND s.expires_at > now()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_subscription()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); s public.subscriptions; p public.plans; pr public.profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ابتدا وارد حساب کاربری شوید'; END IF;
  SELECT * INTO pr FROM public.profiles WHERE id = v_uid;
  SELECT * INTO s FROM public.subscriptions
   WHERE user_id = v_uid ORDER BY (status IN ('trial','active') AND expires_at > now()) DESC, expires_at DESC LIMIT 1;
  IF s.plan_id IS NOT NULL THEN SELECT * INTO p FROM public.plans WHERE id = s.plan_id; END IF;
  RETURN jsonb_build_object(
    'has_active', public.has_active_subscription(v_uid),
    'has_used_trial', COALESCE(pr.has_used_trial, false),
    'trial_started_at', pr.trial_started_at,
    'trial_ends_at', pr.trial_ends_at,
    'server_now', now(),
    'subscription', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', s.id, 'status', s.status, 'started_at', s.started_at, 'expires_at', s.expires_at,
      'plan_title', p.title, 'plan_id', s.plan_id,
      'remaining_days', GREATEST(0, ceil(EXTRACT(epoch FROM (s.expires_at - now())) / 86400)::int)
    ) END
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.my_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_subscription() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text := lower(coalesce(NEW.email,'')); v_used boolean := false; v_ends timestamptz;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, mobile)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, NEW.raw_user_meta_data->>'mobile')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'candidate')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_email <> '' THEN
    SELECT true INTO v_used FROM public.trial_claims WHERE email = v_email;
  END IF;

  IF NOT COALESCE(v_used, false) THEN
    v_ends := now() + interval '30 days';
    INSERT INTO public.subscriptions (user_id, status, started_at, expires_at)
    VALUES (NEW.id, 'trial', now(), v_ends);
    UPDATE public.profiles SET trial_started_at = now(), trial_ends_at = v_ends, has_used_trial = true
    WHERE id = NEW.id;
    IF v_email <> '' THEN
      INSERT INTO public.trial_claims (email, first_user_id) VALUES (v_email, NEW.id)
      ON CONFLICT (email) DO NOTHING;
    END IF;
  ELSE
    UPDATE public.profiles SET has_used_trial = true WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_grant_subscription(
  p_user_id uuid, p_days integer, p_reason text DEFAULT NULL, p_plan_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base timestamptz; v_new timestamptz; v_sub public.subscriptions; v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF p_days IS NULL OR p_days <= 0 OR p_days > 3650 THEN RAISE EXCEPTION 'تعداد روز نامعتبر است'; END IF;

  SELECT * INTO v_sub FROM public.subscriptions
   WHERE user_id = p_user_id AND status IN ('trial','active') AND expires_at > now()
   ORDER BY expires_at DESC LIMIT 1;

  v_base := GREATEST(COALESCE(v_sub.expires_at, now()), now());
  v_new := v_base + make_interval(days => p_days);

  IF v_sub.id IS NOT NULL AND v_sub.status = 'active' THEN
    UPDATE public.subscriptions SET expires_at = v_new, plan_id = COALESCE(p_plan_id, plan_id)
     WHERE id = v_sub.id RETURNING id INTO v_id;
  ELSE
    IF v_sub.id IS NOT NULL THEN
      UPDATE public.subscriptions SET status = 'expired' WHERE id = v_sub.id;
    END IF;
    INSERT INTO public.subscriptions (user_id, plan_id, status, started_at, expires_at, created_by)
    VALUES (p_user_id, p_plan_id, 'active', now(), v_new, auth.uid()) RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.admin_subscription_grants (admin_id, user_id, days, reason, expires_at)
  VALUES (auth.uid(), p_user_id, p_days, NULLIF(trim(coalesce(p_reason,'')),''), v_new);

  PERFORM public.log_audit('grant_subscription','user',p_user_id, jsonb_build_object('days',p_days,'expires_at',v_new));
  RETURN jsonb_build_object('subscription_id', v_id, 'expires_at', v_new);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_grant_subscription(uuid,integer,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(uuid,integer,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_subscription_status(p_user_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF p_status NOT IN ('active','expired','cancelled') THEN RAISE EXCEPTION 'وضعیت نامعتبر است'; END IF;
  SELECT id INTO v_id FROM public.subscriptions WHERE user_id = p_user_id
   ORDER BY (status IN ('trial','active') AND expires_at > now()) DESC, expires_at DESC LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'اشتراکی برای این کاربر یافت نشد'; END IF;
  UPDATE public.subscriptions
     SET status = p_status,
         expires_at = CASE WHEN p_status IN ('expired','cancelled') THEN LEAST(expires_at, now()) ELSE expires_at END
   WHERE id = v_id;
  PERFORM public.log_audit('subscription_status','user',p_user_id, jsonb_build_object('status',p_status,'reason',p_reason));
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_subscription_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription_status(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(p_search text DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS TABLE(user_id uuid, full_name text, email text, mobile text, subscription_id uuid,
  status text, plan_title text, started_at timestamptz, expires_at timestamptz,
  remaining_days integer, has_used_trial boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.mobile, s.id,
    COALESCE(CASE WHEN s.expires_at <= now() AND s.status IN ('trial','active') THEN 'expired' ELSE s.status END, 'expired'),
    pl.title, s.started_at, s.expires_at,
    GREATEST(0, ceil(EXTRACT(epoch FROM (s.expires_at - now()))/86400)::int), p.has_used_trial
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT * FROM public.subscriptions x WHERE x.user_id = p.id
     ORDER BY (x.status IN ('trial','active') AND x.expires_at > now()) DESC, x.expires_at DESC LIMIT 1
  ) s ON true
  LEFT JOIN public.plans pl ON pl.id = s.plan_id
  WHERE (p_search IS NULL OR trim(p_search) = '' OR p.full_name ILIKE '%'||p_search||'%'
         OR p.email ILIKE '%'||p_search||'%' OR p.mobile ILIKE '%'||p_search||'%')
    AND (p_status IS NULL OR p_status = 'all'
         OR (CASE WHEN s.id IS NULL THEN 'expired'
                  WHEN s.expires_at <= now() AND s.status IN ('trial','active') THEN 'expired'
                  ELSE s.status END) = p_status)
  ORDER BY s.expires_at DESC NULLS LAST
  LIMIT 200;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_list_subscriptions(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_subscriptions(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_subscription_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  SELECT jsonb_build_object(
    'active', (SELECT count(*) FROM public.subscriptions WHERE status='active' AND expires_at>now()),
    'trial', (SELECT count(*) FROM public.subscriptions WHERE status='trial' AND expires_at>now()),
    'expired', (SELECT count(*) FROM public.subscriptions WHERE expires_at<=now() OR status IN ('expired','cancelled')),
    'expiring_7d', (SELECT count(*) FROM public.subscriptions WHERE status IN ('trial','active') AND expires_at BETWEEN now() AND now()+interval '7 days'),
    'revenue_month', (SELECT COALESCE(sum(amount),0) FROM public.payments WHERE status='paid' AND paid_at >= date_trunc('month', now())),
    'revenue_total', (SELECT COALESCE(sum(amount),0) FROM public.payments WHERE status='paid'),
    'newest', (SELECT COALESCE(jsonb_agg(jsonb_build_object('full_name',p.full_name,'email',p.email,'status',s.status,'expires_at',s.expires_at) ORDER BY s.created_at DESC),'[]'::jsonb)
               FROM (SELECT * FROM public.subscriptions ORDER BY created_at DESC LIMIT 5) s
               JOIN public.profiles p ON p.id = s.user_id)
  ) INTO r;
  RETURN r;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_subscription_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subscription_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.start_attempt(p_exam_id uuid, p_category_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_exam public.exams; v_attempt uuid; v_count integer; v_total numeric; v_qcount integer;
  v_cats uuid[] := CASE WHEN p_category_ids IS NULL OR array_length(p_category_ids,1) IS NULL THEN NULL ELSE p_category_ids END;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ابتدا وارد حساب کاربری شوید'; END IF;
  IF NOT public.is_admin() AND NOT public.has_active_subscription(v_uid) THEN
    RAISE EXCEPTION 'اشتراک شما منقضی شده است. برای ادامه، اشتراک خود را تمدید کنید';
  END IF;
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  IF v_exam.id IS NULL THEN RAISE EXCEPTION 'آزمون یافت نشد'; END IF;
  IF v_exam.status <> 'published' THEN RAISE EXCEPTION 'این آزمون در دسترس نیست'; END IF;
  IF (SELECT status FROM public.profiles WHERE id = v_uid) = 'inactive' THEN
    RAISE EXCEPTION 'حساب کاربری شما غیرفعال است';
  END IF;
  IF v_exam.access_type = 'assigned' AND NOT EXISTS (
    SELECT 1 FROM public.exam_assignments WHERE exam_id = p_exam_id AND candidate_id = v_uid
  ) THEN RAISE EXCEPTION 'شما به این آزمون دعوت نشده‌اید'; END IF;

  UPDATE public.exam_attempts SET status = 'expired'
  WHERE candidate_id = v_uid AND status = 'in_progress' AND expires_at < now();

  SELECT id INTO v_attempt FROM public.exam_attempts
  WHERE exam_id = p_exam_id AND candidate_id = v_uid AND status = 'in_progress'
  ORDER BY started_at DESC LIMIT 1;
  IF v_attempt IS NOT NULL THEN RETURN v_attempt; END IF;

  SELECT count(*) INTO v_count FROM public.exam_attempts WHERE exam_id = p_exam_id AND candidate_id = v_uid;
  IF v_count >= v_exam.max_attempts THEN RAISE EXCEPTION 'تعداد دفعات مجاز شرکت در این آزمون تمام شده است'; END IF;

  SELECT COALESCE(sum(eq.score),0), count(*) INTO v_total, v_qcount
  FROM public.exam_questions eq JOIN public.questions q ON q.id = eq.question_id
  WHERE eq.exam_id = p_exam_id
    AND (v_cats IS NULL OR COALESCE(q.category_id,'00000000-0000-0000-0000-000000000000'::uuid) = ANY(v_cats));
  IF v_total = 0 THEN RAISE EXCEPTION 'برای مباحث انتخاب‌شده سوالی ثبت نشده است'; END IF;

  INSERT INTO public.exam_attempts (exam_id, candidate_id, expires_at, total_score, unanswered_count, category_ids)
  VALUES (p_exam_id, v_uid, now() + make_interval(mins => v_exam.duration_minutes), v_total, v_qcount, v_cats)
  RETURNING id INTO v_attempt;
  RETURN v_attempt;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.start_attempt(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_attempt(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_payment_intent(p_plan_id uuid, p_gateway text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); pl public.plans; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ابتدا وارد حساب کاربری شوید'; END IF;
  SELECT * INTO pl FROM public.plans WHERE id = p_plan_id AND is_active;
  IF pl.id IS NULL THEN RAISE EXCEPTION 'طرح انتخابی در دسترس نیست'; END IF;
  INSERT INTO public.payments (user_id, plan_id, amount, gateway, status)
  VALUES (v_uid, pl.id, pl.price, COALESCE(NULLIF(p_gateway,''),'manual'), 'pending')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('payment_id', v_id, 'amount', pl.price, 'plan_title', pl.title);
END; $$;
REVOKE EXECUTE ON FUNCTION public.create_payment_intent(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_intent(uuid,text) TO authenticated;

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