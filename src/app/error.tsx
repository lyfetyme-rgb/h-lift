"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-errors";

/** Route-level error boundary: shows a actionable fallback instead of a blank page. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const detail = error instanceof Error ? error : new Error(String(error));
    reportClientError({
      source: "route-error",
      message: detail.message,
      stack: detail.stack,
      digest: (detail as Error & { digest?: string }).digest,
    });
  }, [error]);

  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  return (
    <div className="failure" role="alert">
      <h2>This view could not be loaded</h2>
      <p>
        The rest of H-LIFT is still available. Retry, or use the navigation to continue with another
        view. If this keeps happening, report the reference below.
      </p>
      {digest ? <p><code>reference: {digest}</code></p> : null}
      <button type="button" className="primary" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
