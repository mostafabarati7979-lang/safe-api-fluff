REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO service_role;