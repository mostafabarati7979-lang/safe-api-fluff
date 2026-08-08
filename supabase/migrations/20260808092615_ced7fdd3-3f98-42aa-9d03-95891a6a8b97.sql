CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.delete_category(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  IF EXISTS (SELECT 1 FROM public.questions WHERE category_id = p_id) THEN
    RAISE EXCEPTION 'این دسته‌بندی در بانک سوالات استفاده شده است';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exams WHERE category_id = p_id) THEN
    RAISE EXCEPTION 'این دسته‌بندی در آزمون‌ها استفاده شده است';
  END IF;
  DELETE FROM public.categories WHERE id = p_id;
  PERFORM public.log_audit('delete', 'category', p_id, '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.delete_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_category(uuid) TO authenticated;

CREATE TABLE public.question_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  attempt_id uuid,
  reporter_id uuid NOT NULL DEFAULT auth.uid(),
  reason text NOT NULL CHECK (reason IN ('wrong_answer','typo','unclear','duplicate','other')),
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','rejected')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_reports_question ON public.question_reports(question_id);
CREATE INDEX idx_question_reports_status ON public.question_reports(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_reports TO authenticated;
GRANT ALL ON public.question_reports TO service_role;
ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_insert_own" ON public.question_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports_select_own_or_admin" ON public.question_reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.is_admin());
CREATE POLICY "reports_update_admin" ON public.question_reports
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "reports_delete_admin" ON public.question_reports
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER trg_question_reports_updated_at
  BEFORE UPDATE ON public.question_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.report_question(
  p_question_id uuid, p_reason text, p_description text DEFAULT NULL,
  p_exam_id uuid DEFAULT NULL, p_attempt_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ابتدا وارد حساب کاربری شوید'; END IF;
  IF p_reason NOT IN ('wrong_answer','typo','unclear','duplicate','other') THEN
    RAISE EXCEPTION 'نوع خطای نامعتبر';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.question_reports
    WHERE question_id = p_question_id AND reporter_id = auth.uid() AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'شما قبلاً برای این سوال گزارش ثبت کرده‌اید';
  END IF;
  INSERT INTO public.question_reports (question_id, exam_id, attempt_id, reporter_id, reason, description)
  VALUES (p_question_id, p_exam_id, p_attempt_id, auth.uid(), p_reason, left(coalesce(p_description, ''), 1000))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.report_question(uuid, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_question(uuid, text, text, uuid, uuid) TO authenticated;

CREATE TABLE public.ai_explanations (
  question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  explanation text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_explanations TO authenticated;
GRANT ALL ON public.ai_explanations TO service_role;
ALTER TABLE public.ai_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_explanations_admin_write" ON public.ai_explanations
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_ai_explanations_updated_at
  BEFORE UPDATE ON public.ai_explanations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY ai_explanations_select ON public.ai_explanations
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.exam_attempts a
    JOIN public.exam_questions eq ON eq.exam_id = a.exam_id
    WHERE a.candidate_id = auth.uid()
      AND a.status <> 'in_progress'
      AND eq.question_id = ai_explanations.question_id
  )
);

CREATE TABLE public.ai_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider text NOT NULL DEFAULT 'lovable',
  model text NOT NULL DEFAULT 'google/gemini-3.5-flash',
  api_key text,
  cache_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ai_settings (id) VALUES (true);
GRANT SELECT, INSERT, UPDATE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_settings_admin_all" ON public.ai_settings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_ai_settings_updated_at
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS app_settings_select ON public.app_settings;

DROP POLICY IF EXISTS exam_categories_select ON public.exam_categories;
CREATE POLICY exam_categories_select ON public.exam_categories
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_categories.exam_id AND e.status = 'published'
  )
);

CREATE OR REPLACE FUNCTION public.list_question_reports()
 RETURNS TABLE(id uuid, question_id uuid, question_text text, exam_title text, reporter_name text, reporter_email text, reason text, description text, status text, admin_note text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  RETURN QUERY
  SELECT r.id, r.question_id, q.question_text, e.title, p.full_name, p.email,
         r.reason, r.description, r.status, r.admin_note, r.created_at
  FROM public.question_reports r
  LEFT JOIN public.questions q ON q.id = r.question_id
  LEFT JOIN public.exams e ON e.id = r.exam_id
  LEFT JOIN public.profiles p ON p.id = r.reporter_id
  ORDER BY r.created_at DESC;
END $function$;

REVOKE ALL ON FUNCTION public.list_question_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_question_reports() TO authenticated;

ALTER TABLE public.exam_attempts ADD COLUMN IF NOT EXISTS category_ids uuid[];

CREATE OR REPLACE FUNCTION public.get_exam_topics(p_exam_id uuid)
RETURNS TABLE(category_id uuid, category_name text, question_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(q.category_id, '00000000-0000-0000-0000-000000000000'::uuid) AS category_id,
         COALESCE(c.name, 'بدون دسته‌بندی') AS category_name,
         count(*)::integer AS question_count
  FROM public.exam_questions eq
  JOIN public.questions q ON q.id = eq.question_id
  LEFT JOIN public.categories c ON c.id = q.category_id
  WHERE eq.exam_id = p_exam_id
    AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = p_exam_id AND e.status = 'published'))
  GROUP BY 1, 2
  ORDER BY 2;
