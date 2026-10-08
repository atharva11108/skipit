"""Backend-only PostgreSQL document access through Supabase's authenticated RPC.

The existing routes keep their collection API; all filtering and mutations run
inside PostgreSQL. Compare-and-update and counters are atomic, not read/write
round trips. No secret key is sent to a browser.
"""
import os
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import httpx
from fastapi import HTTPException


COLLECTIONS = {
    "account_profiles", "personas", "status_checks", "auth_sessions",
    "persona_entries", "interview_sessions", "projects", "project_context_entries",
    "project_files", "project_update_proposals", "project_checkpoints",
    "temporary_grants", "guest_sessions", "guest_chat_messages",
    "context_access_logs", "mcp_tokens",
}


def encode(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, dict):
        return {key: encode(item) for key, item in value.items() if key != "_id"}
    if isinstance(value, (list, tuple)):
        return [encode(item) for item in value]
    return value


def decode(value: Any) -> Any:
    if isinstance(value, list):
        return [decode(item) for item in value]
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if key.endswith("_at") and isinstance(item, str):
                try:
                    item = datetime.fromisoformat(item.replace("Z", "+00:00"))
                except ValueError:
                    pass
            result[key] = decode(item)
        return result
    return value


class Cursor:
    def __init__(self, collection, query):
        self.collection, self.query = collection, query
        self.order = None

    def sort(self, field, direction=1):
        self.order = {"field": field, "direction": direction}
        return self

    async def to_list(self, length):
        return await self.collection.call("find", query=self.query, order=self.order, limit=length)


class Collection:
    def __init__(self, database, name):
        self.database, self.name = database, name

    async def call(self, operation, **arguments):
        return await self.database.call({"collection": self.name, "operation": operation, **arguments})

    def find(self, query=None):
        return Cursor(self, query or {})

    async def find_one(self, query):
        rows = await self.call("find", query=query, limit=1)
        return rows[0] if rows else None

    async def count_documents(self, query):
        return await self.call("count", query=query)

    async def insert_one(self, document):
        rows = await self.call("insert", documents=[document])
        return SimpleNamespace(inserted_id=rows[0])

    async def insert_many(self, documents):
        rows = await self.call("insert", documents=documents)
        return SimpleNamespace(inserted_ids=rows)

    async def update_one(self, query, update, upsert=False):
        result = await self.call("update", query=query, update=update, upsert=upsert, many=False)
        return SimpleNamespace(**result)

    async def update_many(self, query, update):
        result = await self.call("update", query=query, update=update, many=True)
        return SimpleNamespace(**result)

    async def find_one_and_update(self, query, update, return_document=False, upsert=False):
        result = await self.call("update", query=query, update=update, many=False, upsert=upsert)
        return result.get("after" if return_document else "before")

    async def delete_one(self, query):
        return SimpleNamespace(deleted_count=await self.call("delete", query=query, many=False))

    async def delete_many(self, query):
        return SimpleNamespace(deleted_count=await self.call("delete", query=query, many=True))


class SupabaseStore:
    def __init__(self):
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.secret = os.environ.get("SUPABASE_SECRET_KEY", "")

    def __getitem__(self, name):
        if name not in COLLECTIONS:
            raise ValueError("Unknown Skipti collection")
        return Collection(self, name)

    def __getattr__(self, name):
        return self[name]

    async def call(self, payload):
        if not self.url or not self.secret:
            raise HTTPException(status_code=503, detail="The application database is not configured.")
        headers = {"apikey": self.secret}
        if not self.secret.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.secret}"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{self.url}/rest/v1/rpc/skipti_store", headers=headers, json={"request": encode(payload)})
        if response.status_code >= 300:
            code = response.json().get("code", "") if "application/json" in response.headers.get("content-type", "") else ""
            if code == "23505":
                raise HTTPException(status_code=409, detail="This record changed concurrently. Refresh and try again.")
            raise HTTPException(status_code=503, detail="The application database is unavailable or its setup is incomplete.")
        return decode(response.json())

    async def command(self, name):
        if name != "ping":
            raise ValueError("Unsupported database command")
        return await self.call({"operation": "ping"})


class StoreClient:
    def close(self):
        pass
