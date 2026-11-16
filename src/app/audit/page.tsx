import AccessDenied from "@/components/AccessDenied";
import { Badge, Kpi, Page, Panel } from "@/components/ui";
import { authorize, canRead, decisionSummary } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fmtDateTime, rel } from "@/lib/format";
import SyncControls from "@/components/SyncControls";
import { auditCount, recentAudit, verifyAuditChain } from "@/lib/audit";

export const dynamic = "force-dynamic";

function parseList(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default async function AuditPage() {
  const principal = await currentPrincipal();
  const oversight = authorize({ principal, action: "OVERSIGHT_READ" }, { record: false });
  const allowed =
    oversight.permitted ||
    canRead(principal, "ASSURANCE_CONTROLS_READ") ||
    canRead(principal, "SECURITY_EVENTS_READ");

  if (!allowed) {
    return (
      <AccessDenied
        title="Audit bus"
        plane="TRUSTED"
        capability="oversight.read · assurance.controls.read · security.events.read"
        principal={principal}
        decision={oversight}
      />
    );
  }

  const chain = verifyAuditChain();
  const count = auditCount();
  const events = recentAudit(120);
  const decisions = decisionSummary();

  return (
    <Page
      title="Audit bus"
      subtitle="All three planes append to one SHA-256 hash-chained event register. Recomputing the chain from genesis is the integrity check; a single edited row breaks every later hash."
    >
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Events on the bus" value={count} note="operational · cyber · assurance · governance" />
        <Kpi
          label="Chain integrity"
          value={chain.valid ? "VALID" : "BROKEN"}
          severity={chain.valid ? "ok" : "bad"}
          note={chain.valid ? "recomputed from genesis" : `first break at ${chain.brokenAt}`}
        />
        <Kpi label="Decisions" value={decisions.total} note={`${decisions.denied} denied`} />
        <Kpi
          label="Chain head"
          value={<span className="mono" style={{ fontSize: 13 }}>{chain.head ? chain.head.slice(0, 16) : "NONE"}</span>}
          note="SHA-256 of the latest record"
        />
      </div>

      <Panel title="Authorization decisions" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Decided</th>
                <th>Subject / roles</th>
                <th>Action</th>
                <th>Resource</th>
                <th>State / facility</th>
                <th>Outcome</th>
                <th>Reason</th>
                <th>Obligations</th>
              </tr>
            </thead>
            <tbody>
              {decisions.recent.map((d) => {
                const roles = parseList(d.roles);
                const obligations = parseList(d.obligations);
                return (
                  <tr key={String(d.id)}>
                    <td className="small num">
                      {fmtDateTime(String(d.decided_at))}
                      <div className="faint">{rel(String(d.decided_at))}</div>
                    </td>
                    <td className="small">
                      <div className="mono">{String(d.subject_id)}</div>
                      <div className="faint">{d.display_name ? String(d.display_name) : roles.join(", ")}</div>
                    </td>
                    <td className="small mono">
                      {String(d.action)}
                      <div className="faint">{d.capability_code ? String(d.capability_code) : "no capability"}</div>
                    </td>
                    <td className="small mono" style={{ maxWidth: 200 }}>
                      {d.resource_type ? `${String(d.resource_type)}:${String(d.resource_id ?? "?")}` : "—"}
                    </td>
                    <td className="small mono">
                      {d.lifecycle_state ? String(d.lifecycle_state) : "—"}
                      <div className="faint">{d.facility_id ? String(d.facility_id) : "no facility"}</div>
                    </td>
                    <td><Badge value={d.permitted ? "PERMIT" : "DENY"} /></td>
                    <td className="small mono">{String(d.reason_code)}</td>
                    <td className="small mono" style={{ maxWidth: 180 }}>
                      {obligations.length ? obligations.join(", ") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Recent events" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Seq</th>
                <th>Occurred</th>
                <th>Plane</th>
                <th>Event</th>
                <th>Subject</th>
                <th>Resource</th>
                <th>Outcome</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="num small">{e.seq}</td>
                  <td className="small num">
                    {fmtDateTime(e.occurred_at)}
                    <div className="faint">{rel(e.occurred_at)}</div>
                  </td>
                  <td className="small mono">{e.plane}</td>
                  <td className="small">
                    <div className="mono">{e.event_type}</div>
                    <div className="faint">{e.source}</div>
                  </td>
                  <td className="small mono">{e.subject_id ?? "—"}</td>
                  <td className="small mono" style={{ maxWidth: 190 }}>
                    {e.resource_type ? `${e.resource_type}:${e.resource_id ?? "?"}` : "—"}
                  </td>
                  <td className="small">{e.outcome ? <Badge value={e.outcome} /> : "—"}</td>
                  <td className="small mono faint">{e.hash.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="DDIL snapshot (offline detachments)">
        <SyncControls sourceCommandId={principal?.command_id ?? null} targetCommandId={principal?.command_id ?? null} />
      </Panel>

      <Panel title="Hash chain">
        <p className="small dim" style={{ marginBottom: 10 }}>
          The chain is verified by recomputing SHA-256 over canonical newline-joined fields, from
          genesis to head. The seed and the runtime use the same encoder, so a mismatch is a real
          integrity failure, not a formatting artifact.
        </p>
        <table>
          <tbody>
            <tr><td className="dim">Events</td><td className="num">{chain.events}</td></tr>
            <tr><td className="dim">Valid</td><td><Badge value={chain.valid ? "VALID" : "BROKEN"} /></td></tr>
            <tr><td className="dim">First break</td><td className="mono">{chain.brokenAt ?? "none"}</td></tr>
            <tr><td className="dim">Head hash</td><td className="mono small">{chain.head ?? "NONE"}</td></tr>
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}
