"""Disposable browser test service. Never use for deployment.
Run from backend: python -m tests.browser_server
Only loopback is exposed; records and provider responses are simulated.
"""
import os
from uuid import uuid4
os.environ["APP_URL"] = "http://127.0.0.1:3002"
os.environ["CORS_ORIGINS"] = "http://127.0.0.1:3002,http://localhost:3002"
os.environ["COOKIE_SECURE"] = "false"
os.environ["GEMINI_API_KEY"] = "disposable-test-provider"
from mongomock_motor import AsyncMongoMockClient
from fastapi import HTTPException
import lib.db as database
import lib.auth as auth
import services.skipti as service
import routers.skipti as routes
import mcp_server
from server import app

db = AsyncMongoMockClient(tz_aware=True).skipti_browser_test
for module in [database, auth, service, routes, mcp_server]:
    module.db = db
identities = {}
async def login(email, password, display_name="Test workspace"):
    if email not in identities:
        identities[email] = {"id": str(uuid4()), "email": email, "user_metadata": {"display_name": display_name}}
    return {"user": identities[email], "access_token": email, "refresh_token": email, "expires_in": 3600}
async def fetch(token):
    return identities.get(token)
async def offline(*args):
    raise RuntimeError("Use exact-answer interview fallback")
async def answer(question, context, *args, **kwargs):
    return "Test provider response. Selected context: " + ("; ".join(str(item["value"]) for item in context) or "None")
async def logout(*args):
    pass
routes.supabase_login = login
routes.supabase_signup = login
auth._fetch_user = fetch
routes.supabase_logout = logout
routes.extract_interview_answer = offline
service.extract_progress = offline
service.answer_with_context = answer
@app.middleware("http")
async def identify_test_service(request, call_next):
    response = await call_next(request)
    response.headers["X-Skipti-Test-Service"] = "disposable-mocked-providers"
    return response
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002)
