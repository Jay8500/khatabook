-- Customers type their name, not a username: many customers share names ("Ravi"), so
-- their name goes to display_name and the unique username is generated for them.
-- Shop owners keep choosing a unique username.

alter table public.users_profile add column if not exists display_name text;

create or replace function public.make_username(p_name text)
returns text
language plpgsql volatile
set search_path = public
as $$
declare
  v_base text := left(trim(both '-' from regexp_replace(lower(coalesce(p_name, 'user')), '[^a-z0-9]+', '-', 'g')), 20);
  v_name text;
begin
  if v_base = '' then v_base := 'user'; end if;
  loop
    v_name := v_base || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.users_profile where lower(username) = v_name);
  end loop;
  return v_name;
end;
$$;

revoke execute on function public.make_username(text) from public, anon, authenticated;

create or replace function public.complete_onboarding(p_username text, p_shop_name text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := trim(coalesce(p_username, ''));
  v_owner boolean := public.has_permission('can_manage_own_shop');
  v_shop  uuid;
  v_plan  public.pricing_plans;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_name = '' then
    raise exception 'required';
  end if;

  perform public.allow_trusted_write();

  if v_owner then
    update public.users_profile set username = v_name, display_name = coalesce(display_name, v_name) where id = v_uid;
  else
    update public.users_profile
       set display_name = v_name,
           username = coalesce(username, public.make_username(v_name))
     where id = v_uid;
  end if;
  update public.shop_customers set name = v_name where user_id = v_uid and name is null;

  if coalesce(trim(p_shop_name), '') <> ''
     and v_owner
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

-- Profile edits: owners change their username, customers their display name.
create or replace function public.update_my_profile(p_username text, p_avatar_url text)
returns jsonb
language plpgsql security invoker
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_username, ''));
begin
  if v_name = '' then
    raise exception 'required';
  end if;

  if public.has_permission('can_manage_own_shop') then
    update public.users_profile set username = v_name, display_name = v_name, avatar_url = p_avatar_url where id = auth.uid();
  else
    update public.users_profile set display_name = v_name, avatar_url = p_avatar_url where id = auth.uid();
    update public.shop_customers set name = v_name where user_id = auth.uid();
  end if;

  return public.get_my_context();
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
end;
$$;

-- Joining a shop records the person's display name.
create or replace function public.store_join(p_shop_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_row public.shop_customers;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.shop_customers (shop_id, user_id, name, phone)
  select p_shop_id, up.id, coalesce(up.display_name, up.username), up.phone
  from public.users_profile up where up.id = auth.uid()
  on conflict (shop_id, user_id) do update set name = coalesce(public.shop_customers.name, excluded.name)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- Existing people: display name = current username.
update public.users_profile set display_name = username where display_name is null and username is not null;
