// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.
const BASE = "/api";

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(errorDetail(body) ?? (status === 401 ? "Please sign in to continue." : status === 503 ? "This service is temporarily unavailable. Please try again." : `The request could not be completed (${status}).`));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function errorDetail(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("detail" in body)) return;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => `${item.loc?.at(-1) ?? "Input"}: ${item.msg ?? "Invalid value"}`).join(". ");
  if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

async function send(path: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, { ...options, credentials: "same-origin", signal: AbortSignal.timeout(120_000) });
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === "TimeoutError" ? "This request took too long. Please try again." : "Could not reach Skipti. Check your connection and try again.");
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  // Auth rides the httpOnly session cookie automatically — never add auth headers here.
  const res = await send(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);

export async function apiUpload<T>(path: string, body: FormData): Promise<T> {
  const res = await send(path, { method: "POST", body });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }
  return (await res.json()) as T;
}
