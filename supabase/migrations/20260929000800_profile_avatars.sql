-- Profile photos: public bucket (avatars are shown in the UI), but each user can only
-- write inside their own folder "<user id>/".

alter table public.users_profile add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_read_own on storage.objects for select using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy avatars_insert_own on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy avatars_update_own on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Username / photo for the signed-in user; a taken username becomes 'username_taken'.
create or replace function public.update_my_profile(p_username text, p_avatar_url text)
returns jsonb
language plpgsql security invoker
set search_path = public
as $$
begin
  if coalesce(trim(p_username), '') = '' then
    raise exception 'required';
  end if;

  update public.users_profile
     set username = trim(p_username),
         avatar_url = p_avatar_url
   where id = auth.uid();

  return public.get_my_context();
exception
  when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
end;
$$;

revoke execute on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
