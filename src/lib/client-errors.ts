"use client";

/**
 * Best-effort browser crash reporting. Uses raw fetch (not apiFetch) to avoid
 * recursing if the API client itself is the source of the failure. The server
 * endpoint logs a redacted structured event; it stores no PII and returns 204.
 */

const ENDPOINT = "/api/client-errors";

export interface ClientErrorReport {
  source: string;
  message: string;
  stack?: string;
  digest?: string;
  requestId?: string;
  path?: string;
}

export function reportClientError(report: ClientErrorReport): void {
  if (typeof fetch !== "function") return;
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        ...report,
        // Truncate so a pathological stack cannot bloat the log pipeline.
        message: report.message.slice(0, 500),
        stack: report.stack?.slice(0, 2000),
        path: report.path ?? (typeof location !== "undefined" ? location.pathname : undefined),
      }),
    }).catch(() => undefined);
  } catch {
    // Reporting must never mask the original failure.
  }
}
