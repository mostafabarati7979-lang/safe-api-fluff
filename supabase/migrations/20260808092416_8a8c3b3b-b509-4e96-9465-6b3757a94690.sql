CREATE OR REPLACE FUNCTION public.log_audit(_action text, _entity text, _entity_id uuid, _details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  SELECT COALESCE(NULLIF(full_name,''), email) INTO v_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs (actor_id, actor_name, action, entity, entity_id, details)
  VALUES (auth.uid(), v_name, _action, _entity, _entity_id, COALESCE(_details, '{}'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
  PERFORM public.log_audit('set_role','user',_user_id, jsonb_build_object('role',_role));
END; $$;

CREATE OR REPLACE FUNCTION public.save_question(
  p_id uuid, p_category_id uuid, p_text text, p_difficulty text,
  p_score integer, p_status text, p_options jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_opt jsonb; v_i integer := 0; v_correct integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF COALESCE(trim(p_text),'') = '' THEN RAISE EXCEPTION 'متن سوال الزامی است'; END IF;
  IF jsonb_array_length(COALESCE(p_options,'[]'::jsonb)) < 2 THEN RAISE EXCEPTION 'حداقل دو گزینه لازم است'; END IF;
  SELECT count(*) INTO v_correct FROM jsonb_array_elements(p_options) o WHERE (o->>'is_correct')::boolean;
  IF v_correct <> 1 THEN RAISE EXCEPTION 'دقیقا یک گزینه صحیح انتخاب کنید'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.questions (category_id, question_text, difficulty, default_score, status, created_by)
    VALUES (p_category_id, p_text, COALESCE(p_difficulty,'medium'), COALESCE(p_score,1), COALESCE(p_status,'active'), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.questions SET category_id = p_category_id, question_text = p_text,
      difficulty = COALESCE(p_difficulty,'medium'), default_score = COALESCE(p_score,1),
      status = COALESCE(p_status,'active'), updated_at = now()
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'سوال یافت نشد'; END IF;
    DELETE FROM public.question_options WHERE question_id = v_id;
  END IF;

  FOR v_opt IN SELECT * FROM jsonb_array_elements(p_options) LOOP
    v_i := v_i + 1;
    INSERT INTO public.question_options (question_id, option_text, is_correct, display_order)
    VALUES (v_id, v_opt->>'option_text', COALESCE((v_opt->>'is_correct')::boolean,false), v_i);
  END LOOP;

  PERFORM public.log_audit(CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,'question',v_id,'{}'::jsonb);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.save_exam(
  p_id uuid, p_title text, p_slug text, p_description text, p_duration_minutes integer,
  p_passing_score integer, p_status text, p_access_type text, p_max_attempts integer,
  p_show_correct_answers boolean, p_randomize_questions boolean, p_randomize_options boolean,
  p_category_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_slug text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF COALESCE(trim(p_title),'') = '' THEN RAISE EXCEPTION 'عنوان آزمون الزامی است'; END IF;
  v_slug := COALESCE(NULLIF(trim(p_slug),''), 'exam') || '-' || substr(md5(random()::text),1,6);

  IF p_id IS NULL THEN
    INSERT INTO public.exams (title, slug, description, duration_minutes, passing_score, status,
      access_type, max_attempts, show_correct_answers, randomize_questions, randomize_options, category_id, created_by)
    VALUES (p_title, v_slug, p_description, COALESCE(p_duration_minutes,30), COALESCE(p_passing_score,50),
      COALESCE(p_status,'draft'), COALESCE(p_access_type,'public'), COALESCE(p_max_attempts,1),
      COALESCE(p_show_correct_answers,true), COALESCE(p_randomize_questions,false),
      COALESCE(p_randomize_options,false), p_category_id, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.exams SET title = p_title, description = p_description,
      duration_minutes = COALESCE(p_duration_minutes,30), passing_score = COALESCE(p_passing_score,50),
      status = COALESCE(p_status,'draft'), access_type = COALESCE(p_access_type,'public'),
      max_attempts = COALESCE(p_max_attempts,1), show_correct_answers = COALESCE(p_show_correct_answers,true),
      randomize_questions = COALESCE(p_randomize_questions,false), randomize_options = COALESCE(p_randomize_options,false),
      category_id = p_category_id, updated_at = now()
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'آزمون یافت نشد'; END IF;
  END IF;

  IF p_category_id IS NOT NULL THEN
    INSERT INTO public.exam_categories (exam_id, category_id) VALUES (v_id, p_category_id)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.log_audit(CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,'exam',v_id, jsonb_build_object('title',p_title));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_exam(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  DELETE FROM public.exams WHERE id = p_id;
  PERFORM public.log_audit('delete','exam',p_id,'{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.add_exam_question(p_exam_id uuid, p_question_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_score integer; v_order integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  SELECT default_score INTO v_score FROM public.questions WHERE id = p_question_id;
  IF v_score IS NULL THEN RAISE EXCEPTION 'سوال یافت نشد'; END IF;
  SELECT COALESCE(max(display_order),0) + 1 INTO v_order FROM public.exam_questions WHERE exam_id = p_exam_id;
  INSERT INTO public.exam_questions (exam_id, question_id, score, display_order)
  VALUES (p_exam_id, p_question_id, v_score, v_order)
  ON CONFLICT (exam_id, question_id) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_exam_question(p_exam_id uuid, p_question_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  DELETE FROM public.exam_questions WHERE exam_id = p_exam_id AND question_id = p_question_id;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_candidates(p_exam_id uuid, p_candidate_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  INSERT INTO public.exam_assignments (exam_id, candidate_id)
  SELECT p_exam_id, c FROM unnest(p_candidate_ids) AS c
  ON CONFLICT (exam_id, candidate_id) DO NOTHING;
  PERFORM public.log_audit('assign','exam',p_exam_id, jsonb_build_object('count', array_length(p_candidate_ids,1)));
END; $$;

CREATE OR REPLACE FUNCTION public.unassign_candidate(p_exam_id uuid, p_candidate_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  DELETE FROM public.exam_assignments WHERE exam_id = p_exam_id AND candidate_id = p_candidate_id;
END; $$;

CREATE OR REPLACE FUNCTION public.start_attempt(p_exam_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_exam public.exams; v_attempt uuid; v_count integer; v_total numeric;
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

  SELECT COALESCE(sum(score),0) INTO v_total FROM public.exam_questions WHERE exam_id = p_exam_id;
  IF v_total = 0 THEN RAISE EXCEPTION 'برای این آزمون سوالی ثبت نشده است'; END IF;

  INSERT INTO public.exam_attempts (exam_id, candidate_id, expires_at, total_score, unanswered_count)
  VALUES (p_exam_id, v_uid, now() + make_interval(mins => v_exam.duration_minutes), v_total,
    (SELECT count(*) FROM public.exam_questions WHERE exam_id = p_exam_id))
  RETURNING id INTO v_attempt;
  RETURN v_attempt;
END; $$;

CREATE OR REPLACE FUNCTION public.get_attempt_state(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  ) t;

  RETURN jsonb_build_object(
    'attempt', jsonb_build_object('id', a.id, 'status', a.status, 'started_at', a.started_at,
      'expires_at', a.expires_at, 'server_now', now()),
    'exam', jsonb_build_object('id', e.id, 'title', e.title, 'duration_minutes', e.duration_minutes,
      'passing_score', e.passing_score),
    'questions', v_questions
  );
END; $$;

CREATE OR REPLACE FUNCTION public.save_answer(p_attempt_id uuid, p_question_id uuid, p_option_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.exam_attempts;
BEGIN
  SELECT * INTO a FROM public.exam_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL OR a.candidate_id <> auth.uid() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'این آزمون به پایان رسیده است'; END IF;
  IF a.expires_at < now() THEN RAISE EXCEPTION 'زمان آزمون به پایان رسیده است'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exam_questions WHERE exam_id = a.exam_id AND question_id = p_question_id) THEN
    RAISE EXCEPTION 'سوال متعلق به این آزمون نیست';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.question_options WHERE id = p_option_id AND question_id = p_question_id) THEN
    RAISE EXCEPTION 'گزینه نامعتبر است';
  END IF;

  INSERT INTO public.attempt_answers (attempt_id, question_id, selected_option_id)
  VALUES (p_attempt_id, p_question_id, p_option_id)
  ON CONFLICT (attempt_id, question_id)
  DO UPDATE SET selected_option_id = EXCLUDED.selected_option_id, answered_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.submit_attempt(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  SELECT COALESCE(sum(score),0), count(*) INTO v_total, v_qcount
  FROM public.exam_questions WHERE exam_id = a.exam_id;

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

CREATE OR REPLACE FUNCTION public.get_attempt_review(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.import_questions(
  p_rows jsonb, p_exam_id uuid, p_exam_title text, p_category_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exam_id uuid := p_exam_id; v_row jsonb; v_opt jsonb; v_qid uuid; v_cat uuid;
  v_i integer; v_count integer := 0; v_order integer; v_cid uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF jsonb_array_length(COALESCE(p_rows,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'ردیفی برای بارگذاری وجود ندارد'; END IF;

  IF v_exam_id IS NULL THEN
    IF COALESCE(trim(p_exam_title),'') = '' THEN RAISE EXCEPTION 'نام آزمون جدید را وارد کنید'; END IF;
    INSERT INTO public.exams (title, slug, status, created_by, category_id)
    VALUES (p_exam_title, 'exam-' || substr(md5(random()::text),1,10), 'draft', auth.uid(),
      CASE WHEN p_category_ids IS NULL THEN NULL ELSE p_category_ids[1] END)
    RETURNING id INTO v_exam_id;
  END IF;

  IF p_category_ids IS NOT NULL THEN
    FOREACH v_cid IN ARRAY p_category_ids LOOP
      INSERT INTO public.exam_categories (exam_id, category_id) VALUES (v_exam_id, v_cid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  SELECT COALESCE(max(display_order),0) INTO v_order FROM public.exam_questions WHERE exam_id = v_exam_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_cat := CASE WHEN p_category_ids IS NULL THEN NULL ELSE p_category_ids[1] END;

    INSERT INTO public.questions (category_id, question_text, difficulty, default_score, created_by)
    VALUES (v_cat, v_row->>'question_text', COALESCE(NULLIF(v_row->>'difficulty',''),'medium'),
      COALESCE((v_row->>'score')::integer,1), auth.uid())
    RETURNING id INTO v_qid;

    v_i := 0;
    FOR v_opt IN SELECT * FROM jsonb_array_elements(v_row->'options') LOOP
      v_i := v_i + 1;
      INSERT INTO public.question_options (question_id, option_text, is_correct, display_order)
      VALUES (v_qid, v_opt->>'option_text', COALESCE((v_opt->>'is_correct')::boolean,false), v_i);
    END LOOP;

    v_order := v_order + 1;
    INSERT INTO public.exam_questions (exam_id, question_id, score, display_order)
    VALUES (v_exam_id, v_qid, COALESCE((v_row->>'score')::integer,1), v_order)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.log_audit('import','exam',v_exam_id, jsonb_build_object('questions',v_count));
  RETURN jsonb_build_object('exam_id', v_exam_id, 'inserted', v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ابتدا وارد حساب کاربری شوید'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'مدیر سامانه از قبل تعریف شده است';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin');
  PERFORM public.log_audit('claim_admin','user',auth.uid(),'{}'::jsonb);
END; $$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, public;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;