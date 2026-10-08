"""Direct Supabase (Postgres) verification helpers for tests.

Connects independently of the app's own engine instance (own short-lived engine per
call) so tests never import or rely on app module import order / pool state. Used only
to assert real side effects (audit log rows, deterministic expiry) the HTTP API itself
does not expose a read path for -- never to mock or fake data.
"""

import hashlib
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_DATABASE_URL = os.environ.get("DATABASE_URL", "")
_ASYNC_DATABASE_URL = _DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
_SESSION_SECRET = os.environ.get("SESSION_SECRET", "")


def hash_token(token: str) -> str:
    """Mirrors services.skipti.hash_token without importing app modules."""
    return hashlib.sha256(f"{_SESSION_SECRET}:{token}".encode()).hexdigest()


async def _run(fn):
    engine = create_async_engine(_ASYNC_DATABASE_URL, pool_size=1, max_overflow=0, connect_args={"statement_cache_size": 0})
    try:
        async with engine.connect() as conn:
            return await fn(conn)
    finally:
        await engine.dispose()


async def force_expire_session(token: str) -> None:
    credential_hash = hash_token(token)

    async def _do(conn):
        await conn.execute(
            text("""
                update public.temporary_sessions
                set expires_at = now() - interval '1 hour'
                where credential_hash = :credential_hash
            """),
            {"credential_hash": credential_hash},
        )
        await conn.commit()

    await _run(_do)


async def fetch_latest_access_log(session_id: str) -> dict[str, Any] | None:
    async def _do(conn):
        row = (
            await conn.execute(
                text("""
                    select owner_id, project_id, session_id, query, categories_requested,
                           entry_ids_returned, source, created_at
                    from public.context_access_logs
                    where session_id = cast(:session_id as uuid)
                    order by created_at desc
                    limit 1
                """),
                {"session_id": session_id},
            )
        ).mappings().one_or_none()
        return dict(row) if row else None

    return await _run(_do)
