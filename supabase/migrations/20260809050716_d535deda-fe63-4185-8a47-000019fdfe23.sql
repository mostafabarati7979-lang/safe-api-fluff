-- 1. categories tree
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories(parent_id);

-- 2. organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  description text,
  status text NOT NULL DEFAULT 'active',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_select ON public.organizations;
CREATE POLICY organizations_select ON public.organizations FOR SELECT TO authenticated
  USING (status = 'active' OR public.is_admin());
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. subjects
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  status text NOT NULL DEFAULT 'active',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subjects_select ON public.subjects;
CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated
  USING (status = 'active' OR public.is_admin());
CREATE TRIGGER trg_subjects_updated_at BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. exams new fields
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS year integer;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS period text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS round text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT true;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS keywords text;

-- 5. exam_subjects
CREATE TABLE IF NOT EXISTS public.exam_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  question_count integer NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  coefficient numeric NOT NULL DEFAULT 1 CHECK (coefficient > 0),
  display_order integer NOT NULL DEFAULT 1,
  time_limit_minutes integer CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
  negative_marking boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, subject_id)
);
GRANT SELECT ON public.exam_subjects TO authenticated;
GRANT ALL ON public.exam_subjects TO service_role;
ALTER TABLE public.exam_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_subjects_select ON public.exam_subjects;
CREATE POLICY exam_subjects_select ON public.exam_subjects FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.status = 'published'));
CREATE TRIGGER trg_exam_subjects_updated_at BEFORE UPDATE ON public.exam_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. question <-> subject links
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS exam_subject_id uuid REFERENCES public.exam_subjects(id) ON DELETE SET NULL;

