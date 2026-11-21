"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, postJson } from "@/lib/client-api";

export default function SyncControls({ sourceCommandId, targetCommandId }: { sourceCommandId: string | null; targetCommandId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const doExport = async () => {
    setBusy(true); setError(null); setOk(null);
    try {
      const res = await apiFetch("/api/sync/export", {
        method: "POST",
        body: JSON.stringify({ source_command_id: sourceCommandId }),
      });
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
      const data = await postJson<{ containers_merged: number; events_verified: number }>(
        "/api/sync/import",
        { bundle, target_command_id: targetCommandId }
      );
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
