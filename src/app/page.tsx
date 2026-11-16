import Link from "next/link";
import { Badge, Kpi, Panel, Page, UnknownNotice } from "@/components/ui";
import { evidenceGaps, listApprovals, listBlockers, listConflicts, listInspections, listSecurity, listSyncNodes, overview, quarterlyChecks } from "@/lib/repo";
import { fmtDate, rel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const ov = overview();
  const gaps = evidenceGaps();
  const approvals = listApprovals().filter((a) => a.status === "pending" || a.status === "UNKNOWN");
  const conflicts = listConflicts().filter((c) => c.status === "open" || c.status === "UNKNOWN");
  const blockers = listBlockers().filter((b) => b.status === "OPEN");
  const security = listSecurity().filter((s) => s.status === "OPEN");
  const nodes = listSyncNodes().filter((n) => n.status !== "synced");
  const checks = quarterlyChecks().filter((c) => c.status === "OVERDUE" || c.status === "DUE");
  const inspections = listInspections().filter((i) => i.pending);

  return (
    <>
      <Page
        title="H-LIFT operations overview"
        subtitle="Requirements-to-delivery traceability with hazmat lifecycle control. Every number links to its source records; anything the sources did not provide stays UNKNOWN."
        actions={<Link href="/weekly" className="badge b-info">Weekly status →</Link>}
      >
        <UnknownNotice />

        <div className="grid kpis" style={{ marginBottom: 18 }}>
          <Kpi label="Open conflicts" value={ov.control.openConflicts} severity={ov.control.openConflicts ? "warn" : "ok"} note={`${ov.control.unknownConflicts} unknown`} />
          <Kpi label="Approvals waiting" value={ov.approvals.pending} severity={ov.approvals.pending ? "warn" : "ok"} note={`${ov.approvals.unknown} record unknown`} />
          <Kpi label="HITL exceptions" value={ov.control.openHitl} severity={ov.control.openHitl ? "warn" : "ok"} note="human decisions required" />
          <Kpi label="Evidence gaps" value={ov.evidenceGaps.total} severity={ov.evidenceGaps.total ? "bad" : "ok"} note={`${ov.evidenceGaps.unknown} unknown · ${ov.evidenceGaps.unverified} unverified`} />
          <Kpi label="Blockers" value={ov.control.openBlockers} severity={ov.control.openBlockers ? "bad" : "ok"} note="open and owned" />
          <Kpi label="Security events" value={ov.control.openSecurity} severity={ov.control.openSecurity ? "bad" : "ok"} note="awaiting triage" />
        </div>

        <div className="grid cols-2">
          <Panel title="Traceability chain">
            <table>
              <tbody>
                <tr><td>Mission requirements</td><td className="num">{ov.requirements.missions}</td></tr>
                <tr><td>Operational needs</td><td className="num">{ov.requirements.needs}</td></tr>
                <tr><td>Capabilities</td><td className="num">{ov.requirements.capabilities}</td></tr>
                <tr><td>System requirements</td><td className="num">{ov.requirements.system}</td></tr>
                <tr><td>Issues done / total</td><td className="num">{ov.delivery.done} / {ov.delivery.issues}</td></tr>
                <tr><td>Open / failing PRs</td><td className="num">{ov.delivery.openPrs} / {ov.delivery.failingChecks}</td></tr>
                <tr><td>Artifacts (unknown status)</td><td className="num">{ov.delivery.artifacts} ({ov.delivery.unknownArtifacts})</td></tr>
              </tbody>
            </table>
            <p style={{ marginBottom: 0, marginTop: 12 }}>
              <Link href="/traceability">Open full chain view →</Link>
            </p>
          </Panel>

          <Panel title="Hazmat & shelf life">
            <table>
              <tbody>
                <tr><td>Containers available / total</td><td className="num">{ov.hazmat.available} / {ov.hazmat.containers}</td></tr>
                <tr><td>Issued or in custody</td><td className="num">{ov.hazmat.issued}</td></tr>
                <tr><td>Return hold (inspection pending)</td><td className="num">{ov.hazmat.returnHold}</td></tr>
                <tr><td>Quarantined / expired / disposition</td><td className="num">{ov.hazmat.quarantined} / {ov.hazmat.expired} / {ov.hazmat.dispositionPending}</td></tr>
                <tr><td>Quantity UNKNOWN · expiry UNKNOWN</td><td className="num">{ov.hazmat.unknownQuantity} · {ov.hazmat.unknownExpiry}</td></tr>
                <tr><td>Pending inspections</td><td className="num">{ov.hazmat.inspectionsPending}</td></tr>
                <tr><td>Quantity variances recorded</td><td className="num">{ov.hazmat.varianceCount}</td></tr>
                <tr><td>Quarterly checks due / overdue</td><td className="num">{ov.hazmat.checksDue} / {ov.hazmat.checksOverdue}</td></tr>
              </tbody>
            </table>
            <p style={{ marginBottom: 0, marginTop: 12 }}>
              <Link href="/hazmat">Open hazmat control overview →</Link>
            </p>
          </Panel>
        </div>

        <div className="grid cols-2">
          <Panel title="Needs a decision" actions={<Link className="small" href="/approvals">all approvals →</Link>}>
            {approvals.length === 0 && blockers.length === 0 ? (
              <p className="dim">Nothing waiting.</p>
            ) : (
              <table>
                <tbody>
                  {approvals.slice(0, 4).map((a) => (
                    <tr key={`a-${a.id}`}>
                      <td>
                        <div>{a.artifact_name} <span className="dim">{a.artifact_version}</span></div>
                        <div className="small dim">{a.environment} deployment · requested {rel(a.requested_at)}</div>
                      </td>
                      <td className="num"><Badge value={a.status} /></td>
                    </tr>
                  ))}
                  {blockers.slice(0, 3).map((b) => (
                    <tr key={`b-${b.id}`}>
                      <td>
                        <div>{b.title}</div>
                        <div className="small dim">blocker · owner {b.owner ?? "UNKNOWN"}</div>
                      </td>
                      <td className="num"><Badge value={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Control-plane attention" actions={<Link className="small" href="/evidence-gaps">evidence gaps →</Link>}>
            <table>
              <tbody>
                {conflicts.slice(0, 3).map((c) => (
                  <tr key={c.id}>
                    <td><div>{c.code} · {c.type.replaceAll("_", " ")}</div><div className="small dim">{c.notes}</div></td>
                    <td className="num"><Badge value={c.status} /></td>
                  </tr>
                ))}
                {security.slice(0, 2).map((s) => (
                  <tr key={s.id}>
                    <td><div>{s.code} · {s.title}</div><div className="small dim">{s.category} · {s.severity}</div></td>
                    <td className="num"><Badge value={s.status} /></td>
                  </tr>
                ))}
                {nodes.slice(0, 2).map((n) => (
                  <tr key={n.id}>
                    <td><div>{n.name}</div><div className="small dim">{n.pending_changes ?? "UNKNOWN"} pending changes</div></td>
                    <td className="num"><Badge value={n.status} /></td>
                  </tr>
                ))}
                {checks.slice(0, 2).map((c) => (
                  <tr key={c.id}>
                    <td><div>{c.container_code} · {c.quarter}</div><div className="small dim">due {fmtDate(c.due_at)}</div></td>
                    <td className="num"><Badge value={c.status} /></td>
                  </tr>
                ))}
                {inspections.slice(0, 2).map((i) => (
                  <tr key={i.id}>
                    <td><div>{i.container_code} · return inspection</div><div className="small dim">{i.material_name} · {i.measurement_method} · {i.completed.confirmed}/8 checks</div></td>
                    <td className="num"><Badge value="PENDING" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <Panel title="Evidence gaps by stage">
          <div className="grid kpis">
            {Object.entries(ov.evidenceGaps.byKind).sort((a, b) => b[1] - a[1]).map(([kind, n]) => (
              <div className="kpi" key={kind}>
                <div className="label">{kind}</div>
                <div className="value">{n}</div>
                <div className="note">{gaps.filter((g) => g.kind === kind && g.status === "UNKNOWN").length} unknown</div>
              </div>
            ))}
            {Object.keys(ov.evidenceGaps.byKind).length === 0 ? <p className="dim">No gaps recorded.</p> : null}
          </div>
        </Panel>
      </Page>
    </>
  );
}
