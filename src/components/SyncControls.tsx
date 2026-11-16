"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown) {
  const match = document.cookie.match(/(?:^|; )hlift_subject=([^;]*)/);
  const subject = match ? decodeURIComponent(match[1]) : "";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(subject ? { "x-hlift-subject": subject } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const reason = data.decision?.reason_code ? ` (${data.decision.reason_code})` : "";
    throw new Error((data.detail ?? data.error ?? `HTTP ${res.status}`) + reason);
  }
  return res;
}

export default function SyncControls({ sourceCommandId, targetCommandId }: { sourceCommandId: string | null; targetCommandId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const doExport = async () => {
    setBusy(true); setError(null); setOk(null);
    try {
      const res = await post("/api/sync/export", { source_command_id: sourceCommandId });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hlift-snapshot-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setOk("Snapshot exported.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File) => {
    setBusy(true); setError(null); setOk(null);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const result = await post("/api/sync/import", { bundle, target_command_id: targetCommandId });
      const data = await result.json();
      setOk(`Merged ${data.containers_merged} container(s); ${data.events_verified} events verified.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="actions-row">
        <button className="small primary" disabled={busy} onClick={doExport}>Export DDIL snapshot</button>
        <label className="small button" style={{ cursor: "pointer" }}>
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) doImport(file);
            }}
          />
          Import snapshot
        </label>
      </div>
      <p className="notice">Export records a signed bundle of inventory and audit evidence for detachments; import verifies it and merges it without breaking the local hash chain.</p>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}
