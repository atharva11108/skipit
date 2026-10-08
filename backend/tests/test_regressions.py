"""Regression coverage using isolated Mongo records and mocked upstream services."""
import asyncio
import os
from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from mongomock_motor import AsyncMongoMockClient

import lib.db as database
import lib.auth as auth
import services.skipti as service
import routers.skipti as routes
import mcp_server
from models.skipti import utc_now
from server import app


@pytest.fixture
async def isolated(monkeypatch):
    db = AsyncMongoMockClient(tz_aware=True).skipti
    for module in [database, auth, service, routes, mcp_server]:
        monkeypatch.setattr(module, "db", db)
    monkeypatch.setenv("APP_URL", "http://test")
    monkeypatch.setenv("CORS_ORIGINS", "http://test")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    identities = {}
    async def login(email, password):
        if email not in identities:
            identities[email] = {"id": str(uuid4()), "email": email, "user_metadata": {"display_name": email.split("@")[0]}}
        return {"user": identities[email], "access_token": email, "refresh_token": email, "expires_in": 3600}
    async def fetch(token):
        return identities.get(token)
    monkeypatch.setattr(routes, "supabase_login", login)
    monkeypatch.setattr(auth, "_fetch_user", fetch)
    monkeypatch.setattr(routes, "supabase_logout", AsyncMock())
    monkeypatch.setattr(routes, "extract_interview_answer", AsyncMock(side_effect=RuntimeError("AI offline")))
    monkeypatch.setattr(service, "extract_progress", AsyncMock(side_effect=RuntimeError("AI offline")))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/api/auth/login", json={"email": "alice@example.com", "password": "testing-password"})).status_code == 200
        yield client, db


async def project(client):
    result = await client.post("/api/projects", json={"name": "Project Alpha", "description": "A useful project", "stack": ["React"]})
    assert result.status_code == 201, result.text
    return result.json()["id"]


async def entry(client, **extra):
    response = await client.post("/api/persona/entries", json={"category": "Goals", "label": "Learning goal", "value": "Learn robotics", "entry_type": "goal", **extra})
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def share(client, **extra):
    response = await client.post("/api/shares", json={"permissions": ["goals"], "duration_minutes": 15, **extra})
    assert response.status_code == 201, response.text
    return response.json()


async def test_auth_and_tenant_isolation(isolated):
    client, db = isolated
    pid = await project(client)
    eid = await entry(client)
    await client.post("/api/auth/login", json={"email": "bob@example.com", "password": "testing-password"})
    assert (await client.get("/api/projects")).json() == []
    assert (await client.get(f"/api/projects/{pid}")).status_code == 404
    assert (await client.patch(f"/api/persona/entries/{eid}", json={"value": "intrusion"})).status_code == 404
    await client.post("/api/auth/logout")
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_validation_rejects_whitespace(isolated):
    client, _ = isolated
    assert (await client.post("/api/projects", json={"name": "  ", "description": "abc"})).status_code == 422
    assert (await client.post("/api/persona/entries", json={"category": "ok", "label": "ok", "value": "  "})).status_code == 422
    assert (await client.post("/api/auth/login", json={"email": "not-an-email", "password": "testing-password"})).status_code == 422


async def test_external_links_use_current_context_and_permissions(isolated):
    client, _ = isolated
    eid = await entry(client)
    await entry(client, sensitivity="sensitive", value="SECRET")
    await entry(client, scope="project", value="PROJECT SECRET")
    data = await share(client)
    path = data["ai_context_url"].replace("http://test", "")
    first = await client.get(path)
    assert first.status_code == 200
    assert "Learn robotics" in first.text and "SECRET" not in first.text
    assert first.headers["cache-control"] == "no-store"
    await client.patch(f"/api/persona/entries/{eid}", json={"value": "Learn painting"})
    assert "Learn painting" in (await client.get(path)).text
    assert "Learn robotics" not in (await client.get(path)).text
    await client.delete(f"/api/persona/entries/{eid}")
    assert "Learn painting" not in (await client.get(path)).text
    await client.post(f"/api/shares/{data['id']}/revoke")
    assert (await client.get(path)).status_code == 410


async def test_project_only_share_has_no_persona(isolated):
    client, _ = isolated
    await entry(client)
    pid = await project(client)
    data = await share(client, project_id=pid, permissions=["project"])
    text = (await client.get(data["ai_context_url"].replace("http://test", ""))).text
    assert "A useful project" in text and "Learn robotics" not in text