$$;
REVOKE ALL ON FUNCTION public.get_exam_topics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_topics(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_exam_categories(p_exam_id uuid, p_category_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  DELETE FROM public.exam_categories WHERE exam_id = p_exam_id
    AND (p_category_ids IS NULL OR NOT (category_id = ANY(p_category_ids)));
  IF p_category_ids IS NOT NULL THEN
    INSERT INTO public.exam_categories (exam_id, category_id)
    SELECT p_exam_id, c FROM unnest(p_category_ids) AS c
    ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.log_audit('update','exam',p_exam_id, jsonb_build_object('categories', coalesce(array_length(p_category_ids,1),0)));
END; $$;
REVOKE ALL ON FUNCTION public.set_exam_categories(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_exam_categories(uuid, uuid[]) TO authenticated;

DROP FUNCTION IF EXISTS public.start_attempt(uuid);
CREATE OR REPLACE FUNCTION public.start_attempt(p_exam_id uuid, p_category_ids uuid[] DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_exam public.exams; v_attempt uuid; v_count integer; v_total numeric; v_qcount integer;
  v_cats uuid[] := CASE WHEN p_category_ids IS NULL OR array_length(p_category_ids,1) IS NULL THEN NULL ELSE p_category_ids END;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ابتدا وارد حساب کاربری شوید'; END IF;
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
END; $$;
REVOKE ALL ON FUNCTION public.start_attempt(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_attempt(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_attempt_state(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); a public.exam_attempts; e public.exams; v_questions jsonb;
BEGIN
  SELECT * INTO a FROM public.exam_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'آزمون یافت نشد'; END IF;
  IF a.candidate_id <> v_uid AND NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  SELECT * INTO e FROM public.exams WHERE id = a.exam_id;

  SELECT COALESCE(jsonb_agg(q ORDER BY q->>'ord'), '[]'::jsonb) INTO v_questions FROM (
    SELECT jsonb_build_object(
      'id', qs.id,
      'question_text', qs.question_text,
      'score', eq.score,
      'ord', lpad(eq.display_order::text, 6, '0'),
      'selected_option_id', (SELECT aa.selected_option_id FROM public.attempt_answers aa
                              WHERE aa.attempt_id = a.id AND aa.question_id = qs.id),
      'options', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'option_text', o.option_text)
                    ORDER BY o.display_order), '[]'::jsonb)
                  FROM public.question_options o WHERE o.question_id = qs.id)
    ) AS q
    FROM public.exam_questions eq
    JOIN public.questions qs ON qs.id = eq.question_id
    WHERE eq.exam_id = a.exam_id
      AND (a.category_ids IS NULL OR COALESCE(qs.category_id,'00000000-0000-0000-0000-000000000000'::uuid) = ANY(a.category_ids))
  ) t;

  RETURN jsonb_build_object(
    'attempt', jsonb_build_object('id', a.id, 'status', a.status, 'started_at', a.started_at,
      'expires_at', a.expires_at, 'server_now', now()),
    'exam', jsonb_build_object('id', e.id, 'title', e.title, 'duration_minutes', e.duration_minutes,
      'passing_score', e.passing_score),
    'questions', v_questions
  );
END; $$;

CREATE OR REPLACE FUNCTION public.get_attempt_review(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE a public.exam_attempts; e public.exams; v_can boolean; v_items jsonb;
BEGIN
  SELECT * INTO a FROM public.exam_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'نتیجه‌ای یافت نشد'; END IF;
  IF a.candidate_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  SELECT * INTO e FROM public.exams WHERE id = a.exam_id;
  v_can := public.is_admin() OR (a.status <> 'in_progress' AND e.show_correct_answers);

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'ord'), '[]'::jsonb) INTO v_items FROM (
    SELECT jsonb_build_object(
      'question_id', qs.id,
      'question_text', qs.question_text,
      'score', eq.score,
      'ord', lpad(eq.display_order::text, 6, '0'),
      'selected_option_id', (SELECT aa.selected_option_id FROM public.attempt_answers aa
                              WHERE aa.attempt_id = a.id AND aa.question_id = qs.id),
      'correct_option_id', CASE WHEN v_can THEN
        (SELECT o.id FROM public.question_options o WHERE o.question_id = qs.id AND o.is_correct LIMIT 1)
        ELSE NULL END,
      'options', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'option_text', o.option_text)
                    ORDER BY o.display_order), '[]'::jsonb)
                  FROM public.question_options o WHERE o.question_id = qs.id)
    ) AS item
    FROM public.exam_questions eq
    JOIN public.questions qs ON qs.id = eq.question_id
    WHERE eq.exam_id = a.exam_id
      AND (a.category_ids IS NULL OR COALESCE(qs.category_id,'00000000-0000-0000-0000-000000000000'::uuid) = ANY(a.category_ids))
  ) t;

  RETURN jsonb_build_object(
    'attempt', jsonb_build_object('id', a.id, 'status', a.status, 'earned_score', a.earned_score,
      'total_score', a.total_score, 'correct_count', a.correct_count, 'incorrect_count', a.incorrect_count,
      'unanswered_count', a.unanswered_count, 'passed', a.passed, 'started_at', a.started_at,
      'submitted_at', a.submitted_at),
    'exam', jsonb_build_object('id', e.id, 'title', e.title, 'passing_score', e.passing_score,
      'show_correct_answers', e.show_correct_answers),
    'can_review', v_can,
    'items', v_items
  );
