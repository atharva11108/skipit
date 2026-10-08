import os
import re
import secrets
from typing import Any

import httpx
from fastapi import HTTPException


SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
BUCKET = "project-files"


def safe_path(value: str) -> str:
    parts = [re.sub(r"[^A-Za-z0-9._ -]", "_", part).strip()[:120] for part in value.replace("\\", "/").split("/")]
    return "/".join(part for part in parts if part and part not in {".", ".."})


def _headers(content_type: str = "application/json") -> dict[str, str]:
    if not SUPABASE_URL or not SECRET_KEY:
        raise HTTPException(status_code=503, detail="Private file storage is not configured. Context-only import is available.")
    headers = {"apikey": SECRET_KEY, "Content-Type": content_type}
    # Modern secret keys authenticate at the gateway; only legacy JWT keys
    # belong in the Authorization header.
    if not SECRET_KEY.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {SECRET_KEY}"
    return headers


async def upload_private(owner_id: str, project_id: str, relative_path: str, content: bytes, content_type: str) -> str:
    cleaned = safe_path(relative_path)
    if not cleaned:
        raise HTTPException(status_code=422, detail="Invalid file path")
    path = f"{owner_id}/{project_id}/{secrets.token_urlsafe(12)}-{cleaned}"
    async with httpx.AsyncClient(timeout=90) as client:
        result = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",
            headers={**_headers(content_type or "application/octet-stream"), "x-upsert": "false"},
            content=content,
        )
    if result.status_code >= 300:
        raise HTTPException(status_code=503, detail="Private file storage is temporarily unavailable")
    return path


async def delete_private(paths: list[str]) -> None:
    if not paths:
        return
    async with httpx.AsyncClient(timeout=30) as client:
        result = await client.request("DELETE", f"{SUPABASE_URL}/storage/v1/object/{BUCKET}", headers=_headers(), json={"prefixes": paths})
    if result.status_code >= 300:
        raise HTTPException(status_code=503, detail="Could not delete the private file. Please try again.")


async def signed_download(path: str, expires_in: int = 60) -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        result = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/sign/{BUCKET}/{path}",
            headers=_headers(),
            json={"expiresIn": expires_in},
        )
    if result.status_code >= 300:
        raise HTTPException(status_code=503, detail="Could not prepare private download")
    signed = result.json().get("signedURL") or result.json().get("signedUrl")
    if not signed:
        raise HTTPException(status_code=503, detail="Storage did not return a download link")
    return f"{SUPABASE_URL}/storage/v1{signed}" if signed and signed.startswith("/") else str(signed)
