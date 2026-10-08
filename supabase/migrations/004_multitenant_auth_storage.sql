create table if not exists public.users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_skipti_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (user_id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (user_id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_skipti_auth_user_created on auth.users;
create trigger on_skipti_auth_user_created after insert on auth.users
for each row execute procedure public.handle_skipti_user();

alter table public.users enable row level security;
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists project_files_insert_own_folder on storage.objects;
create policy project_files_insert_own_folder on storage.objects for insert to authenticated
with check (bucket_id = 'project-files' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists project_files_select_own_folder on storage.objects;
create policy project_files_select_own_folder on storage.objects for select to authenticated
using (bucket_id = 'project-files' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists project_files_delete_own_folder on storage.objects;
create policy project_files_delete_own_folder on storage.objects for delete to authenticated
using (bucket_id = 'project-files' and (storage.foldername(name))[1] = (select auth.uid()::text));