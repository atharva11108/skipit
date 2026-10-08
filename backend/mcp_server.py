import os
from urllib.parse import urlparse
from typing import Any

from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from lib.db import db
from models.skipti import PersonaEntry, utc_now
from services.skipti import (
    approve_progress_proposal,
    create_progress_proposal,
    get_persona_entries,
    get_project,
    normalize_document,
    restore_checkpoint,
    revoke_share,
    search_context as search_context_service,
    hash_token,
)


class AccountTokenVerifier(TokenVerifier):
    async def verify_token(self, token: str) -> AccessToken | None:
        document = await db.mcp_tokens.find_one({"token_hash": hash_token(token), "revoked_at": None})
        if not document:
            return None
        return AccessToken(token=token, client_id=document["owner_id"], scopes=["skipti:read", "skipti:write"])


def _owner_id() -> str:
    access = get_access_token()
    if not access or not access.client_id:
        raise ValueError("Authenticated MCP account required")
    return access.client_id


app_url = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
mcp = FastMCP(
    "Skipti MCP",
    instructions="Authorized access to the connected account's approved Persona and canonical Project Holder memory.",
    streamable_http_path="/",
    stateless_http=True,
    json_response=True,
    token_verifier=AccountTokenVerifier(),
    auth=AuthSettings(issuer_url=app_url, resource_server_url=f"{app_url}/mcp", required_scopes=["skipti:read"]),
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[urlparse(app_url).netloc, "localhost:*", "127.0.0.1:*"],
        allowed_origins=[app_url, "http://localhost:3000"],
    ),
)


