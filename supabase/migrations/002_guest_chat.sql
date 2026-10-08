-- Production target for temporary Persona Pass chat. The preview continues to use the local Mongo adapter.
create table if not exists public.guest_chat_messages (
  id uuid primary key default gen_random_uuid(),
  temporary_session_id uuid not null references public.temporary_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  selected_context_ids jsonb not null default '[]',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists guest_chat_session_created on public.guest_chat_messages(temporary_session_id, created_at);
alter table public.guest_chat_messages enable row level security;
-- Guest chat is server-only. No browser role receives a direct table policy.