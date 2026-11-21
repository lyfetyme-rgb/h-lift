"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHECKLIST_FIELDS } from "@/lib/lifecycle";
import { postJson } from "@/lib/client-api";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, success = "Recorded.") => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await fn();
      setOk(success);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, ok, run };
}

export function ApprovalDecision({ id }: { id: string }) {
  const { busy, error, ok, run } = useAction();
  const [approver, setApprover] = useState("");
  const [note, setNote] = useState("");

  const decide = (action: "approve" | "reject") =>
    run(
      () => postJson(`/api/approvals/${id}/decision`, { action, approver, note }),
      action === "approve" ? "Approved." : "Rejected."
    );

  return (
    <div>
      <div className="actions-row">
        <input
          value={approver}
          onChange={(e) => setApprover(e.target.value)}
          placeholder="your name"
          aria-label="approver"
        />
        <button className="small primary" disabled={busy || !approver.trim()} onClick={() => decide("approve")}>
          Approve
        </button>
        <button className="small danger" disabled={busy || !approver.trim()} onClick={() => decide("reject")}>
          Reject
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="decision note (optional)"
        style={{ marginTop: 6, width: "100%" }}
        aria-label="decision note"
      />
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

export function HitlDecision({ id }: { id: string }) {
  const { busy, error, ok, run } = useAction();
  const [by, setBy] = useState("");
  const [note, setNote] = useState("");

  const decide = (action: "approve" | "reject") =>
    run(
      () => postJson(`/api/hitl/${id}/decision`, { action, decided_by: by, note }),
      action === "approve" ? "Exception approved." : "Exception rejected."
    );

  return (
    <div>
      <div className="actions-row">
        <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="decider" aria-label="decider" />
        <button className="small primary" disabled={busy || !by.trim()} onClick={() => decide("approve")}>
          Approve
        </button>
        <button className="small danger" disabled={busy || !by.trim()} onClick={() => decide("reject")}>
          Reject
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="decision note (optional)"
        style={{ marginTop: 6, width: "100%" }}
        aria-label="decision note"
      />
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

export function ConflictResolve({ id }: { id: string }) {
  const { busy, error, ok, run } = useAction();
  const [resolution, setResolution] = useState("");

  return (
    <div>
      <div className="actions-row">
        <input
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="resolution note"
          style={{ width: 200 }}
          aria-label="resolution"
        />
        <button
          className="small"
          disabled={busy || !resolution.trim()}
          onClick={() => run(() => postJson(`/api/conflicts/${id}/resolve`, { resolution }), "Conflict resolved.")}
        >
          Resolve
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hazmat: return intake, inspection decision, container transition
// ---------------------------------------------------------------------------

export interface ReturnOption {
  id: string;
  container_code: string;
  material_name: string;
  unit_of_measure: string;
  nominal_quantity: string;
  measurement_basis: string;
  state: string;
  partial_allowed: boolean;
}

export function ReturnForm({ containers }: { containers: ReturnOption[] }) {
  const { busy, error, ok, run } = useAction();
  const [containerId, setContainerId] = useState(containers[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [method, setMethod] = useState("MEASURED");
  const [actor, setActor] = useState("");
  const [notes, setNotes] = useState("");

  const selected = containers.find((c) => c.id === containerId);

  const submit = async () => {
    const success = await run(
      () =>
        postJson("/api/hazmat/returns", {
          container_id: containerId,
          returned_quantity: quantity,
          measurement_method: method,
          actor,
          notes: notes || undefined,
        }),
      "Return received into RETURN_HOLD — an inspection must ACCEPT it before restock."
    );
    if (success) {
      setQuantity("");
      setNotes("");
    }
  };

  return (
    <div>
      <div className="form">
        <div className="field">
          <label htmlFor="return-container">Container in custody</label>
          <select
            id="return-container"
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
          >
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.container_code} — {c.material_name} ({c.state})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="return-quantity">
            Returned quantity{selected ? ` (${selected.unit_of_measure})` : ""}
          </label>
          <input
            id="return-quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={selected ? `e.g. 3.400 of ${selected.nominal_quantity}` : "e.g. 3.400"}
            inputMode="decimal"
            style={{ width: 170 }}
          />
        </div>
        <div className="field">
          <label htmlFor="return-method">Measurement method</label>
          <select id="return-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="MEASURED">MEASURED</option>
            <option value="ESTIMATED">ESTIMATED</option>
            <option value="DECLARED_UNVERIFIED">DECLARED_UNVERIFIED</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="return-actor">Received by</label>
          <input
            id="return-actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="your name"
          />
        </div>
        <button
          className="primary"
          disabled={busy || !containerId || !quantity.trim() || !actor.trim()}
          onClick={submit}
        >
          Receive return
        </button>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="notes (optional)"
        style={{ marginTop: 8, width: "100%" }}
        aria-label="notes"
      />
      <p className="notice">
        Quantities are exact decimals recorded as text — never floats. A return is received into
        RETURN_HOLD; it never goes straight to available stock. Declared or estimated quantities are
        recorded as UNVERIFIED until an inspector measures them.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

type CheckState = "UNKNOWN" | "PASS" | "FAIL";

export interface InspectionView {
  id: string;
  container_code: string;
  material_name: string;
  unit_of_measure: string;
  declared_quantity: string | null;
  measured_quantity: string | null;
  measurement_method: string;
  checks: Record<string, boolean | null>;
}

export function InspectionDecision({ inspection }: { inspection: InspectionView }) {
  const { busy, error, ok, run } = useAction();
  const [inspector, setInspector] = useState("");
  const [outcome, setOutcome] = useState("ACCEPT");
  const [measured, setMeasured] = useState(inspection.measured_quantity ?? inspection.declared_quantity ?? "");
  const [method, setMethod] = useState(
    inspection.measurement_method === "MEASURED" ? "MEASURED" : "MEASURED"
  );
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<Record<string, CheckState>>(() => {
    const initial: Record<string, CheckState> = {};
    for (const [key] of CHECKLIST_FIELDS) {
      const v = inspection.checks[key];
      initial[key] = v === true ? "PASS" : v === false ? "FAIL" : "UNKNOWN";
    }
    return initial;
  });

  const setCheck = (key: string, value: CheckState) =>
    setChecks((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    const payload: Record<string, boolean | null> = {};
    for (const [key] of CHECKLIST_FIELDS) {
      const inverted = key === "container_damaged" || key === "contamination_suspected";
      const v = checks[key];
      payload[key] = v === "UNKNOWN" ? null : inverted ? v === "FAIL" : v === "PASS";
    }
    return run(
      () =>
        postJson(`/api/hazmat/inspections/${inspection.id}/decision`, {
          inspector,
          outcome,
          checks: payload,
          measured_quantity: measured.trim() ? measured : null,
          measurement_method: method,
          notes: notes || undefined,
        }),
      `Inspection ${outcome} recorded.`
    );
  };

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", marginBottom: 10 }}>
        {CHECKLIST_FIELDS.map(([key, label]) => {
          const inverted = key === "container_damaged" || key === "contamination_suspected";
          return (
            <div className="field" key={key}>
              <label htmlFor={`chk-${inspection.id}-${key}`}>
                {label}
                {inverted ? <span className="faint"> (PASS = no)</span> : null}
              </label>
              <select
                id={`chk-${inspection.id}-${key}`}
                value={checks[key]}
                onChange={(e) => setCheck(key, e.target.value as CheckState)}
              >
                <option value="UNKNOWN">UNKNOWN</option>
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
          );
        })}
      </div>

      <div className="form">
        <div className="field">
          <label htmlFor={`outcome-${inspection.id}`}>Outcome</label>
          <select id={`outcome-${inspection.id}`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="ACCEPT">ACCEPT → restock</option>
            <option value="RELABEL">RELABEL</option>
            <option value="QUARANTINE">QUARANTINE</option>
            <option value="DISPOSITION">DISPOSITION</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`measured-${inspection.id}`}>
            Measured quantity ({inspection.unit_of_measure})
          </label>
          <input
            id={`measured-${inspection.id}`}
            value={measured}
            onChange={(e) => setMeasured(e.target.value)}
            inputMode="decimal"
            style={{ width: 150 }}
          />
        </div>
        <div className="field">
          <label htmlFor={`method-${inspection.id}`}>Method</label>
          <select id={`method-${inspection.id}`} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="MEASURED">MEASURED</option>
            <option value="ESTIMATED">ESTIMATED</option>
            <option value="DECLARED_UNVERIFIED">DECLARED_UNVERIFIED</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`inspector-${inspection.id}`}>Inspector</label>
          <input
            id={`inspector-${inspection.id}`}
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
            placeholder="your name"
          />
        </div>
        <button
          className="primary"
          disabled={busy || !inspector.trim()}
          onClick={submit}
        >
          Record inspection
        </button>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="inspection notes (optional)"
        style={{ marginTop: 8, width: "100%" }}
        aria-label="inspection notes"
      />
      <p className="notice">
        ACCEPT requires all eight checks confirmed, no failed check, a measured quantity and
        measurement method MEASURED. Anything less is rejected with 422 — the container stays out
        of available stock.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

export function ContainerTransition({
  id,
  current,
  allowed,
}: {
  id: string;
  current: string;
  allowed: string[];
}) {
  const { busy, error, ok, run } = useAction();
  const [actor, setActor] = useState("");
  const [notes, setNotes] = useState("");

  const go = (to: string) =>
    run(
      () => postJson(`/api/hazmat/containers/${id}/transition`, { to, actor, notes: notes || undefined }),
      `Transition to ${to} recorded.`
    );

  return (
    <div>
      <div className="actions-row">
        <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="your name" aria-label="actor" />
        {allowed.length === 0 ? (
          <span className="dim small">No outgoing transitions from {current}.</span>
        ) : (
          allowed.map((to) => (
            <button key={to} className="small" disabled={busy || !actor.trim()} onClick={() => go(to)}>
              → {to}
            </button>
          ))
        )}
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="transition note (optional)"
        style={{ marginTop: 6, width: "100%" }}
        aria-label="transition note"
      />
      {allowed.includes("AVAILABLE") ? (
        <p className="notice">AVAILABLE is rejected unless an ACCEPTED inspection exists for this container.</p>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

export function IncidentStatus({
  id,
  current,
}: {
  id: string;
  current: string;
}) {
  const { busy, error, ok, run } = useAction();
  const [status, setStatus] = useState(current === "OPEN" ? "INVESTIGATING" : current);
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");

  return (
    <div>
      <div className="actions-row">
        <select aria-label="incident status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="OPEN">OPEN</option>
          <option value="INVESTIGATING">INVESTIGATING</option>
          <option value="CONTAINED">CONTAINED</option>
          <option value="CLOSED">CLOSED</option>
        </select>
        <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="your name" aria-label="actor" />
        <button
          className="small"
          disabled={busy || !actor.trim() || status === current}
          onClick={() => run(() => postJson(`/api/security/incidents/${id}`, { status, actor, note }), `Incident set to ${status}.`)}
        >
          Update incident
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="action note (optional)"
        style={{ marginTop: 6, width: "100%" }}
        aria-label="action note"
      />
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

export function FindingStatus({
  id,
  current,
  canClose,
  canManage,
}: {
  id: string;
  current: string;
  canClose: boolean;
  canManage: boolean;
}) {
  const { busy, error, ok, run } = useAction();
  const options = [
    ...(canManage ? ["OPEN", "REMEDIATION", "ACCEPTED"] : []),
    ...(canClose ? ["CLOSED"] : []),
  ];
  const [status, setStatus] = useState(options[0] ?? current);
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");

  return (
    <div>
      <div className="actions-row">
        <select aria-label="finding status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {options.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="your name" aria-label="actor" />
        <button
          className="small"
          disabled={busy || !actor.trim() || status === current || options.length === 0}
          onClick={() => run(() => postJson(`/api/assurance/findings/${id}`, { status, actor, note }), `Finding set to ${status}.`)}
        >
          Update finding
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="assessor note (optional)"
        style={{ marginTop: 6, width: "100%" }}
        aria-label="assessor note"
      />
      {!canClose ? (
        <p className="notice">Closing requires the narrow command-acknowledgement capability; it is not available to this principal.</p>
      ) : null}
      {!canManage ? (
        <p className="notice">
          This principal may only close a finding under command acknowledgement, not move it through
          the assessor workflow.
        </p>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

export function IntegrationSync({ kind, label }: { kind: "jira" | "bitbucket"; label: string }) {
  const { busy, error, ok, run } = useAction();
  const [result, setResult] = useState<string | null>(null);

  const sync = () =>
    run(async () => {
      const data = (await postJson(`/api/integrations/${kind}/sync`, {})) as {
        fetched?: number;
        upserted?: number;
        linked?: number;
      };
      const parts: string[] = [`fetched ${data.fetched ?? 0}`];
      if (typeof data.upserted === "number") parts.push(`upserted ${data.upserted}`);
      if (typeof data.linked === "number") parts.push(`linked ${data.linked}`);
      setResult(`${label}: ${parts.join(", ")}.`);
    }, `${label} complete.`);

  return (
    <div>
      <button className="small primary" disabled={busy} onClick={sync}>
        {busy ? "Syncing…" : label}
      </button>
      {result ? <div className="okmsg">{result}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

export function RecomputeButton() {
  const { busy, error, ok, run } = useAction();
  return (
    <div>
      <button
        className="small primary"
        disabled={busy}
        onClick={() => run(() => postJson("/api/improvement", {}), "Effectiveness recomputed.")}
      >
        {busy ? "Recomputing…" : "Recompute effectiveness"}
      </button>
      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="okmsg">{ok}</div> : null}
    </div>
  );
}

export function CopyButton({ text, label = "Copy Markdown" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="small no-print"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function PrintButton() {
  return (
    <button className="small no-print" onClick={() => window.print()}>
      Print / PDF
    </button>
  );
}
