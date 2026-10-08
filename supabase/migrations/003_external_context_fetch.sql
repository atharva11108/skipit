-- Server-side, token-authorized plain-text context access for external AI fetch tools.
create table if not exists public.session_permissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.temporary_sessions(id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now(),
  unique(session_id, category)
);

create index if not exists session_permissions_session on public.session_permissions(session_id);
alter table public.session_permissions enable row level security;
-- Direct browser access is intentionally denied; FastAPI uses the backend-only pooler connection.

alter table public.temporary_sessions
  add column if not exists retain_chat_until_expiry boolean not null default false;

alter table public.context_access_logs
  alter column owner_id drop not null,
  add column if not exists session_id uuid references public.temporary_sessions(id) on delete set null,
  add column if not exists query text,
  add column if not exists categories_requested jsonb not null default '[]',
  add column if not exists entry_ids_returned jsonb not null default '[]',
  add column if not exists source text not null default 'internal';

create index if not exists context_access_logs_session_created on public.context_access_logs(session_id, created_at desc);