-- 7. indexes
CREATE INDEX IF NOT EXISTS idx_exams_organization ON public.exams(organization_id);
CREATE INDEX IF NOT EXISTS idx_exams_category ON public.exams(category_id);
CREATE INDEX IF NOT EXISTS idx_exams_year ON public.exams(year);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON public.exam_subjects(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_subject ON public.exam_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON public.exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_question ON public.exam_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_subject ON public.exam_questions(exam_subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject_id);

-- 8. RPCs
CREATE OR REPLACE FUNCTION public.save_organization(p_id uuid, p_name text, p_slug text, p_description text, p_status text, p_display_order integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_slug text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF COALESCE(trim(p_name),'') = '' THEN RAISE EXCEPTION 'نام سازمان الزامی است'; END IF;
  v_slug := COALESCE(NULLIF(trim(p_slug),''), 'org-' || substr(md5(random()::text),1,8));
  IF p_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, description, status, display_order)
    VALUES (p_name, v_slug, p_description, COALESCE(p_status,'active'), COALESCE(p_display_order,0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.organizations SET name = p_name, slug = v_slug, description = p_description,
      status = COALESCE(p_status,'active'), display_order = COALESCE(p_display_order,0)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'سازمان یافت نشد'; END IF;
  END IF;
  PERFORM public.log_audit(CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,'organization',v_id, jsonb_build_object('name',p_name));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_organization(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF EXISTS (SELECT 1 FROM public.exams WHERE organization_id = p_id) THEN
    RAISE EXCEPTION 'این سازمان در آزمون‌ها استفاده شده است';
  END IF;
  DELETE FROM public.organizations WHERE id = p_id;
  PERFORM public.log_audit('delete','organization',p_id,'{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.save_subject(p_id uuid, p_name text, p_slug text, p_description text, p_status text, p_display_order integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_slug text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF COALESCE(trim(p_name),'') = '' THEN RAISE EXCEPTION 'نام درس الزامی است'; END IF;
  v_slug := COALESCE(NULLIF(trim(p_slug),''), 'subject-' || substr(md5(random()::text),1,8));
  IF p_id IS NULL THEN
    INSERT INTO public.subjects (name, slug, description, status, display_order)
    VALUES (p_name, v_slug, p_description, COALESCE(p_status,'active'), COALESCE(p_display_order,0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.subjects SET name = p_name, slug = v_slug, description = p_description,
      status = COALESCE(p_status,'active'), display_order = COALESCE(p_display_order,0)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'درس یافت نشد'; END IF;
  END IF;
  PERFORM public.log_audit(CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,'subject',v_id, jsonb_build_object('name',p_name));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_subject(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF EXISTS (SELECT 1 FROM public.exam_subjects WHERE subject_id = p_id) THEN
    RAISE EXCEPTION 'این درس در آزمون‌ها استفاده شده است';
  END IF;
  IF EXISTS (SELECT 1 FROM public.questions WHERE subject_id = p_id) THEN
    RAISE EXCEPTION 'این درس در بانک سوالات استفاده شده است';
  END IF;
  DELETE FROM public.subjects WHERE id = p_id;
  PERFORM public.log_audit('delete','subject',p_id,'{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.set_exam_subjects(p_exam_id uuid, p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb; v_keep uuid[] := '{}';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN RAISE EXCEPTION 'آزمون یافت نشد'; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows,'[]'::jsonb)) LOOP
    v_keep := v_keep || (r->>'subject_id')::uuid;
    INSERT INTO public.exam_subjects (exam_id, subject_id, question_count, coefficient, display_order, time_limit_minutes, negative_marking)
    VALUES (p_exam_id, (r->>'subject_id')::uuid,
      COALESCE((r->>'question_count')::integer, 0),
      COALESCE((r->>'coefficient')::numeric, 1),
      COALESCE((r->>'display_order')::integer, 1),
      NULLIF(r->>'time_limit_minutes','')::integer,
      COALESCE((r->>'negative_marking')::boolean, false))
    ON CONFLICT (exam_id, subject_id) DO UPDATE SET
      question_count = EXCLUDED.question_count,
      coefficient = EXCLUDED.coefficient,
      display_order = EXCLUDED.display_order,
      time_limit_minutes = EXCLUDED.time_limit_minutes,
      negative_marking = EXCLUDED.negative_marking,
      updated_at = now();
  END LOOP;

  DELETE FROM public.exam_subjects WHERE exam_id = p_exam_id
    AND NOT (subject_id = ANY(v_keep));

  PERFORM public.log_audit('update','exam',p_exam_id, jsonb_build_object('subjects', coalesce(array_length(v_keep,1),0)));
END; $$;

CREATE OR REPLACE FUNCTION public.save_exam_v2(
  p_id uuid, p_title text, p_slug text, p_description text, p_duration_minutes integer,
  p_passing_score integer, p_status text, p_access_type text, p_max_attempts integer,
  p_show_correct_answers boolean, p_randomize_questions boolean, p_randomize_options boolean,
  p_category_id uuid, p_organization_id uuid, p_year integer, p_period text, p_round text,
  p_level text, p_is_free boolean, p_price numeric, p_meta_title text, p_meta_description text, p_keywords text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_slug text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی مجاز نیست'; END IF;
  IF COALESCE(trim(p_title),'') = '' THEN RAISE EXCEPTION 'عنوان آزمون الزامی است'; END IF;

  IF p_id IS NULL THEN
    v_slug := COALESCE(NULLIF(trim(p_slug),''), 'exam') || '-' || substr(md5(random()::text),1,6);
    INSERT INTO public.exams (title, slug, description, duration_minutes, passing_score, status,
      access_type, max_attempts, show_correct_answers, randomize_questions, randomize_options,
      category_id, created_by, organization_id, year, period, round, level, is_free, price,
      meta_title, meta_description, keywords)
    VALUES (p_title, v_slug, p_description, COALESCE(p_duration_minutes,30), COALESCE(p_passing_score,50),
      COALESCE(p_status,'draft'), COALESCE(p_access_type,'public'), COALESCE(p_max_attempts,1),
      COALESCE(p_show_correct_answers,true), COALESCE(p_randomize_questions,false),
      COALESCE(p_randomize_options,false), p_category_id, auth.uid(), p_organization_id, p_year,
      NULLIF(trim(coalesce(p_period,'')),''), NULLIF(trim(coalesce(p_round,'')),''),
      NULLIF(trim(coalesce(p_level,'')),''), COALESCE(p_is_free,true), COALESCE(p_price,0),
      NULLIF(trim(coalesce(p_meta_title,'')),''), NULLIF(trim(coalesce(p_meta_description,'')),''),
      NULLIF(trim(coalesce(p_keywords,'')),''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.exams SET title = p_title, description = p_description,
      slug = COALESCE(NULLIF(trim(p_slug),''), slug),
      duration_minutes = COALESCE(p_duration_minutes,30), passing_score = COALESCE(p_passing_score,50),
      status = COALESCE(p_status,'draft'), access_type = COALESCE(p_access_type,'public'),
      max_attempts = COALESCE(p_max_attempts,1), show_correct_answers = COALESCE(p_show_correct_answers,true),
      randomize_questions = COALESCE(p_randomize_questions,false), randomize_options = COALESCE(p_randomize_options,false),
      category_id = p_category_id, organization_id = p_organization_id, year = p_year,
      period = NULLIF(trim(coalesce(p_period,'')),''), round = NULLIF(trim(coalesce(p_round,'')),''),
      level = NULLIF(trim(coalesce(p_level,'')),''), is_free = COALESCE(p_is_free,true),
      price = COALESCE(p_price,0), meta_title = NULLIF(trim(coalesce(p_meta_title,'')),''),
      meta_description = NULLIF(trim(coalesce(p_meta_description,'')),''),
      keywords = NULLIF(trim(coalesce(p_keywords,'')),''), updated_at = now()
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'آزمون یافت نشد'; END IF;
  END IF;

  IF p_category_id IS NOT NULL THEN
    INSERT INTO public.exam_categories (exam_id, category_id) VALUES (v_id, p_category_id) ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.log_audit(CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,'exam',v_id, jsonb_build_object('title',p_title));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.list_exams_public(
  p_search text DEFAULT NULL, p_category_id uuid DEFAULT NULL, p_organization_id uuid DEFAULT NULL,
  p_year integer DEFAULT NULL, p_subject_id uuid DEFAULT NULL, p_level text DEFAULT NULL,
  p_is_free boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ابتدا وارد حساب کاربری شوید'; END IF;
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO v_result FROM (
    SELECT jsonb_build_object(
      'id', e.id, 'title', e.title, 'slug', e.slug, 'description', e.description,
      'duration_minutes', e.duration_minutes, 'year', e.year, 'period', e.period, 'round', e.round,
      'level', e.level, 'is_free', e.is_free, 'price', e.price, 'created_at', e.created_at,
      'category_id', e.category_id, 'category_name', c.name,
      'organization_id', e.organization_id, 'organization_name', o.name,
      'question_count', (SELECT count(*) FROM public.exam_questions eq WHERE eq.exam_id = e.id),
      'subjects', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name,
          'question_count', es.question_count, 'coefficient', es.coefficient) ORDER BY es.display_order), '[]'::jsonb)
        FROM public.exam_subjects es JOIN public.subjects s ON s.id = es.subject_id WHERE es.exam_id = e.id)
    ) AS x
    FROM public.exams e
    LEFT JOIN public.categories c ON c.id = e.category_id
    LEFT JOIN public.organizations o ON o.id = e.organization_id
    WHERE e.status = 'published'
      AND (p_category_id IS NULL OR e.category_id = p_category_id
           OR EXISTS (SELECT 1 FROM public.exam_categories ec WHERE ec.exam_id = e.id AND ec.category_id = p_category_id))
      AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
      AND (p_year IS NULL OR e.year = p_year)
      AND (p_level IS NULL OR p_level = '' OR e.level = p_level)
      AND (p_is_free IS NULL OR e.is_free = p_is_free)
      AND (p_subject_id IS NULL OR EXISTS (SELECT 1 FROM public.exam_subjects es WHERE es.exam_id = e.id AND es.subject_id = p_subject_id))
      AND (p_search IS NULL OR trim(p_search) = '' OR e.title ILIKE '%'||p_search||'%'
           OR COALESCE(e.description,'') ILIKE '%'||p_search||'%'
           OR COALESCE(e.keywords,'') ILIKE '%'||p_search||'%'
           OR COALESCE(o.name,'') ILIKE '%'||p_search||'%'
           OR EXISTS (SELECT 1 FROM public.exam_subjects es JOIN public.subjects s ON s.id = es.subject_id
                      WHERE es.exam_id = e.id AND s.name ILIKE '%'||p_search||'%'))
    LIMIT 200
  ) t;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_exam_public(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.exams; v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ابتدا وارد حساب کاربری شوید'; END IF;
  SELECT * INTO e FROM public.exams WHERE slug = p_slug;
  IF e.id IS NULL OR (e.status <> 'published' AND NOT public.is_admin()) THEN RAISE EXCEPTION 'آزمون یافت نشد'; END IF;
  SELECT jsonb_build_object(
    'id', e.id, 'title', e.title, 'slug', e.slug, 'description', e.description,
    'duration_minutes', e.duration_minutes, 'passing_score', e.passing_score,
    'year', e.year, 'period', e.period, 'round', e.round, 'level', e.level,
    'is_free', e.is_free, 'price', e.price, 'meta_title', e.meta_title,
    'meta_description', e.meta_description, 'keywords', e.keywords,
    'organization_name', (SELECT name FROM public.organizations WHERE id = e.organization_id),
    'category_name', (SELECT name FROM public.categories WHERE id = e.category_id),
    'subjects', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name,
        'question_count', es.question_count, 'coefficient', es.coefficient,
        'time_limit_minutes', es.time_limit_minutes, 'negative_marking', es.negative_marking)
        ORDER BY es.display_order), '[]'::jsonb)
      FROM public.exam_subjects es JOIN public.subjects s ON s.id = es.subject_id WHERE es.exam_id = e.id)
  ) INTO v;
  RETURN v;
END; $$;

REVOKE ALL ON FUNCTION public.save_organization(uuid,text,text,text,text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_organization(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_subject(uuid,text,text,text,text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_subject(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_exam_subjects(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_exam_v2(uuid,text,text,text,integer,integer,text,text,integer,boolean,boolean,boolean,uuid,uuid,integer,text,text,text,boolean,numeric,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_exams_public(text,uuid,uuid,integer,uuid,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exam_public(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_organization(uuid,text,text,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_subject(uuid,text,text,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_subject(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_exam_subjects(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_v2(uuid,text,text,text,integer,integer,text,text,integer,boolean,boolean,boolean,uuid,uuid,integer,text,text,text,boolean,numeric,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_exams_public(text,uuid,uuid,integer,uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_public(text) TO authenticated;

-- 9. Seed data
INSERT INTO public.categories (id, name, slug, description, status, parent_id, display_order) VALUES
  ('11111111-0000-4000-8000-000000000001','آزمون‌های استخدامی','estekhdami','آزمون‌های استخدامی سازمان‌ها و شرکت‌ها','active',NULL,1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.categories (id, name, slug, description, status, parent_id, display_order) VALUES
  ('11111111-0000-4000-8000-000000000002','بانک‌ها','banks','آزمون‌های استخدامی بانک‌ها','active','11111111-0000-4000-8000-000000000001',1),
  ('11111111-0000-4000-8000-000000000004','آموزش و پرورش','amoozesh-parvaresh','آزمون‌های استخدامی آموزش و پرورش','active','11111111-0000-4000-8000-000000000001',2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.categories (id, name, slug, description, status, parent_id, display_order) VALUES
  ('11111111-0000-4000-8000-000000000003','بانک ملت','bank-mellat','آزمون‌های استخدامی بانک ملت','active','11111111-0000-4000-8000-000000000002',1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, description, display_order) VALUES
  ('22222222-0000-4000-8000-000000000001','بانک ملت','bank-mellat','بانک ملت',1),
  ('22222222-0000-4000-8000-000000000002','بانک ملی','bank-melli','بانک ملی ایران',2),
  ('22222222-0000-4000-8000-000000000003','بانک صادرات','bank-saderat','بانک صادرات ایران',3),
  ('22222222-0000-4000-8000-000000000004','بانک تجارت','bank-tejarat','بانک تجارت',4),
  ('22222222-0000-4000-8000-000000000005','آموزش و پرورش','amoozesh-parvaresh','وزارت آموزش و پرورش',5),
  ('22222222-0000-4000-8000-000000000006','دستگاه‌های اجرایی','dastgah-ejraei','دستگاه‌های اجرایی کشور',6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.subjects (id, name, slug, display_order) VALUES
  ('33333333-0000-4000-8000-000000000001','زبان تخصصی','zaban-takhassosi',1),
  ('33333333-0000-4000-8000-000000000002','ادبیات فارسی','adabiyat-farsi',2),
  ('33333333-0000-4000-8000-000000000003','معارف اسلامی','maaref-eslami',3),
  ('33333333-0000-4000-8000-000000000004','هوش و استعداد','hoosh-estedad',4),
  ('33333333-0000-4000-8000-000000000005','فناوری اطلاعات','fanavari-etelaat',5),
  ('33333333-0000-4000-8000-000000000006','ریاضی','riyazi',6),
  ('33333333-0000-4000-8000-000000000007','زبان انگلیسی','zaban-engilisi',7),
  ('33333333-0000-4000-8000-000000000008','اقتصاد','eghtesad',8),
  ('33333333-0000-4000-8000-000000000009','حسابداری','hesabdari',9)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.exams (id, title, slug, description, duration_minutes, passing_score, status,
  access_type, max_attempts, show_correct_answers, category_id, organization_id, year, period, round,
  level, is_free, price, meta_title, meta_description, keywords)
VALUES ('44444444-0000-4000-8000-000000000001','آزمون استخدامی بانک ملت ۱۴۰۴','azmoon-estekhdami-bank-mellat-1404',
  'آزمون آزمایشی استخدامی بانک ملت سال ۱۴۰۴ شامل پنج درس',90,50,'published','public',3,true,
  '11111111-0000-4000-8000-000000000003','22222222-0000-4000-8000-000000000001',1404,'استخدامی','اول',
  'متوسط',true,0,'آزمون استخدامی بانک ملت ۱۴۰۴',
  'نمونه سوالات و آزمون آزمایشی استخدامی بانک ملت ۱۴۰۴ با پنج درس و ۸۰ سوال',
  'آزمون استخدامی بانک ملت, سوالات استخدامی بانک ملت, آزمون بانک ملت ۱۴۰۴')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.exam_categories (exam_id, category_id)
VALUES ('44444444-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO public.exam_subjects (id, exam_id, subject_id, question_count, coefficient, display_order) VALUES
  ('55555555-0000-4000-8000-000000000001','44444444-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001',20,2,1),
  ('55555555-0000-4000-8000-000000000002','44444444-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000002',15,1,2),
  ('55555555-0000-4000-8000-000000000003','44444444-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000003',15,1,3),
  ('55555555-0000-4000-8000-000000000004','44444444-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000004',20,2,4),
  ('55555555-0000-4000-8000-000000000005','44444444-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000005',10,1,5)
ON CONFLICT (exam_id, subject_id) DO NOTHING;

INSERT INTO public.questions (id, category_id, subject_id, question_text, difficulty, default_score, status) VALUES
  ('66666666-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000003','33333333-0000-4000-8000-000000000001','معادل انگلیسی واژه «سپرده» در بانکداری کدام است؟','medium',1,'active'),
  ('66666666-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000003','33333333-0000-4000-8000-000000000002','«سعدی» کدام اثر را به نثر نوشته است؟','easy',1,'active'),
  ('66666666-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000003','33333333-0000-4000-8000-000000000004','عدد بعدی در دنباله ۲، ۶، ۱۲، ۲۰، ... کدام است؟','medium',1,'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.question_options (question_id, option_text, is_correct, display_order) VALUES
  ('66666666-0000-4000-8000-000000000001','Deposit',true,1),
  ('66666666-0000-4000-8000-000000000001','Withdrawal',false,2),
  ('66666666-0000-4000-8000-000000000001','Loan',false,3),
  ('66666666-0000-4000-8000-000000000001','Interest',false,4),
  ('66666666-0000-4000-8000-000000000002','گلستان',true,1),
  ('66666666-0000-4000-8000-000000000002','بوستان',false,2),
  ('66666666-0000-4000-8000-000000000002','شاهنامه',false,3),
  ('66666666-0000-4000-8000-000000000002','مثنوی',false,4),
  ('66666666-0000-4000-8000-000000000003','۳۰',true,1),
  ('66666666-0000-4000-8000-000000000003','۲۸',false,2),
  ('66666666-0000-4000-8000-000000000003','۲۶',false,3),
  ('66666666-0000-4000-8000-000000000003','۳۲',false,4)
ON CONFLICT DO NOTHING;

INSERT INTO public.exam_questions (exam_id, question_id, exam_subject_id, score, display_order) VALUES
  ('44444444-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000001','55555555-0000-4000-8000-000000000001',1,1),
  ('44444444-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000002','55555555-0000-4000-8000-000000000002',1,2),
  ('44444444-0000-4000-8000-000000000001','66666666-0000-4000-8000-000000000003','55555555-0000-4000-8000-000000000004',1,3)
ON CONFLICT DO NOTHING;
