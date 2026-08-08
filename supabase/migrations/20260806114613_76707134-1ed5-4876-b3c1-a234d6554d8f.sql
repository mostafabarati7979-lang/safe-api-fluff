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