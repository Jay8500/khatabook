-- The trusted-write flag must only cover the statements inside the trusted function.
-- Previously it stayed on for the rest of the transaction, so a later statement in the
-- same transaction could bypass the profile/shop column guards.

create or replace function public.end_trusted_write()
returns void
language sql
set search_path = public
as $$
  select set_config('khata.trusted_write', 'off', true);
$$;

revoke execute on function public.end_trusted_write() from public, anon, authenticated;

create or replace function public.sync_admin_roles()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin   uuid := public.role_id_by_setting('ADMIN_ROLE_NAME');
  v_default uuid := public.role_id_by_setting('DEFAULT_ROLE_NAME');
begin
  if v_admin is null then
    return;
  end if;

  perform public.allow_trusted_write();

  update public.users_profile
     set role_id = v_admin
   where public.is_admin_phone(phone)
     and role_id is distinct from v_admin;

  update public.users_profile
     set role_id = v_default
   where role_id = v_admin
     and not public.is_admin_phone(phone);

  perform public.end_trusted_write();
end;
$$;

create or replace function public.complete_onboarding(p_username text, p_shop_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_shop uuid;
  v_plan public.pricing_plans;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_username), '') = '' then
    raise exception 'username is required';
  end if;

  perform public.allow_trusted_write();

  update public.users_profile set username = trim(p_username) where id = v_uid;

  if coalesce(trim(p_shop_name), '') <> ''
     and not exists (select 1 from public.shops where owner_user_id = v_uid) then
    select * into v_plan from public.pricing_plans
     where name = public.setting_text('DEFAULT_PLAN_NAME') and is_active
     limit 1;

    insert into public.shops (owner_user_id, name, subscription_plan_id, subscription_expires_at)
    values (
      v_uid,
      trim(p_shop_name),
      v_plan.id,
      case when v_plan.id is null then null else now() + make_interval(days => v_plan.duration_days) end
    )
    returning id into v_shop;

    update public.users_profile set shop_id = v_shop where id = v_uid;
  end if;

  perform public.end_trusted_write();
  return public.get_my_context();
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
end;
$$;
