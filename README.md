# Skipti AI

A private context workspace with Supabase accounts, MongoDB canonical memory, private Supabase files, Gemini chat, temporary Persona Passes, and authenticated MCP tools. React, TypeScript, Vite, and FastAPI serve the UI and API from one origin in production.

## Start locally

1. Install Python 3.12, Node 24, pnpm, and MongoDB (or use Docker).
2. Copy `backend/.env.example` to `backend/.env`. Fill in the Supabase URL, publishable key, backend secret key, a random SESSION_SECRET, and Gemini API key. Never put backend secrets in frontend variables. Start MongoDB.
3. Run `python -m venv .venv` and install `backend/requirements.txt` in that environment.
4. In `frontend`, run `pnpm install --frozen-lockfile` and `pnpm dev`.
5. In `backend`, run the virtual environment's `python -m uvicorn server:app --host 127.0.0.1 --port 8001`.
6. Open http://localhost:3000. `/api/health` reports configured services and database reachability. Missing services show setup/error states; they are never replaced with demo accounts or simulated AI.

For the original Emergent provider, install `backend/requirements-emergent.txt` and set EMERGENT_LLM_KEY instead of GEMINI_API_KEY. GEMINI_MODEL is configurable.

## Supabase setup

Enable email/password authentication. Set the Site URL to APP_URL and allow both `APP_URL/auth/callback` and `APP_URL/reset-password` under redirect URLs. Keep email confirmation enabled if appropriate for your deployment. Account confirmation and recovery use Supabase's standard implicit email redirects; custom PKCE email templates need a separate exchange flow.

Create a **private** Storage bucket named `project-files`. Backend storage requests use SUPABASE_SECRET_KEY. Authenticated object policies, if client access is enabled, must restrict the first folder to the verified user's ID. The backend validates project ownership before upload, deletion, or generating a short-lived download URL.

Application records and share credentials use the MongoDB database. Owner IDs come exclusively from verified Supabase users. Display metadata is never used for authorization. External AI links read the same current canonical records as guest chat, so edits, deletion, permission changes, expiry, and revocation take effect immediately. Legacy PostgreSQL migrations and the optional old snapshot adapter are retained for reference but are no longer required by the application.

## Build and deploy

For Render, connect this repository and use the included `render.yaml` Blueprint (Docker web service, free plan). Supply the Supabase publishable/secret keys and Gemini key through Render's environment settings. Set `APP_URL` and `CORS_ORIGINS` to the assigned HTTPS website URL, then add that origin's `/auth/callback` and `/reset-password` URLs in Supabase Auth. `/api/ready` returns HTTP 503 until all service settings and database connectivity are ready; `/api/health` remains available for diagnosis.

For a Supabase-only database deployment, apply `supabase/production-setup.sql` to the selected Skipti project and set `DATABASE_BACKEND=supabase` in `backend/.env`. This stores application records in PostgreSQL through a backend-only RPC; no MongoDB service is required. Configure Supabase Auth and the private `project-files` bucket as above. Run `docker compose -f compose.supabase.yaml up --build` on a Docker-capable host, with HTTPS forwarding to port 3000. The health check requires database, account, storage, and AI configuration to report ready.

The Python API must be deployed with the frontend. The existing Sites manifest packages static files only; publishing that package alone does not provide `/api` or `/mcp`. Supabase manages the database, accounts, and files; its TypeScript Edge Functions cannot directly run this FastAPI application.

Run `pnpm build` in `frontend`. FastAPI serves `frontend/dist`, including direct navigation to workspace routes. A reverse proxy must terminate HTTPS and forward `/api`, `/mcp`, and the website to port 8001.

Alternatively, after configuring `backend/.env`, run `docker compose up --build`. MongoDB data uses a persistent volume. MongoDB is not published to the host. For production, set APP_URL and CORS_ORIGINS to the exact HTTPS origin and COOKIE_SECURE=true. Configure Supabase redirect allowlists for that origin. Back up the MongoDB volume and use your production hosting provider's secret management.

## Verification

- Frontend: `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- Backend: install `backend/requirements-test.txt`, then run `python -m pytest` from `backend`. Regression tests use an isolated in-memory Mongo adapter and mocked upstream identities; no production data is changed.
- Browser: run `python -m tests.browser_server` from `backend` for a loopback-only disposable test service at port 8002. Start Vite with API_PROXY_TARGET=http://127.0.0.1:8002 on port 3002. Test desktop and mobile flows there; accounts, storage adapters, and AI responses are simulated. Never deploy this test service. This does not prove live Supabase email delivery, storage configuration, or real Gemini credentials.

## Features

- Accounts, confirmation, recovery, secure cookie sessions, cache isolation, and logout.
- Six-question Persona interview with review before approval. When AI is unavailable, exact answers remain reviewable candidates.
- Persona creation, editing, candidate approval, deletion, sensitive context exclusion, and sanitized Markdown export.
- Project creation, editing, status, canonical state, progress proposal approval/rejection, immutable checkpoints, and restore.
- Folder imports up to 50 MB and 500 files: private originals or UTF-8 text/code context. Full-batch validation and rollback prevent partial imports. Imported context is capped at 20,000 characters per file.
- Context retrieval traces, configurable Gemini provider, temporary permission-scoped guest chat, absolute share/QR links, expiration, and revocation.
- Account-scoped MCP bearer tokens and tools at `/mcp/`.
- Mobile navigation, help/privacy information, empty/error/loading states, and an application error boundary.
