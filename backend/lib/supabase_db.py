"""Backend-only Supabase PostgreSQL access for external Persona Pass fetches."""

import hashlib
import json
import os
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


database_url = os.environ.get("DATABASE_URL", "")
async_database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    async_database_url,
    pool_size=5,
    max_overflow=5,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=False,
    connect_args={"statement_cache_size": 0, "command_timeout": 30},
) if async_database_url else None

SessionFactory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False) if engine else None


def _require_session_factory() -> async_sessionmaker[AsyncSession]:
    if SessionFactory is None:
        raise RuntimeError("Supabase database is not configured")
    return SessionFactory


async def sync_external_session(
    session_document: dict[str, Any],
    persona_revision: int,
    entries: list[dict[str, Any]],
    allowed_categories: list[str],
    project: dict[str, Any] | None,
) -> None:
    factory = _require_session_factory()
    async with factory() as session, session.begin():
        persona_id = (
            await session.execute(
                text("""
                    insert into public.personas (owner_id, revision, updated_at)
                    values (cast(:owner_id as uuid), :revision, now())
                    on conflict (owner_id) do update set revision = excluded.revision, updated_at = now()
                    returning id
                """),
                {"owner_id": session_document["owner_id"], "revision": persona_revision},
            )
        ).scalar_one()
        for entry in entries:
            entry_params = {**entry, "persona_id": str(persona_id)}
            entry_params.setdefault("expires_at", None)
            await session.execute(
                text("""
                    insert into public.persona_entries
                      (id, persona_id, owner_id, category, label, value, entry_type, scope,
                       approval_status, sensitivity, source, temporary, expires_at,
                       last_confirmed_at, created_at, updated_at)
                    values
                      (cast(:id as uuid), cast(:persona_id as uuid), cast(:owner_id as uuid), :category,
                       :label, :value, :entry_type, :scope, :approval_status, :sensitivity, :source,
                       :temporary, :expires_at, :last_confirmed_at, :created_at, :updated_at)
                    on conflict (id) do update set
                      category = excluded.category, label = excluded.label, value = excluded.value,
                      entry_type = excluded.entry_type, scope = excluded.scope,
                      approval_status = excluded.approval_status, sensitivity = excluded.sensitivity,
                      source = excluded.source, temporary = excluded.temporary,
                      expires_at = excluded.expires_at, last_confirmed_at = excluded.last_confirmed_at,
                      updated_at = excluded.updated_at
                """),
                entry_params,
            )
        if project:
            await session.execute(
                text("""
                    insert into public.projects
                      (id, owner_id, name, description, purpose, stack, status, revision, state, created_at, updated_at)
                    values
                      (cast(:id as uuid), cast(:owner_id as uuid), :name, :description, :purpose,
                       cast(:stack as jsonb), :status, :revision, cast(:state as jsonb), :created_at, :updated_at)
                    on conflict (id) do update set
                      name = excluded.name, description = excluded.description, purpose = excluded.purpose,
                      stack = excluded.stack, status = excluded.status, revision = excluded.revision,
                      state = excluded.state, updated_at = excluded.updated_at
                """),
                {
                    **project,
                    "stack": json.dumps(project.get("stack", [])),
                    "state": json.dumps(project.get("state", {})),
                },
            )
        await session.execute(
            text("""
                insert into public.temporary_sessions
                  (id, owner_id, project_id, credential_hash, permissions, expires_at,
                   redeemed_at, revoked_at, created_at, retain_chat_until_expiry)
                values
                  (cast(:id as uuid), cast(:owner_id as uuid), cast(:project_id as uuid), :credential_hash,
                   cast(:permissions as jsonb), :expires_at, :redeemed_at, :revoked_at, :created_at,
                   :retain_chat_until_expiry)
                on conflict (id) do update set
                  permissions = excluded.permissions, expires_at = excluded.expires_at,
                  revoked_at = excluded.revoked_at,
                  retain_chat_until_expiry = excluded.retain_chat_until_expiry
            """),
            {
                "id": session_document["id"],
                "owner_id": session_document["owner_id"],
                "project_id": session_document.get("project_id"),
                "credential_hash": session_document["redeem_hash"],
                "permissions": json.dumps(session_document["permissions"]),
                "expires_at": session_document["expires_at"],
                "redeemed_at": session_document.get("redeemed_at"),
                "revoked_at": session_document.get("revoked_at"),
                "created_at": session_document["created_at"],
                "retain_chat_until_expiry": session_document.get("retain_chat_until_expiry", False),
            },
        )
        await session.execute(
            text("delete from public.session_permissions where session_id = cast(:session_id as uuid)"),
            {"session_id": session_document["id"]},
        )
        for category in sorted(set(allowed_categories)):
            await session.execute(
                text("""
                    insert into public.session_permissions (session_id, category)
                    values (cast(:session_id as uuid), :category)
                    on conflict (session_id, category) do nothing
                """),
                {"session_id": session_document["id"], "category": category},
            )


