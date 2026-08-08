-- 1) attempts remember selected topics
ALTER TABLE public.exam_attempts ADD COLUMN IF NOT EXISTS category_ids uuid[];

-- 2) exam topics list for candidates
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

-- 3) admin: set multiple categories for an exam
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

-- 4) start_attempt with optional topic filter
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

-- 5) attempt state filtered by topics
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

-- 6) review filtered by topics
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

-- 7) scoring limited to selected topics
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
