import base64
import hashlib
import io
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import qrcode
import qrcode.image.svg
from fastapi import HTTPException
from pymongo import ReturnDocument

from lib.db import db
from models.skipti import (
    ContextSearchResponse,
    ContextSelection,
    GuestChatMessage,
    PersonaEntry,
    ProgressProposal,
    Project,
    ProjectCheckpoint,
    ShareGrant,
    utc_now,
)
from services.ai import answer_with_context, extract_progress


def hash_token(token: str) -> str:
    secret = os.environ.get("SESSION_SECRET", "")
    return hashlib.sha256(f"{secret}:{token}".encode()).hexdigest()


def normalize_document(document: dict[str, Any]) -> dict[str, Any]:
    document.pop("_id", None)
    for key, value in list(document.items()):
        if isinstance(value, datetime) and value.tzinfo is None:
            document[key] = value.replace(tzinfo=timezone.utc)
    return document


async def get_persona_entries(owner_id: str, approved_only: bool = True) -> list[PersonaEntry]:
    query: dict[str, Any] = {"owner_id": owner_id}
    if approved_only:
        query["approval_status"] = "approved"
    docs = await db.persona_entries.find(query).sort("updated_at", -1).to_list(500)
    return [PersonaEntry(**normalize_document(doc)) for doc in docs]


