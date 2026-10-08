-- Supabase production target. The preview MVP uses the local Mongo adapter until credentials are configured.
create extension if not exists "pgcrypto";

create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null unique,
  revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.persona_entries (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null references public.personas(id) on delete cascade,
  owner_id uuid not null, category text not null, label text not null, value text not null,
  entry_type text not null, scope text not null default 'global', approval_status text not null default 'candidate',
  sensitivity text not null default 'standard', source text not null, temporary boolean not null default false,
  expires_at timestamptz, last_confirmed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, name text not null, description text not null,
  purpose text not null default '', stack jsonb not null default '[]', status text not null default 'active', revision integer not null default 1,
  state jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.project_checkpoints (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null, revision integer not null, summary text not null, state jsonb not null,
  source text not null, approval_status text not null default 'approved', created_at timestamptz not null default now(),
  unique(project_id, revision)
);
create table if not exists public.project_update_proposals (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null, base_revision integer not null, payload jsonb not null, status text not null default 'pending_approval',
  verification_status text not null default 'reported', source_provider text not null, created_at timestamptz not null default now()
);
create table if not exists public.temporary_sessions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, project_id uuid references public.projects(id) on delete cascade,
  credential_hash text not null unique, permissions jsonb not null, expires_at timestamptz not null,
  redeemed_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.context_access_logs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, project_id uuid references public.projects(id) on delete set null,
  selected_ids jsonb not null, query_hash text not null, created_at timestamptz not null default now()
);

alter table public.personas enable row level security;
alter table public.persona_entries enable row level security;
alter table public.projects enable row level security;
alter table public.project_checkpoints enable row level security;
alter table public.project_update_proposals enable row level security;
alter table public.temporary_sessions enable row level security;
alter table public.context_access_logs enable row level security;

create policy "owners manage personas" on public.personas using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage persona entries" on public.persona_entries using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage projects" on public.projects using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners read checkpoints" on public.project_checkpoints for select using (owner_id = auth.uid());
create policy "owners manage proposals" on public.project_update_proposals using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage temporary sessions" on public.temporary_sessions using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners read access logs" on public.context_access_logs for select using (owner_id = auth.uid());