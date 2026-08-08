-- ============================================================
-- Fix: RLS policies call public.is_admin(), so the calling role
-- must hold EXECUTE on it. A previous migration revoked it from
-- `authenticated`, which made every profiles/user_roles query
-- fail with 42501 "permission denied for function is_admin".
-- ============================================================

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- has_role() stays internal: is_admin() is SECURITY DEFINER and can call it.

-- ------------------------------------------------------------
-- One role per user: collapse duplicates (admin wins), then add
-- a unique index on user_id. The (user_id, role) unique key is
-- kept because handle_new_user() uses ON CONFLICT (user_id, role).
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Backfill users that exist in auth.users but have no profile
-- (e.g. registered before the handle_new_user trigger existed).
-- ------------------------------------------------------------
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

NOTIFY pgrst, 'reload schema';
