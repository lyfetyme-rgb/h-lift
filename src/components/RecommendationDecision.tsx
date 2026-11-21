"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client-api";

export default function RecommendationDecision({ id, canDecide }: { id: string; canDecide: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const decide = async (decision: "APPROVED" | "REJECTED" | "DISMISSED") => {
    setBusy(true); setError(null); setOk(null);
    try {
      await postJson(`/api/improvement/recommendations/${id}`, { decision, note });
      setOk(`Marked ${decision.toLowerCase()}.`);
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!canDecide) return <span className="small faint">read-only</span>;

  return (
    <div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="decision note"
        aria-label="decision note"
        style={{ marginBottom: 6 }}
      />
      <div className="actions-row">
        <button className="small" disabled={busy} onClick={() => decide("APPROVED")}>Approve</button>
        <button className="small" disabled={busy} onClick={() => decide("REJECTED")}>Reject</button>
        <button className="small" disabled={busy} onClick={() => decide("DISMISSED")}>Dismiss</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}