def clean(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [clean(item) for item in value]
    return value


@mcp.tool(description="Return a concise authorized overview of the connected account's approved Base Persona.")
async def get_persona_summary() -> dict[str, Any]:
    entries = [entry for entry in await get_persona_entries(_owner_id()) if entry.sensitivity != "sensitive" and entry.scope != "project"]
    meta = await db.personas.find_one({"owner_id": _owner_id()}) or {"revision": 0}
    return {"revision": meta.get("revision", 0), "entries": clean(entries[:12]), "entry_count": len(entries)}


@mcp.tool(description="Search minimum relevant approved context, optionally scoped to one Project Holder.")
async def search_context(query: str, project_id: str | None = None, max_entries: int = 6) -> dict[str, Any]:
    result = await search_context_service(_owner_id(), query, project_id, max(1, min(max_entries, 20)))
    return clean(result)


@mcp.tool(description="List categories available to this authorized MCP caller.")
async def get_context_categories() -> dict[str, Any]:
    entries = [entry for entry in await get_persona_entries(_owner_id()) if entry.sensitivity != "sensitive" and entry.scope != "project"]
    return {"categories": sorted({entry.category for entry in entries})}


@mcp.tool(description="Retrieve one approved context entry by its Skipti identifier.")
async def get_context_entry(entry_id: str) -> dict[str, Any]:
    doc = await db.persona_entries.find_one({"id": entry_id, "owner_id": _owner_id(), "approval_status": "approved", "sensitivity": {"$ne": "sensitive"}, "scope": {"$ne": "project"}})
    if not doc:
        return {"error": "not_found"}
    return clean(PersonaEntry(**normalize_document(doc)))


@mcp.tool(description="Create a candidate Persona change. This never changes canonical context without confirmation.")
async def propose_context_update(category: str, label: str, value: str, entry_type: str = "fact") -> dict[str, Any]:
    safe_type = entry_type if entry_type in {"fact", "preference", "constraint", "goal"} else "fact"
    entry = PersonaEntry(owner_id=_owner_id(), category=category[:60], label=label[:100], value=value[:2000], entry_type=safe_type, approval_status="candidate", source="mcp")
    await db.persona_entries.insert_one(entry.model_dump())
    return clean(entry)


@mcp.tool(description="Confirm a candidate Persona update using owner-authorized MCP access.")
async def confirm_context_update(entry_id: str) -> dict[str, Any]:
    doc = await db.persona_entries.find_one_and_update({"id": entry_id, "owner_id": _owner_id(), "approval_status": "candidate"}, {"$set": {"approval_status": "approved", "updated_at": utc_now()}}, return_document=True)
    if not doc:
        return {"error": "candidate_not_found"}
    await db.personas.update_one({"owner_id": _owner_id()}, {"$inc": {"revision": 1}}, upsert=True)
    return clean(PersonaEntry(**normalize_document(doc)))


@mcp.tool(description="Return current Base Persona revision metadata.")
async def get_persona_version() -> dict[str, Any]:
    meta = await db.personas.find_one({"owner_id": _owner_id()}) or {"revision": 0}
    return {"revision": meta.get("revision", 0), "updated_at": str(meta.get("updated_at", ""))}


@mcp.tool(description="List Project Holders visible to the authorized owner.")
async def list_project_holders() -> list[dict[str, Any]]:
    docs = await db.projects.find({"owner_id": _owner_id()}).sort("updated_at", -1).to_list(100)
    return [normalize_document(doc) for doc in docs]


@mcp.tool(description="Return compact approved context for one Project Holder.")
async def get_project_context(project_id: str) -> dict[str, Any]:
    project = await get_project(_owner_id(), project_id)
    retrieval = await search_context_service(_owner_id(), project.description, project_id, 10)
    return {"project": clean(project), "selected_context": clean(retrieval.selected)}


@mcp.tool(description="Return canonical progress, decisions, blockers, next steps, and revision for a Project Holder.")
async def get_project_progress(project_id: str) -> dict[str, Any]:
    project = await get_project(_owner_id(), project_id)
    return {key: clean(getattr(project, key)) for key in ("id", "name", "revision", "completed", "in_progress", "blockers", "decisions", "next_steps")}


@mcp.tool(description="Submit a structured progress proposal without overwriting canonical project memory.")
async def propose_project_update(project_id: str, update_text: str, expected_revision: int) -> dict[str, Any]:
    proposal = await create_progress_proposal(_owner_id(), project_id, update_text, expected_revision, "mcp_client")
    return clean(proposal)


@mcp.tool(description="Read a pending project update proposal for authorized review.")
async def get_project_update_proposal(proposal_id: str) -> dict[str, Any]:
    doc = await db.project_update_proposals.find_one({"id": proposal_id, "owner_id": _owner_id()})
    return normalize_document(doc) if doc else {"error": "not_found"}


@mcp.tool(description="Approve a project update with optimistic revision protection.")
async def approve_project_update(project_id: str, proposal_id: str, expected_revision: int) -> dict[str, Any]:
    return clean(await approve_progress_proposal(_owner_id(), project_id, proposal_id, expected_revision))


@mcp.tool(description="List immutable checkpoint history for a Project Holder.")
async def get_project_history(project_id: str) -> list[dict[str, Any]]:
    await get_project(_owner_id(), project_id)
    docs = await db.project_checkpoints.find({"project_id": project_id, "owner_id": _owner_id()}).sort("revision", -1).to_list(100)
    return [normalize_document(doc) for doc in docs]


@mcp.tool(description="Return one authorized immutable project checkpoint.")
async def get_project_checkpoint(project_id: str, revision: int) -> dict[str, Any]:
    doc = await db.project_checkpoints.find_one({"project_id": project_id, "owner_id": _owner_id(), "revision": revision})
    return normalize_document(doc) if doc else {"error": "not_found"}


@mcp.tool(description="Restore a previous project state as a new revision after explicit owner authorization.")
async def restore_project_version(project_id: str, revision: int, expected_revision: int) -> dict[str, Any]:
    return clean(await restore_checkpoint(_owner_id(), project_id, revision, expected_revision))


@mcp.tool(description="Return a compact handoff package for cross-client project continuity.")
async def get_handoff_context(project_id: str, query: str = "Continue the current project") -> dict[str, Any]:
    project = await get_project(_owner_id(), project_id)
    retrieval = await search_context_service(_owner_id(), query, project_id, 10)
    return {"project": project.name, "revision": project.revision, "context": clean(retrieval.selected), "freshness": project.updated_at.isoformat()}


@mcp.tool(description="Export approved Persona or project context as a Markdown snapshot.")
async def get_context_export(project_id: str | None = None) -> dict[str, Any]:
    if project_id:
        project = await get_project(_owner_id(), project_id)
        markdown = f"# PROJECT: {project.name}\n\n## Overview\n{project.description}\n\n## Stack\n{', '.join(project.stack)}\n\n## Revision\n{project.revision}"
        return {"markdown": markdown, "revision": project.revision}
    entries = [entry for entry in await get_persona_entries(_owner_id()) if entry.sensitivity != "sensitive" and entry.scope != "project"]
    return {"markdown": "# SKIPTI BASE PERSONA\n\n" + "\n".join(f"- **{entry.label}:** {entry.value}" for entry in entries if entry.sensitivity != "sensitive")}


@mcp.tool(description="Check current owner-authorized MCP session capabilities.")
async def get_session_status() -> dict[str, Any]:
    return {"authorized": True, "mode": "account_bearer", "scopes": ["skipti:read", "skipti:write"]}


@mcp.tool(description="Revoke a temporary Persona Pass by identifier.")
async def revoke_session(grant_id: str) -> dict[str, Any]:
    return {"revoked": await revoke_share(_owner_id(), grant_id), "grant_id": grant_id}


mcp_app = mcp.streamable_http_app()