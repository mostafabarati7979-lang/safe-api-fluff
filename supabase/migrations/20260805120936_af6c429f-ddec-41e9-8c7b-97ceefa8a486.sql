CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 1) delete category
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

-- 2) question reports
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

CREATE OR REPLACE FUNCTION public.list_question_reports()
RETURNS TABLE (
  id uuid, question_id uuid, question_text text, exam_title text,
  reporter_name text, reporter_email text, reason text, description text,
  status text, admin_note text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی غیرمجاز'; END IF;
  RETURN QUERY
  SELECT r.id, r.question_id, q.text, e.title, p.full_name, p.email,
         r.reason, r.description, r.status, r.admin_note, r.created_at
  FROM public.question_reports r
  LEFT JOIN public.questions q ON q.id = r.question_id
  LEFT JOIN public.exams e ON e.id = r.exam_id
  LEFT JOIN public.profiles p ON p.id = r.reporter_id
  ORDER BY r.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.list_question_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_question_reports() TO authenticated;

-- 3) cached AI explanations
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
CREATE POLICY "ai_explanations_select" ON public.ai_explanations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_explanations_admin_write" ON public.ai_explanations
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_ai_explanations_updated_at
  BEFORE UPDATE ON public.ai_explanations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) AI settings (API key management, admin only)
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