END; $$;

CREATE OR REPLACE FUNCTION public.submit_attempt(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE a public.exam_attempts; e public.exams;
  v_total numeric; v_earned numeric := 0; v_correct integer := 0; v_incorrect integer := 0;
  v_answered integer := 0; v_qcount integer; v_passed boolean; v_status text;
BEGIN
  SELECT * INTO a FROM public.exam_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL OR (a.candidate_id <> auth.uid() AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'دسترسی مجاز نیست';
  END IF;
  IF a.status <> 'in_progress' THEN
    RETURN jsonb_build_object('id', a.id, 'status', a.status, 'earned_score', a.earned_score,
      'total_score', a.total_score, 'passed', a.passed);
  END IF;
  SELECT * INTO e FROM public.exams WHERE id = a.exam_id;

  UPDATE public.attempt_answers aa
  SET is_correct = o.is_correct,
      score_awarded = CASE WHEN o.is_correct THEN eq.score ELSE 0 END
  FROM public.question_options o, public.exam_questions eq
  WHERE aa.attempt_id = a.id AND o.id = aa.selected_option_id
    AND eq.exam_id = a.exam_id AND eq.question_id = aa.question_id;

  SELECT COALESCE(sum(eq.score),0), count(*) INTO v_total, v_qcount
  FROM public.exam_questions eq JOIN public.questions q ON q.id = eq.question_id
  WHERE eq.exam_id = a.exam_id
    AND (a.category_ids IS NULL OR COALESCE(q.category_id,'00000000-0000-0000-0000-000000000000'::uuid) = ANY(a.category_ids));

  SELECT COALESCE(sum(score_awarded),0), count(*) FILTER (WHERE is_correct),
         count(*) FILTER (WHERE is_correct IS FALSE), count(*)
  INTO v_earned, v_correct, v_incorrect, v_answered
  FROM public.attempt_answers WHERE attempt_id = a.id AND selected_option_id IS NOT NULL;

  v_passed := v_total > 0 AND (v_earned / v_total) * 100 >= e.passing_score;
  v_status := CASE WHEN a.expires_at < now() THEN 'expired' ELSE 'submitted' END;

  UPDATE public.exam_attempts SET status = v_status, submitted_at = now(), earned_score = v_earned,
    total_score = v_total, correct_count = v_correct, incorrect_count = v_incorrect,
    unanswered_count = GREATEST(v_qcount - v_answered, 0), passed = v_passed
  WHERE id = a.id;

  RETURN jsonb_build_object('id', a.id, 'status', v_status, 'earned_score', v_earned,
    'total_score', v_total, 'passed', v_passed);
END; $$;

CREATE OR REPLACE FUNCTION public.guard_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_admin_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_guard_admin_fields ON public.profiles;
CREATE TRIGGER trg_profiles_guard_admin_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_admin_fields();

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

DELETE FROM public.user_roles ur
WHERE EXISTS (
  SELECT 1 FROM public.user_roles keep
  WHERE keep.user_id = ur.user_id
    AND keep.id <> ur.id
    AND (keep.role = 'admin' AND ur.role <> 'admin')
);

DELETE FROM public.user_roles ur
WHERE ur.id <> (
  SELECT k.id FROM public.user_roles k
  WHERE k.user_id = ur.user_id
  ORDER BY k.created_at DESC, k.id DESC
  LIMIT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_role_per_user
  ON public.user_roles (user_id);

INSERT INTO public.profiles (id, full_name, email, mobile)
SELECT u.id,
       COALESCE(u.raw_user_meta_data ->> 'full_name', ''),
       u.email,
       u.raw_user_meta_data ->> 'mobile'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'candidate'::public.app_role
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
ON CONFLICT DO NOTHING;

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

NOTIFY pgrst, 'reload schema';