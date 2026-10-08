import os
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, Request, Response

from lib.db import db
from models.skipti import UserView


SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
ACCESS_COOKIE = "skipti_access"
REFRESH_COOKIE = "skipti_refresh"


def _check_service_response(result: httpx.Response) -> None:
    if result.status_code >= 500:
        raise HTTPException(status_code=503, detail="Account service is temporarily unavailable. Please try again.")
    if result.status_code == 429:
        raise HTTPException(status_code=429, detail="Too many account requests. Please wait and try again.")


def _auth_headers(token: str | None = None) -> dict[str, str]:
    if not SUPABASE_URL or not PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Account service is not configured. Please contact the site owner.")
    headers = {"apikey": PUBLISHABLE_KEY, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _set_session_cookies(response: Response, session: dict[str, Any]) -> None:
    secure = os.environ.get("COOKIE_SECURE", "true" if os.environ.get("APP_URL", "http://localhost:3000").startswith("https://") else "false").lower() == "true"
    response.set_cookie(ACCESS_COOKIE, session["access_token"], httponly=True, secure=secure, samesite="lax", path="/", max_age=int(session.get("expires_in", 3600)))
    if session.get("refresh_token"):
        response.set_cookie(REFRESH_COOKIE, session["refresh_token"], httponly=True, secure=secure, samesite="lax", path="/", max_age=60 * 60 * 24 * 30)


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")


async def supabase_signup(email: str, password: str, display_name: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as client:
        result = await client.post(
            f"{SUPABASE_URL}/auth/v1/signup?redirect_to={quote(os.environ.get('APP_URL', 'http://localhost:3000').rstrip('/') + '/auth/callback', safe='')}",
            headers=_auth_headers(),
            json={"email": email, "password": password, "data": {"display_name": display_name}},
        )
    _check_service_response(result)
    if result.status_code >= 400:
        detail = result.json().get("msg") or result.json().get("message") or "Could not create account"
        raise HTTPException(status_code=400, detail=detail)
    return result.json()


async def supabase_login(email: str, password: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as client:
        result = await client.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers=_auth_headers(),
            json={"email": email, "password": password},
        )
    _check_service_response(result)
    if result.status_code >= 400:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return result.json()


async def _fetch_user(access_token: str) -> dict[str, Any] | None:
    async with httpx.AsyncClient(timeout=12) as client:
        result = await client.get(f"{SUPABASE_URL}/auth/v1/user", headers=_auth_headers(access_token))
    _check_service_response(result)
    if result.status_code not in {200, 401, 403}:
        raise HTTPException(status_code=503, detail="Could not verify the account session. Please try again.")
    return result.json() if result.status_code == 200 else None


async def _refresh_session(refresh_token: str) -> dict[str, Any] | None:
    async with httpx.AsyncClient(timeout=20) as client:
        result = await client.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
            headers=_auth_headers(),
            json={"refresh_token": refresh_token},
        )
    _check_service_response(result)
    if result.status_code not in {200, 400, 401, 403, 422}:
        raise HTTPException(status_code=503, detail="Could not refresh the account session. Please try again.")
    return result.json() if result.status_code == 200 else None


async def require_user(request: Request, response: Response) -> str:
    access_token = request.cookies.get(ACCESS_COOKIE)
    user = await _fetch_user(access_token) if access_token else None
    if not user:
        refresh = request.cookies.get(REFRESH_COOKIE)
        session = await _refresh_session(refresh) if refresh else None
        if session:
            _set_session_cookies(response, session)
            user = session.get("user") or await _fetch_user(session["access_token"])
    if not user or not user.get("id"):
        clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="Authentication required")
    await sync_user_profile(user)
    request.state.user = user
    return str(user["id"])


async def sync_user_profile(user: dict[str, Any]) -> None:
    # Metadata is display-only. Ownership is always the verified Supabase subject.
    metadata = user.get("user_metadata") or {}
    email = str(user.get("email") or "")
    await db.account_profiles.update_one({"id": str(user["id"])}, {"$set": {
        "email": email, "display_name": str(metadata.get("display_name") or email.split("@")[0] or "Your account")[:80],
    }}, upsert=True)


async def get_user_view(owner_id: str) -> UserView:
    profile = await db.account_profiles.find_one({"id": owner_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Account profile not found")
    return UserView(id=owner_id, email=profile["email"], display_name=profile["display_name"], auth_mode="supabase_email")


async def supabase_logout(access_token: str | None) -> None:
    if access_token and SUPABASE_URL and PUBLISHABLE_KEY:
        async with httpx.AsyncClient(timeout=12) as client:
            result = await client.post(f"{SUPABASE_URL}/auth/v1/logout?scope=local", headers=_auth_headers(access_token))
        if result.status_code not in {200, 204, 401, 403}:
            raise HTTPException(status_code=503, detail="Could not end the account session. Please try again.")


async def establish_session(response: Response, auth_result: dict[str, Any]) -> UserView | None:
    if not auth_result.get("access_token"):
        return None
    user = auth_result["user"]
    await sync_user_profile(user)
    _set_session_cookies(response, auth_result)
    return await get_user_view(str(user["id"]))

async def request_password_recovery(email: str) -> None:
    redirect = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/") + "/reset-password"
    async with httpx.AsyncClient(timeout=20) as client:
        result = await client.post(f"{SUPABASE_URL}/auth/v1/recover?redirect_to={quote(redirect, safe='')}", headers=_auth_headers(), json={"email": email})
    if result.status_code >= 400:
        raise HTTPException(status_code=503, detail="Could not send a reset link. Please try again later.")


async def change_password(access_token: str, password: str) -> dict[str, Any]:
    user = await _fetch_user(access_token)
    if not user:
        raise HTTPException(status_code=401, detail="This reset link has expired. Request a new link.")
    async with httpx.AsyncClient(timeout=20) as client:
        result = await client.put(f"{SUPABASE_URL}/auth/v1/user", headers=_auth_headers(access_token), json={"password": password})
    if result.status_code >= 400:
        raise HTTPException(status_code=400, detail="Could not update the password. Use a different password or request a new link.")
    return result.json()
