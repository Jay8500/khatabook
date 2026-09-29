-- Security advisor fixes.

-- setting() must respect app_settings RLS for callers: run as invoker. Internal
-- SECURITY DEFINER functions that call it still see every row (they run as owner).
alter function public.setting(text) security invoker;

-- Internal lookups: only used inside SECURITY DEFINER functions, never by clients.
revoke execute on function public.is_admin_phone(text) from public, anon, authenticated;
revoke execute on function public.role_id_by_setting(text) from public, anon, authenticated;

-- RLS helpers: signed-in users need them for policy checks; anonymous visitors do not,
-- except has_permission, which public-read policies (pricing, public settings) evaluate.
revoke execute on function public.my_shop_ids() from public, anon;
revoke execute on function public.can_access_shop(uuid) from public, anon;
grant execute on function public.my_shop_ids() to authenticated;
grant execute on function public.can_access_shop(uuid) to authenticated;

-- Pin search_path on every remaining function.
alter function public.normalize_phone(text) set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.allow_trusted_write() set search_path = public;
alter function public.is_trusted_write() set search_path = public;
alter function public.crud_assert_table(text) set search_path = public;
