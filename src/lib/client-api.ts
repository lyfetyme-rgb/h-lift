"use client";

/**
 * Browser-side API client for H-LIFT Route Handlers.
 *
 * Identity is carried by same-origin cookies (lab: `hlift_subject`; signed
 * deployments: the IdP-set `hlift_assertion`), so the browser sends it
 * automatically. Client code must not try to read or forge the assertion — an
 * HttpOnly assertion cookie is invisible to JavaScript by design.
 *
 * Resilience contract:
 *  - every request has a bounded timeout, so a hung server cannot pin a tab;
 *  - only idempotent methods (GET/HEAD/OPTIONS) are retried — POSTs are never
 *    replayed, because a retried approval/decision could apply twice;
 *  - each attempt carries an X-Request-ID so a failure can be traced to the
 *    server log for that exact request;
 *  - offline, timeout and permission failures get explicit, actionable errors
 *    instead of a blank panel.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class ApiError extends Error {
  readonly status: number;
  readonly decision: unknown;
  readonly payload: Record<string, unknown>;
  readonly code: string;

  constructor(status: number, payload: Record<string, unknown>) {
    const reason =
      payload.decision && typeof payload.decision === "object" && "reason_code" in payload.decision
        ? ` (${String((payload.decision as { reason_code: unknown }).reason_code)})`
        : "";
    const fallback =
      status === 401
        ? "Your session has expired. Re-authenticate to continue."
        : status === 403
          ? "You do not have permission to perform this action."
          : `HTTP ${status}`;
    const detail = payload.detail ?? payload.error ?? fallback;
    super(`${String(detail)}${reason}`);
    this.name = "ApiError";
    this.status = status;
    this.decision = payload.decision;
    this.payload = payload;
    this.code = typeof payload.code === "string" ? payload.code : `HTTP_${status}`;
  }
}

export type NetworkErrorCode = "OFFLINE" | "TIMEOUT" | "ABORTED" | "NETWORK";

/** A transport-level failure: no usable HTTP response was received. */
export class NetworkError extends Error {
  readonly code: NetworkErrorCode;

  constructor(code: NetworkErrorCode, message: string) {
    super(message);
    this.name = "NetworkError";
    this.code = code;
  }
}

function requestId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function jsonHeaders(init: RequestInit, trace: string): Headers {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("X-Request-ID")) headers.set("X-Request-ID", trace);
  return headers;
}

/** One fetch attempt with a bounded timeout and cooperation with caller aborts. */
async function attemptFetch(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const external = init.signal;
  const forwardAbort = () => controller.abort(external?.reason);
  if (external?.aborted) forwardAbort();
  else external?.addEventListener("abort", forwardAbort, { once: true });

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      headers: jsonHeaders(init, requestId()),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    if (timedOut) {
      throw new NetworkError("TIMEOUT", `The server did not respond within ${timeoutMs / 1000}s. Check your connection and retry.`);
    }
    if (external?.aborted) throw new NetworkError("ABORTED", "Request cancelled.");
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new NetworkError("OFFLINE", "You are offline. Reconnect to load this data.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", forwardAbort);
  }
}

const backoffMs = (attempt: number) => 200 * 2 ** attempt;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetch an H-LIFT API route, throwing a consistent error on non-2xx.
 * Idempotent reads are retried on transient failures; writes are not.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const idempotent = method === "GET" || method === "HEAD" || method === "OPTIONS";
  const attempts = idempotent ? MAX_RETRIES + 1 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await attemptFetch(input, init, DEFAULT_TIMEOUT_MS);
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const error = new ApiError(res.status, payload);
        if (idempotent && RETRYABLE_STATUSES.has(res.status) && attempt < attempts - 1) {
          lastError = error;
          await wait(backoffMs(attempt));
          continue;
        }
        throw error;
      }
      return res;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (!idempotent || attempt >= attempts - 1) throw error;
      lastError = error;
      await wait(backoffMs(attempt));
    }
  }
  throw lastError ?? new NetworkError("NETWORK", "Request failed.");
}

/** Fetch and decode a JSON API response. */
export async function apiJson<T = unknown>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  return (await res.json()) as T;
}

/** POST a JSON body and decode the JSON response. Never retried (not idempotent). */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, { method: "POST", body: JSON.stringify(body) });
}
