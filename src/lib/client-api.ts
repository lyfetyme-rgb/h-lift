"use client";

/**
 * Browser-side API client for H-LIFT Route Handlers.
 *
 * Identity is carried by same-origin cookies (lab: `hlift_subject`; signed
 * deployments: the IdP-set `hlift_assertion`), so the browser sends it
 * automatically. Client code must not try to read or forge the assertion — an
 * HttpOnly assertion cookie is invisible to JavaScript by design.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly decision: unknown;
  readonly payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    const reason =
      payload.decision && typeof payload.decision === "object" && "reason_code" in payload.decision
        ? ` (${String((payload.decision as { reason_code: unknown }).reason_code)})`
        : "";
    const detail = payload.detail ?? payload.error ?? `HTTP ${status}`;
    super(`${String(detail)}${reason}`);
    this.name = "ApiError";
    this.status = status;
    this.decision = payload.decision;
    this.payload = payload;
  }
}

function jsonHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

/** Fetch an H-LIFT API route, throwing a consistent error on non-2xx. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    headers: jsonHeaders(init),
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload);
  }
  return res;
}

/** Fetch and decode a JSON API response. */
export async function apiJson<T = unknown>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  return (await res.json()) as T;
}

/** POST a JSON body and decode the JSON response. */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, { method: "POST", body: JSON.stringify(body) });
}
