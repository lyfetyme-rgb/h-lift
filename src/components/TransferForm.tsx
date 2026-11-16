"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface Candidate {
  id: string;
  container_code: string;
  material_name: string;
  lot: string | null;
  unit_of_measure: string;
  current_quantity: string | null;
  expires_at: string | null;
  state: string;
}

export interface Destination {
  id: string;
  code: string;
  name: string;
  level: string;
}

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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.decision?.reason_code ? ` (${data.decision.reason_code})` : "";
    throw new Error((data.detail ?? data.error ?? `HTTP ${res.status}`) + reason);
  }
  return data;
}

export function TransferPackout({
  candidates,
  destinations,
  subject,
}: {
  candidates: Candidate[];
  destinations: Destination[];
  subject: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState(destinations[0]?.id ?? "");
  const [order, setOrder] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async () => {
    if (selected.length === 0 || !destination) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await post("/api/hazmat/transfers", {
        action: "TRANSFER",
        container_ids: selected,
        destination_command_id: destination,
        deployment_order: order || undefined,
        due_at: due || undefined,
        notes: notes || undefined,
      });
      setOk(`Transferred ${result.transfers?.length ?? 0} container(s); group ${result.transfer_group}.`);
      setSelected([]);
      setOrder("");
      setDue("");
      setNotes("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (candidates.length === 0) {
    return <div className="empty">No containers at this command are available for pack-out.</div>;
  }

  return (
    <div>
      <div className="form" style={{ marginBottom: 12 }}>
        <div className="field">
          <label htmlFor="dest">Destination</label>
          <select id="dest" value={destination} onChange={(e) => setDestination(e.target.value)}>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="order">Deployment order</label>
          <input id="order" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="DEPL-2026-004" />
        </div>
        <div className="field">
          <label htmlFor="due">Return by</label>
          <input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="notes">Notes</label>
          <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mission / kit" />
        </div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Container</th>
              <th>Material</th>
              <th>Lot</th>
              <th>Quantity</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id}>
                <td><input type="checkbox" aria-label={`select ${c.container_code}`} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /></td>
                <td className="mono">{c.container_code}</td>
                <td className="small">{c.material_name}</td>
                <td className="small mono">{c.lot ?? "UNKNOWN"}</td>
                <td className="small num">{c.current_quantity ?? "UNKNOWN"} {c.unit_of_measure}</td>
                <td className="small num">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-GB") : "UNKNOWN"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="primary" disabled={busy || selected.length === 0 || !destination} onClick={submit}>
        Pack out &amp; transfer ({selected.length})
      </button>
      <span className="small dim" style={{ marginLeft: 10 }}>packed by {subject}</span>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

export function UnusedReturn({
  transferId,
  currentStatus,
}: {
  transferId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (!qty.trim()) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await post("/api/hazmat/transfers", {
        action: "UNUSED_RETURN",
        transfer_id: transferId,
        returned_unused_quantity: qty,
        notes: notes || undefined,
      });
      setOk("Unused return reconciled; container sent to RETURN_HOLD.");
      setQty("");
      setNotes("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (currentStatus === "RETURNED_UNUSED") {
    return <span className="small faint">reconciled</span>;
  }

  return (
    <div>
      <div className="actions-row">
        <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty e.g. 3.000" aria-label="returned unused quantity" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes" aria-label="notes" />
        <button className="small" disabled={busy || !qty.trim()} onClick={submit}>Unused return</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}
