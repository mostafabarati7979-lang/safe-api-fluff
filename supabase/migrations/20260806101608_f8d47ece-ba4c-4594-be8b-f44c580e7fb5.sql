-- 1) ai_explanations: restrict reads
DROP POLICY IF EXISTS ai_explanations_select ON public.ai_explanations;
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

-- 2) app_settings: admin-only reads
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;

-- 3) exam_categories: only published exams (or admin)
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

-- 4) SECURITY DEFINER functions: no execute for anonymous/public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;