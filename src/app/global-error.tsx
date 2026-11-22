"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-errors";

/**
 * Global error boundary for the root layout. It must supply its own <html> and
 * <body>, and cannot rely on globals.css (which lives in the replaced layout).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const detail = error instanceof Error ? error : new Error(String(error));
    reportClientError({
      source: "global-error",
      message: detail.message,
      stack: detail.stack,
      digest: (detail as Error & { digest?: string }).digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: "24px", background: "#0b1015", color: "#e7eef6", fontFamily: "system-ui, sans-serif" }}>
        <div role="alert" style={{ maxWidth: 620, margin: "40px auto", border: "1px solid #74333a", borderLeft: "3px solid #ff6b6b", borderRadius: 10, padding: "20px 24px", background: "#111820" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>H-LIFT could not start</h1>
          <p style={{ color: "#8fa1b3", fontSize: 14, lineHeight: 1.6 }}>
            The application shell failed to render. Reload to try again; if the problem persists,
            check that the data layer and identity adapter are available.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 8, padding: "8px 16px", borderRadius: 7, border: "1px solid #2a6fb3", background: "#2a6fb3", color: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            Reload H-LIFT
          </button>
        </div>
      </body>
    </html>
  );
}