async def test_one_time_redeem_and_expiry(isolated):
    client, db = isolated
    data = await share(client)
    token = data["connect_url"].split("/")[-1]
    assert (await client.post("/api/shares/redeem", json={"token": token})).status_code == 200
    assert (await client.post("/api/shares/redeem", json={"token": token})).status_code == 410
    assert (await client.get("/api/guest/context")).status_code == 200
    await db.temporary_grants.update_one({"id": data["id"]}, {"$set": {"expires_at": utc_now() - timedelta(seconds=1)}})
    assert (await client.get("/api/guest/context")).status_code == 401
    assert (await client.get(data["ai_context_url"].replace("http://test", ""))).status_code == 410


async def test_interview_fallback_and_idempotent_completion(isolated):
    client, _ = isolated
    start = (await client.post("/api/interview/start")).json()
    sid = start["session_id"]
    assert (await client.post("/api/interview/complete", json={"session_id": sid, "approved_entry_ids": []})).status_code == 409
    for i in range(6):
        response = await client.post("/api/interview/answer", json={"session_id": sid, "answer": f"Explicit owner answer {i}"})
        assert response.status_code == 200, response.text
    result = response.json()
    assert result["complete"] and len(result["candidates"]) == 6
    assert result["candidates"][0]["value"] == "Explicit owner answer 0"
    assert (await client.post("/api/interview/answer", json={"session_id": sid, "answer": "one more"})).status_code == 409
    payload = {"session_id": sid, "approved_entry_ids": [item["id"] for item in result["candidates"]]}
    first = await client.post("/api/interview/complete", json=payload)
    second = await client.post("/api/interview/complete", json=payload)
    assert first.json()["revision"] == second.json()["revision"]
    assert len(second.json()["entries"]) == 6


async def test_project_revisions_conflicts_restore_and_reject(isolated):
    client, _ = isolated
    pid = await project(client)
    update = {"expected_revision": 1, "name": "Renamed Alpha", "status": "paused", "completed": ["Setup"]}
    assert (await client.patch(f"/api/projects/{pid}", json=update)).json()["revision"] == 2
    assert (await client.patch(f"/api/projects/{pid}", json=update)).status_code == 409
    proposal = (await client.post(f"/api/projects/{pid}/proposals", json={"expected_revision": 2, "update_text": "Started integration testing"})).json()
    assert (await client.post(f"/api/projects/{pid}/proposals/{proposal['id']}/reject")).status_code == 200
    assert (await client.post(f"/api/projects/{pid}/proposals/{proposal['id']}/approve", json={"expected_revision": 2})).status_code == 409
    restore = await client.post(f"/api/projects/{pid}/restore", json={"expected_revision": 2, "revision": 1})
    assert restore.status_code == 200 and restore.json()["revision"] == 3
    state = (await client.get(f"/api/projects/{pid}")).json()["project"]
    assert state["name"] == "Project Alpha" and state["status"] == "active" and state["completed"] == []
    assert len((await client.get(f"/api/projects/{pid}/history")).json()) == 3


async def test_folder_batch_validation_and_delete(isolated):
    client, db = isolated
    pid = await project(client)
    files = [("files", ("good.md", b"Robotics project details", "text/plain")), ("files", ("bad.exe", b"binary", "application/octet-stream"))]
    response = await client.post(f"/api/projects/{pid}/files", data={"mode": "context_only"}, files=files)
    assert response.status_code == 415
    assert await db.project_context_entries.count_documents({}) == 0
    assert await db.project_files.count_documents({}) == 0
    response = await client.post(f"/api/projects/{pid}/files", data={"mode": "context_only"}, files=files[:1])
    assert response.status_code == 201, response.text
    fid = response.json()["files"][0]["id"]
    assert await db.project_context_entries.count_documents({}) == 1
    assert (await client.delete(f"/api/projects/{pid}/files/{fid}")).status_code == 200
    assert await db.project_context_entries.count_documents({}) == 0


async def test_unrelated_query_does_not_disclose_persona(isolated):
    client, _ = isolated
    await entry(client)
    result = (await client.post("/api/context/search", json={"query": "ocean currents"})).json()
    assert result["selected"] == [] and result["approximate_tokens"] == 0


