import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Request, Depends, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
import httpx
from pymongo.errors import PyMongoError
from fastapi.responses import JSONResponse
from starlette.staticfiles import StaticFiles
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes
from mcp_server import mcp, mcp_app
from routers.skipti import router as skipti_router, require_owner


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    async with mcp.session_manager.run():
        yield
    app.state.index_task.cancel()
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")
api_router.include_router(skipti_router)


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Skipti AI API", "health": "/api/health"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate, owner_id: str = Depends(require_owner)):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one({**status_obj.model_dump(), "owner_id": owner_id})
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks(owner_id: str = Depends(require_owner)):
    status_checks = await db.status_checks.find({"owner_id": owner_id}).to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', os.environ.get('APP_URL', 'http://localhost:3000')).split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# The official MCP SDK owns protocol negotiation below this mount. Its internal route is `/`.
app.mount("/mcp", mcp_app)

# Keep this final: all REST routes are folded into api_router above.
app.include_router(api_router)


@app.middleware("http")
async def response_boundaries(request: Request, call_next):
    # Cookie-authenticated writes must come from our own browser origin.
    origin = request.headers.get("origin")
    allowed = {value.strip().rstrip("/") for value in os.environ.get("CORS_ORIGINS", os.environ.get("APP_URL", "http://localhost:3000")).split(",")}
    allowed.add(str(request.base_url).rstrip("/"))
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path.startswith("/api/") and origin and origin.rstrip("/") not in allowed:
        return JSONResponse({"detail": "This request came from an unauthorized origin."}, status_code=403)
    try:
        response = await call_next(request)
    except (httpx.HTTPError, PyMongoError):
        logger.exception("Upstream service unavailable")
        response = JSONResponse({"detail": "A required service is temporarily unavailable. Please try again."}, status_code=503)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith(("/api/", "/mcp")):
        response.headers["Cache-Control"] = "no-store"
    return response


async def health():
    configured = {
        "accounts": bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_PUBLISHABLE_KEY")),
        "storage": bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SECRET_KEY")),
        "ai": bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")),
    }
    try:
        await db.command("ping")
        configured["database"] = True
    except (PyMongoError, httpx.HTTPError, HTTPException):
        configured["database"] = False
    return {"status": "ready" if all(configured.values()) else "setup_required", "services": configured}

# Production serves the API and frontend from one origin.
app.add_api_route("/api/health", health, methods=["GET"])


@app.get("/api/ready")
async def readiness():
    result = await health()
    return JSONResponse(result, status_code=200 if result["status"] == "ready" else 503)


class SPAFiles(StaticFiles):
    async def get_response(self, path, scope):
        from starlette.exceptions import HTTPException as StarletteHTTPException
        path = path.replace("\\", "/")
        if path.startswith(("api/", "mcp/")):
            raise StarletteHTTPException(status_code=404)
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            if error.status_code != 404 or Path(path).suffix:
                raise
            return await super().get_response("index.html", scope)


frontend_dist = ROOT_DIR.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", SPAFiles(directory=frontend_dist, html=True), name="website")