async def set_external_session_revoked(session_id: str, owner_id: str, revoked_at: datetime) -> bool:
    factory = _require_session_factory()
    async with factory() as session, session.begin():
        result = await session.execute(
            text("""
                update public.temporary_sessions
                set revoked_at = :revoked_at
                where id = cast(:session_id as uuid) and owner_id = cast(:owner_id as uuid)
            """),
            {"session_id": session_id, "owner_id": owner_id, "revoked_at": revoked_at},
        )
        return bool(result.rowcount)


async def fetch_external_session(credential_hash: str) -> dict[str, Any] | None:
    factory = _require_session_factory()
    async with factory() as session:
        row = (
            await session.execute(
                text("""
                    select id, owner_id, project_id, expires_at, revoked_at
                    from public.temporary_sessions
                    where credential_hash = :credential_hash
                    limit 1
                """),
                {"credential_hash": credential_hash},
            )
        ).mappings().one_or_none()
        if not row:
            return None
        categories = (
            await session.execute(
                text("""
                    select category from public.session_permissions
                    where session_id = cast(:session_id as uuid)
                    order by category
                """),
                {"session_id": str(row["id"])},
            )
        ).scalars().all()
        return {**dict(row), "categories": list(categories)}


async def fetch_active_entries(owner_id: str, categories: list[str]) -> list[dict[str, Any]]:
    if not categories:
        return []
    factory = _require_session_factory()
    async with factory() as session:
        rows = (
            await session.execute(
                text("""
                    select id, category, label, value, updated_at
                    from public.persona_entries
                    where owner_id = cast(:owner_id as uuid)
                      and approval_status = 'approved'
                      and category = any(cast(:categories as text[]))
                      and (expires_at is null or expires_at > now())
                    order by category, updated_at desc
                """),
                {"owner_id": owner_id, "categories": categories},
            )
        ).mappings().all()
        return [dict(row) for row in rows]


async def log_external_fetch(
    external_session: dict[str, Any] | None,
    query: str | None,
    categories: list[str],
    entry_ids: list[str],
) -> None:
    factory = _require_session_factory()
    query_value = query or ""
    async with factory() as session, session.begin():
        await session.execute(
            text("""
                insert into public.context_access_logs
                  (owner_id, project_id, session_id, selected_ids, query_hash, query,
                   categories_requested, entry_ids_returned, source, created_at)
                values
                  (cast(:owner_id as uuid), cast(:project_id as uuid), cast(:session_id as uuid),
                   cast(:selected_ids as jsonb), :query_hash, :query,
                   cast(:categories as jsonb), cast(:entry_ids as jsonb), 'external_fetch', now())
            """),
            {
                "owner_id": str(external_session["owner_id"]) if external_session else None,
                "project_id": str(external_session["project_id"]) if external_session and external_session.get("project_id") else None,
                "session_id": str(external_session["id"]) if external_session else None,
                "selected_ids": json.dumps(entry_ids),
                "query_hash": hashlib.sha256(query_value.encode()).hexdigest(),
                "query": query,
                "categories": json.dumps(categories),
                "entry_ids": json.dumps(entry_ids),
            },
        )