async def test_cross_origin_writes_blocked(isolated):
    client, _ = isolated
    response = await client.post("/api/projects", headers={"Origin": "https://attacker.example"}, json={"name": "Bad project", "description": "Should fail"})
    assert response.status_code == 403


async def test_revoke_during_guest_generation_blocks_output(isolated, monkeypatch):
    client, db = isolated
    await entry(client)
    data = await share(client)
    await client.post("/api/shares/redeem", json={"token": data["connect_url"].split("/")[-1]})
    async def ai(*args, **kwargs):
        await service.revoke_share((await client.get("/api/auth/me")).json()["id"], data["id"])
        return "This must not be released"
    monkeypatch.setattr(service, "answer_with_context", ai)
    response = await client.post("/api/guest/chat", json={"message": "Tell me about robotics"})
    assert response.status_code == 401
    assert "must not be released" not in response.text
    assert await db.guest_chat_messages.count_documents({}) == 0


async def test_mcp_token_rotation(isolated):
    client, _ = isolated
    old = (await client.post("/api/auth/mcp-token")).json()["token"]
    current = (await client.post("/api/auth/mcp-token")).json()["token"]
    verifier = mcp_server.AccountTokenVerifier()
    assert await verifier.verify_token(old) is None
    assert (await verifier.verify_token(current)).client_id == (await client.get("/api/auth/me")).json()["id"]


async def test_stored_file_upload_download_delete(isolated, monkeypatch):
    import lib.storage as storage
    client, db = isolated
    pid = await project(client)
    uploaded = []
    deleted = []
    async def upload(owner, project_id, path, content, content_type):
        stored = f"{owner}/{project_id}/{path}"
        uploaded.append((stored, content))
        return stored
    async def download(path):
        return "https://storage.example/private-signed-link"
    async def delete(paths):
        deleted.extend(paths)
    monkeypatch.setattr(storage, "upload_private", upload)
    monkeypatch.setattr(storage, "signed_download", download)
    monkeypatch.setattr(storage, "delete_private", delete)
    response = await client.post(f"/api/projects/{pid}/files", data={"mode": "stored"}, files=[("files", ("asset.bin", b"original bytes", "application/octet-stream"))])
    assert response.status_code == 201, response.text
    record = response.json()["files"][0]
    assert uploaded[0][1] == b"original bytes"
    assert (await client.get(f"/api/projects/{pid}/files/{record['id']}/download")).json()["url"] == "https://storage.example/private-signed-link"
    assert (await client.delete(f"/api/projects/{pid}/files/{record['id']}")).status_code == 200
    assert deleted == [record["storage_path"]]
    assert (await client.get(f"/api/projects/{pid}/files")).json()["files"] == []


async def test_upload_failure_cleans_partial_records(isolated, monkeypatch):
    import lib.storage as storage
    client, db = isolated
    pid = await project(client)
    count = 0
    async def upload(*args):
        nonlocal count
        count += 1
        if count == 2:
            from fastapi import HTTPException
            raise HTTPException(status_code=503, detail="Storage unavailable")
        return "private/first.txt"
    deleted = AsyncMock()
    monkeypatch.setattr(storage, "upload_private", upload)
    monkeypatch.setattr(storage, "delete_private", deleted)
    response = await client.post(f"/api/projects/{pid}/files", data={"mode": "stored"}, files=[("files", ("first.txt", b"one", "text/plain")), ("files", ("second.txt", b"two", "text/plain"))])
    assert response.status_code == 503
    assert await db.project_files.count_documents({}) == 0
    deleted.assert_awaited_once_with(["private/first.txt"])


async def test_export_and_candidate_approval(isolated):
    client, db = isolated
    public_id = await entry(client)
    await entry(client, value="sensitive secret", sensitivity="sensitive")
    owner = (await client.get("/api/auth/me")).json()["id"]
    from models.skipti import PersonaEntry
    candidate = PersonaEntry(owner_id=owner, category="Skills", label="Python", value="Python programming", approval_status="candidate")
    await db.persona_entries.insert_one(candidate.model_dump())
    export = (await client.get("/api/persona/export")).json()
    assert "Learn robotics" in export["markdown"] and "sensitive secret" not in export["markdown"] and "Python programming" not in export["markdown"]
    assert (await client.post(f"/api/persona/entries/{candidate.id}/approve")).status_code == 200
    assert "Python programming" in (await client.get("/api/persona/export")).json()["markdown"]
    assert (await client.post(f"/api/persona/entries/{candidate.id}/approve")).status_code == 404