async def get_project(owner_id: str, project_id: str) -> Project:
    doc = await db.projects.find_one({"id": project_id, "owner_id": owner_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project Holder not found")
    return Project(**normalize_document(doc))


def _tokens(text: str) -> set[str]:
    return {word.strip(".,!?()[]{}:;\"'").lower() for word in text.split() if len(word) > 2}


def context_relevance_score(category: str, label: str, value: str, query: str) -> int:
    query_tokens = _tokens(query)
    haystack = _tokens(f"{category} {label} {value}")
    overlap = len(query_tokens & haystack)
    return overlap * 5 + (2 if category.lower() in query.lower() else 0)


def rank_external_entries(entries: list[dict[str, Any]], query: str, max_entries: int = 10) -> list[dict[str, Any]]:
    ranked: list[tuple[int, dict[str, Any]]] = []
    seen: set[tuple[str, str]] = set()
    for entry in entries:
        dedupe_key = (str(entry["category"]).strip().lower(), str(entry["value"]).strip().lower())
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        score = context_relevance_score(str(entry["category"]), str(entry["label"]), str(entry["value"]), query)
        if score > 0:
            ranked.append((score, entry))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in ranked[:max_entries]]


def _persona_entry_allowed(entry: PersonaEntry, permissions: set[str]) -> bool:
    if "general_profile" in permissions:
        return True
    category = entry.category.lower()
    return (
        ("goals" in permissions and (entry.entry_type == "goal" or "goal" in category))
        or ("skills" in permissions and ("skill" in category or "technical" in category))
        or ("ai_preferences" in permissions and (entry.entry_type == "preference" or "preference" in category or "response style" in category))
    )


async def get_permitted_persona_entries(owner_id: str, permissions: set[str]) -> list[PersonaEntry]:
    entries = await get_persona_entries(owner_id)
    return [entry for entry in entries if entry.sensitivity != "sensitive" and entry.scope != "project" and _persona_entry_allowed(entry, permissions)]


async def search_context(
    owner_id: str,
    query: str,
    project_id: str | None,
    max_entries: int,
    permissions: set[str] | None = None,
) -> ContextSearchResponse:
    query_tokens = _tokens(query)
    persona_entries = await get_persona_entries(owner_id) if permissions is None else await get_permitted_persona_entries(owner_id, permissions)
    candidates: list[tuple[int, ContextSelection]] = []
    for entry in persona_entries:
        if entry.sensitivity == "sensitive" or entry.scope == "project":
            continue
        overlap = len(query_tokens & _tokens(f"{entry.category} {entry.label} {entry.value}"))
        score = context_relevance_score(entry.category, entry.label, entry.value, query)
        candidates.append(
            (
                score,
                ContextSelection(
                    id=entry.id,
                    category=entry.category,
                    label=entry.label,
                    value=entry.value,
                    source=entry.source,
                    reason=f"Matched {overlap} query term{'s' if overlap != 1 else ''}" if overlap else "Approved global context",
                ),
            )
        )
    project_revision: int | None = None
    if project_id:
        project = await get_project(owner_id, project_id)
        project_revision = project.revision
        project_fields: dict[str, str] = {}
        if permissions is None or "project" in permissions:
            project_fields.update({"Project overview": project.description, "Technical stack": ", ".join(project.stack)})
        if permissions is None or "project_progress" in permissions:
            project_fields.update({
                "Completed": "; ".join(project.completed),
                "In progress": "; ".join(project.in_progress),
                "Blockers": "; ".join(project.blockers),
                "Decisions": "; ".join(project.decisions),
                "Next steps": "; ".join(project.next_steps),
            })
        if permissions is None or "project" in permissions:
            file_context_docs = await db.project_context_entries.find(
                {"owner_id": owner_id, "project_id": project_id, "approval_status": "approved"}
            ).sort("updated_at", -1).to_list(100)
            for raw in file_context_docs:
                entry = PersonaEntry(**normalize_document(raw))
                if entry.sensitivity == "sensitive":
                    continue
                overlap = len(query_tokens & _tokens(f"{entry.label} {entry.value}"))
                candidates.append((
                    overlap * 5 + 3,
                    ContextSelection(
                        id=entry.id,
                        category="Project files",
                        label=entry.label,
                        value=entry.value,
                        source=entry.source,
                        reason="Imported project folder context",
                        project_id=project.id,
                    ),
                ))
        for label, value in project_fields.items():
            if not value:
                continue
            overlap = len(query_tokens & _tokens(f"{label} {value}"))
            candidates.append(
                (
                    overlap * 5 + 4,
                    ContextSelection(
                        id=f"project-{project.id}-{label.lower().replace(' ', '-')}",
                        category="Project",
                        label=label,
                        value=value,
                        source="canonical_project_state",
                        reason="Active Project Holder context",
                        project_id=project.id,
                    ),
                )
            )
    candidates.sort(key=lambda item: item[0], reverse=True)
    relevant = [item for item in candidates if item[0] > 0]
    selected = [item[1] for item in relevant[:max_entries]]
    total_chars = sum(len(item.value) + len(item.label) for item in selected)
    await db.context_access_logs.insert_one(
        {
            "id": str(uuid4()),
            "owner_id": owner_id,
            "project_id": project_id,
            "selected_ids": [item.id for item in selected],
            "query_hash": hashlib.sha256(query.encode()).hexdigest(),
            "created_at": utc_now(),
        }
    )
    return ContextSearchResponse(
        query=query,
        selected=selected,
        available_count=len(candidates),
        excluded_count=max(0, len(candidates) - len(selected)),
        approximate_tokens=(total_chars + 3) // 4,
        project_revision=project_revision,
    )


async def create_progress_proposal(owner_id: str, project_id: str, update_text: str, expected_revision: int, source_provider: str) -> ProgressProposal:
    project = await get_project(owner_id, project_id)
    if project.revision != expected_revision:
        raise HTTPException(status_code=409, detail={"message": "Project revision changed", "current_revision": project.revision})
    try:
        structured = await extract_progress(update_text, project.name)
    except Exception:
        structured = {
            "summary": update_text[:180],
            "completed": [],
            "in_progress": [update_text],
            "blockers": [],
            "decisions": [],
            "next_steps": [],
        }
    proposal = ProgressProposal(
        project_id=project_id,
        owner_id=owner_id,
        base_revision=expected_revision,
        source_provider=source_provider,
        **structured,
    )
    await db.project_update_proposals.insert_one(proposal.model_dump())
    return proposal


async def approve_progress_proposal(owner_id: str, project_id: str, proposal_id: str, expected_revision: int) -> ProjectCheckpoint:
    proposal_doc = await db.project_update_proposals.find_one({"id": proposal_id, "project_id": project_id, "owner_id": owner_id})
    if not proposal_doc:
        raise HTTPException(status_code=404, detail="Progress proposal not found")
    proposal = ProgressProposal(**normalize_document(proposal_doc))
    if proposal.status != "pending_approval":
        raise HTTPException(status_code=409, detail="Progress proposal is no longer pending")
    if proposal.base_revision != expected_revision:
        await db.project_update_proposals.update_one({"id": proposal_id}, {"$set": {"status": "conflict"}})
        raise HTTPException(status_code=409, detail="Proposal is based on a stale project revision")
    updated = await db.projects.find_one_and_update(
        {"id": project_id, "owner_id": owner_id, "revision": expected_revision},
        {
            "$set": {"updated_at": utc_now()},
            "$inc": {"revision": 1},
            "$addToSet": {
                "completed": {"$each": proposal.completed},
                "in_progress": {"$each": proposal.in_progress},
                "blockers": {"$each": proposal.blockers},
                "decisions": {"$each": proposal.decisions},
                "next_steps": {"$each": proposal.next_steps},
            },
        },
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        await db.project_update_proposals.update_one({"id": proposal_id}, {"$set": {"status": "conflict"}})
        raise HTTPException(status_code=409, detail="Another update changed this Project Holder")
    project = Project(**normalize_document(updated))
    checkpoint = ProjectCheckpoint(
        project_id=project_id,
        owner_id=owner_id,
        revision=project.revision,
        summary=proposal.summary,
        state=project.model_dump(mode="json"),
        source=proposal.source_provider,
    )
    await db.project_checkpoints.insert_one(checkpoint.model_dump())
    await db.project_update_proposals.update_one(
        {"id": proposal_id},
        {"$set": {"status": "approved", "verification_status": "user_confirmed"}},
    )
    return checkpoint


async def restore_checkpoint(owner_id: str, project_id: str, revision: int, expected_revision: int) -> ProjectCheckpoint:
    checkpoint_doc = await db.project_checkpoints.find_one({"project_id": project_id, "owner_id": owner_id, "revision": revision})
    if not checkpoint_doc:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    state = checkpoint_doc["state"]
    new_revision = expected_revision + 1
    restored_fields = {key: state.get(key, []) for key in ("name", "description", "purpose", "stack", "status", "completed", "in_progress", "blockers", "decisions", "next_steps") if key in state}
    updated = await db.projects.find_one_and_update(
        {"id": project_id, "owner_id": owner_id, "revision": expected_revision},
        {"$set": {**restored_fields, "revision": new_revision, "updated_at": utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=409, detail="Project revision changed before restore")
    project = Project(**normalize_document(updated))
    restored = ProjectCheckpoint(
        project_id=project_id,
        owner_id=owner_id,
        revision=new_revision,
        summary=f"Restored revision {revision} as a new checkpoint",
        state=project.model_dump(mode="json"),
        source="owner_restore",
    )
    await db.project_checkpoints.insert_one(restored.model_dump())
    return restored


async def ask_gemini(owner_id: str, query: str, project_id: str | None, max_entries: int, session_id: str | None) -> tuple[str, ContextSearchResponse]:
    retrieval = await search_context(owner_id, query, project_id, max_entries)
    context = [item.model_dump() for item in retrieval.selected]
    answer = await answer_with_context(query, context, f"owner-{owner_id}-{session_id or uuid4()}")
    return answer, retrieval


async def create_share(
    owner_id: str,
    project_id: str | None,
    permissions: list[str],
    duration_minutes: int,
    retain_chat_until_expiry: bool,
) -> tuple[ShareGrant, str, str]:
    if project_id:
        await get_project(owner_id, project_id)
    allowed = {"general_profile", "goals", "skills", "ai_preferences", "project", "project_progress"}
    sanitized = sorted(set(permissions) & allowed)
    if not project_id:
        sanitized = [item for item in sanitized if item not in {"project", "project_progress"}]
    if not sanitized:
        raise HTTPException(status_code=422, detail="Choose at least one valid permission")
    token = secrets.token_urlsafe(32)
    grant_id = str(uuid4())
    expires_at = utc_now() + timedelta(minutes=duration_minutes)
    document = {
        "id": grant_id,
        "owner_id": owner_id,
        "project_id": project_id,
        "permissions": sanitized,
        "redeem_hash": hash_token(token),
        "expires_at": expires_at,
        "revoked_at": None,
        "redeemed_at": None,
        "retain_chat_until_expiry": retain_chat_until_expiry,
        "created_at": utc_now(),
    }
    await db.temporary_grants.insert_one(document)
    url = f"{os.environ.get('APP_URL', 'http://localhost:3000').rstrip('/')}/connect/{token}"
    qr = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=2)
    output = io.BytesIO()
    qr.save(output)
    data_uri = "data:image/svg+xml;base64," + base64.b64encode(output.getvalue()).decode()
    grant = ShareGrant(
        id=grant_id,
        project_id=project_id,
        permissions=sanitized,
        expires_at=expires_at,
        status="ready",
        retain_chat_until_expiry=retain_chat_until_expiry,
    )
    return grant, token, data_uri


async def redeem_share(token: str) -> tuple[str, ShareGrant]:
    now = utc_now()
    document = await db.temporary_grants.find_one_and_update(
        {"redeem_hash": hash_token(token), "expires_at": {"$gt": now}, "revoked_at": None, "redeemed_at": None},
        {"$set": {"redeemed_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not document:
        raise HTTPException(status_code=410, detail="This Persona Pass is invalid, expired, revoked, or already redeemed")
    raw_session = secrets.token_urlsafe(32)
    await db.guest_sessions.insert_one(
        {
            "id": str(uuid4()),
            "grant_id": document["id"],
            "owner_id": document["owner_id"],
            "session_hash": hash_token(raw_session),
            "expires_at": document["expires_at"],
            "revoked_at": None,
            "created_at": now,
        }
    )
    grant = ShareGrant(
        id=document["id"],
        project_id=document.get("project_id"),
        permissions=document["permissions"],
        expires_at=document["expires_at"],
        redeemed_at=document["redeemed_at"],
        status="active",
        retain_chat_until_expiry=document.get("retain_chat_until_expiry", False),
    )
    return raw_session, grant


async def resolve_guest_session(token: str | None) -> dict[str, Any] | None:
    resolved, status = await get_guest_session_state(token)
    return resolved if status == "active" else None


async def get_guest_session_state(token: str | None) -> tuple[dict[str, Any] | None, str]:
    if not token:
        return None, "invalid"
    now = utc_now()
    session = await db.guest_sessions.find_one({"session_hash": hash_token(token)})
    if not session:
        return None, "invalid"
    grant = await db.temporary_grants.find_one({"id": session["grant_id"]})
    if not grant:
        return None, "invalid"
    session = normalize_document(session)
    grant = normalize_document(grant)
    if session.get("revoked_at") or grant.get("revoked_at"):
        return {"session": session, "grant": grant}, "revoked"
    if session["expires_at"] <= now or grant["expires_at"] <= now:
        return {"session": session, "grant": grant}, "expired"
    return {"session": session, "grant": grant}, "active"


def guest_status_error(status: str) -> HTTPException:
    messages = {
        "revoked": "The Persona Holder has ended this session.",
        "expired": "This Skipti session has expired.",
        "invalid": "This Skipti connection is invalid.",
    }
    return HTTPException(status_code=401, detail={"code": status, "message": messages.get(status, messages["invalid"])})


async def ask_guest_gemini(token: str | None, message: str) -> tuple[str, ContextSearchResponse, GuestChatMessage, int]:
    resolved, status = await get_guest_session_state(token)
    if not resolved or status != "active":
        raise guest_status_error(status)
    session = resolved["session"]
    grant = resolved["grant"]
    now = utc_now()
    recent_count = await db.guest_chat_messages.count_documents(
        {"session_id": session["id"], "role": "user", "created_at": {"$gt": now - timedelta(minutes=1)}}
    )
    total_count = await db.guest_chat_messages.count_documents({"session_id": session["id"], "role": "user"})
    if recent_count >= 8 or total_count >= 60:
        raise HTTPException(status_code=429, detail="This temporary session has reached its chat limit. Please wait or create a new pass.")
    permissions = set(grant["permissions"])
    retrieval = await search_context(
        grant["owner_id"],
        message,
        grant.get("project_id"),
        7,
        permissions=permissions,
    )
    history_docs = await db.guest_chat_messages.find({"session_id": session["id"]}).sort("created_at", -1).to_list(12)
    history = [
        {"role": doc["role"], "content": doc["content"]}
        for doc in reversed(history_docs)
    ]
    answer = await answer_with_context(
        message,
        [item.model_dump() for item in retrieval.selected],
        session_id=f"guest-{session['id']}",
        history=history,
        temporary_guest=True,
    )
    # Revalidate after the model call so a revocation during generation cannot release new protected output.
    _, final_status = await get_guest_session_state(token)
    if final_status != "active":
        raise guest_status_error(final_status)
    user_doc = {
        "id": str(uuid4()), "grant_id": grant["id"], "session_id": session["id"],
        "role": "user", "content": message, "created_at": now, "expires_at": grant["expires_at"],
    }
    assistant_doc = {
        "id": str(uuid4()), "grant_id": grant["id"], "session_id": session["id"],
        "role": "assistant", "content": answer, "created_at": utc_now(), "expires_at": grant["expires_at"],
        "selected_context_ids": [item.id for item in retrieval.selected],
    }
    await db.guest_chat_messages.insert_many([user_doc, assistant_doc])
    remaining = max(0, int((grant["expires_at"] - utc_now()).total_seconds()))
    return answer, retrieval, GuestChatMessage(**assistant_doc), remaining


async def end_guest_session(token: str | None) -> bool:
    resolved, status = await get_guest_session_state(token)
    if not resolved:
        return False
    session = resolved["session"]
    grant = resolved["grant"]
    await db.guest_sessions.update_one(
        {"id": session["id"]}, {"$set": {"revoked_at": utc_now(), "ended_by_guest_at": utc_now()}}
    )
    if not grant.get("retain_chat_until_expiry", False):
        await db.guest_chat_messages.delete_many({"session_id": session["id"]})
    return status == "active"


async def revoke_share(owner_id: str, grant_id: str) -> bool:
    grant = await db.temporary_grants.find_one({"id": grant_id, "owner_id": owner_id})
    if not grant:
        return False
    now = utc_now()
    await db.temporary_grants.update_one({"id": grant_id, "owner_id": owner_id}, {"$set": {"revoked_at": now}})
    await db.guest_sessions.update_many({"grant_id": grant_id}, {"$set": {"revoked_at": now}})
    if not grant.get("retain_chat_until_expiry", False):
        await db.guest_chat_messages.delete_many({"grant_id": grant_id})
    return True


async def share_view(document: dict[str, Any]) -> ShareGrant:
    now = utc_now()
    status = "revoked" if document.get("revoked_at") else "expired" if document["expires_at"].replace(tzinfo=timezone.utc) <= now else "active" if document.get("redeemed_at") else "ready"
    return ShareGrant(
        id=document["id"],
        project_id=document.get("project_id"),
        permissions=document["permissions"],
        expires_at=document["expires_at"],
        revoked_at=document.get("revoked_at"),
        redeemed_at=document.get("redeemed_at"),
        status=status,
        retain_chat_until_expiry=document.get("retain_chat_until_expiry", False),
    )