async def test_recovery_session_requires_verified_token(isolated, monkeypatch):
    client, _ = isolated
    response = await client.post("/api/auth/session", json={"access_token": "invalid-but-long-enough-token"})
    assert response.status_code == 401
    monkeypatch.setattr(auth, "request_password_recovery", AsyncMock())
    response = await client.post("/api/auth/recover", json={"email": "owner@example.com"})
    assert response.status_code == 200
    auth.request_password_recovery.assert_awaited_once_with("owner@example.com")
    monkeypatch.setattr(auth, "change_password", AsyncMock())
    response = await client.post("/api/auth/password", json={"access_token": "recovery-token-long-enough", "password": "a-new-test-password"})
    assert response.status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_storage_delete_http_request_and_errors(monkeypatch):
    import lib.storage as storage
    requests = []
    actual_client = httpx.AsyncClient
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={})
    monkeypatch.setattr(storage, "SUPABASE_URL", "https://storage.example")
    monkeypatch.setattr(storage, "SECRET_KEY", "mock-secret")
    monkeypatch.setattr(storage.httpx, "AsyncClient", lambda **kwargs: actual_client(transport=httpx.MockTransport(handler), **kwargs))
    await storage.delete_private(["owner/project/file.txt"])
    assert requests[0].method == "DELETE"
    assert b"owner/project/file.txt" in requests[0].content


async def test_missing_auth_config_is_service_error(monkeypatch):
    from fastapi import HTTPException
    monkeypatch.setattr(auth, "SUPABASE_URL", "")
    monkeypatch.setattr(auth, "PUBLISHABLE_KEY", "")
    with pytest.raises(HTTPException) as raised:
        await auth.supabase_login("owner@example.com", "a-test-password")
    assert raised.value.status_code == 503


async def test_persona_revision_advances_on_each_change(isolated):
    client, _ = isolated
    assert (await client.get("/api/persona")).json()["revision"] == 0
    eid = await entry(client)
    assert (await client.get("/api/persona")).json()["revision"] == 1
    await client.patch(f"/api/persona/entries/{eid}", json={"value": "Learn painting"})
    assert (await client.get("/api/persona")).json()["revision"] == 2
    await client.delete(f"/api/persona/entries/{eid}")
    assert (await client.get("/api/persona")).json()["revision"] == 3


def test_storage_supports_modern_and_legacy_secret_keys(monkeypatch):
    import lib.storage as storage
    monkeypatch.setattr(storage, "SUPABASE_URL", "https://storage.example")
    monkeypatch.setattr(storage, "SECRET_KEY", "sb_secret_test-key")
    assert storage._headers()["apikey"] == "sb_secret_test-key"
    assert "Authorization" not in storage._headers()
    monkeypatch.setattr(storage, "SECRET_KEY", "legacy-jwt-service-role")
    assert storage._headers()["Authorization"] == "Bearer legacy-jwt-service-role"


async def test_account_outage_does_not_look_like_bad_credentials(monkeypatch):
    from fastapi import HTTPException
    actual_client = httpx.AsyncClient
    monkeypatch.setattr(auth, "SUPABASE_URL", "https://accounts.example")
    monkeypatch.setattr(auth, "PUBLISHABLE_KEY", "sb_publishable_test-key")
    monkeypatch.setattr(auth.httpx, "AsyncClient", lambda **kwargs: actual_client(transport=httpx.MockTransport(lambda request: httpx.Response(503, text="Service unavailable")), **kwargs))
    for operation in [auth.supabase_login("owner@example.com", "test-password"), auth._fetch_user("test-access-token"), auth._refresh_session("test-refresh-token")]:
        with pytest.raises(HTTPException) as raised:
            await operation
        assert raised.value.status_code == 503


async def test_spa_fallback_does_not_swallow_api_routes(tmp_path):
    from server import SPAFiles
    from starlette.exceptions import HTTPException
    (tmp_path / "index.html").write_text("<html>Skipti</html>", encoding="utf-8")
    files = SPAFiles(directory=tmp_path, html=True)
    scope = {"type": "http", "method": "GET", "headers": []}
    for path in ["api/missing", "api\\missing", "mcp/missing", "assets/missing.js"]:
        with pytest.raises(HTTPException) as raised:
            await files.get_response(path, scope)
        assert raised.value.status_code == 404
    assert (await files.get_response("projects/local-project", scope)).status_code == 200
