import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { CopyButton, PrintButton } from "@/components/Actions";
import { weeklyData } from "@/lib/repo";
import { renderWeeklyMarkdown } from "@/lib/weekly";
import { bucketText, qtyText } from "@/lib/hazmat-display";
import { UNKNOWN } from "@/lib/status";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function WeeklyPage() {
  const d = weeklyData();
  const r = d.report;
  const markdown = renderWeeklyMarkdown(d);

  return (
    <Page
      title="H-LIFT weekly status"
      subtitle={`Format ${r.format}. Sections are fixed for week-over-week comparison; narrative fields that were not supplied by the programme are marked UNKNOWN rather than written for you.`}
      actions={
        <div className="actions-row">
          <CopyButton text={markdown} />
          <PrintButton />
        </div>
      }
    >
      <UnknownNotice>
        Delta versus the previous report is UNKNOWN: the platform does not store a prior report in
        this build, so it will not invent a trend. Narrative sections are marked UNKNOWN until the
        programme provides them.
      </UnknownNotice>

      <div className="report">
        <h1>{r.title}</h1>
        <div className="report-meta">
          {r.format} · {r.week} · {r.period_start} → {r.period_end} · generated {fmtDateTime(r.generated_at)}
        </div>

        <h2>1. Mission and requirements flow</h2>
        <table>
          <tbody>
            <tr><td>Mission requirements</td><td className="num">{d.overview.requirements.missions}</td></tr>
            <tr><td>Operational needs</td><td className="num">{d.overview.requirements.needs}</td></tr>
            <tr><td>Capabilities</td><td className="num">{d.overview.requirements.capabilities}</td></tr>
            <tr><td>System requirements</td><td className="num">{d.overview.requirements.system}</td></tr>
            <tr><td>Delta vs previous report</td><td><Badge value={r.delta_vs_previous} /></td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th>Requirement group / status</th><th>Count</th></tr></thead>
          <tbody>
            {d.requirements.map((row) => (
              <tr key={row.status}><td className="mono small">{row.status}</td><td className="num">{row.n}</td></tr>
            ))}
          </tbody>
        </table>

        <h2>2. Delivery pipeline</h2>
        <ul>
          <li>Issues: {d.overview.delivery.issues} total · {d.overview.delivery.done} done · {d.overview.delivery.inProgress} in progress</li>
          <li>Open pull requests: {d.overview.delivery.openPrs} · failing checks: {d.overview.delivery.failingChecks}</li>
          <li>Artifacts: {d.overview.delivery.artifacts} · status UNKNOWN: {d.overview.delivery.unknownArtifacts}</li>
        </ul>
        <table>
          <thead><tr><th>Issue status</th><th>Count</th></tr></thead>
          <tbody>
            {d.issues.map((row) => (
              <tr key={row.status}><td>{row.status}</td><td className="num">{row.n}</td></tr>
            ))}
          </tbody>
        </table>

        <h2>3. Hazmat: containers, quantities and inspections</h2>
        <ul>
          <li>Materials: {d.overview.hazmat.materials} · containers: {d.overview.hazmat.containers}</li>
          <li>
            Available {d.overview.hazmat.available} · reserved {d.overview.hazmat.reserved} · issued {d.overview.hazmat.issued} ·
            return hold {d.overview.hazmat.returnHold} · quarantined {d.overview.hazmat.quarantined} · expired {d.overview.hazmat.expired} ·
            disposition pending {d.overview.hazmat.dispositionPending} · disposed {d.overview.hazmat.disposed}
          </li>
          <li>Quantities UNKNOWN: {d.overview.hazmat.unknownQuantity} container(s) · expiry UNKNOWN: {d.overview.hazmat.unknownExpiry}</li>
          <li>Returns awaiting inspection: {d.overview.hazmat.inspectionsPending}</li>
          <li>Quantity variances recorded: {d.overview.hazmat.varianceCount} · unverified return quantities: {d.overview.hazmat.unverifiedTransactions}</li>
          <li>Quarterly checks due: {d.overview.hazmat.checksDue} · overdue: {d.overview.hazmat.checksOverdue} · unknown: {d.overview.hazmat.checksUnknown}</li>
        </ul>
        <p className="small dim">Quantities are never summed across units of measure; each material row is its own dimension.</p>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>On hand</th>
              <th>Available</th>
              <th>Issued</th>
              <th>Return hold</th>
              <th>Quarantined</th>
              <th>Expired</th>
              <th>Disposition</th>
            </tr>
          </thead>
          <tbody>
            {d.inventory.map((row) => {
              const uom = row.material.unit_of_measure;
              const b = (key: string) => row.buckets.find((x) => x.key === key);
              return (
                <tr key={row.material.id}>
                  <td><span className="mono small">{row.material.material_code}</span> {row.material.name}</td>
                  <td className="num small">
                    {qtyText(row.onHand, uom)}
                    {row.onHandUnknown ? <div className="faint">+{row.onHandUnknown} UNKNOWN</div> : null}
                  </td>
                  <td className="num small">{bucketText(b("AVAILABLE"), uom)}</td>
                  <td className="num small">{bucketText(b("ISSUED"), uom)}</td>
                  <td className="num small">{bucketText(b("RETURN_HOLD"), uom)}</td>
                  <td className="num small">{bucketText(b("QUARANTINED"), uom)}</td>
                  <td className="num small">{bucketText(b("EXPIRED"), uom)}</td>
                  <td className="num small">{bucketText(b("DISPOSITION_PENDING"), uom)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {d.returns.length ? (
          <table>
            <thead><tr><th>Container</th><th>Issued</th><th>Consumed</th><th>Returned</th><th>Variance</th><th>Status</th></tr></thead>
            <tbody>
              {d.returns.map((ret) => (
                <tr key={ret.id}>
                  <td className="mono small">{ret.container_code}</td>
                  <td className="num small">{qtyText(ret.issued, ret.unit_of_measure)}</td>
                  <td className="num small">{qtyText(ret.consumed, ret.unit_of_measure)}</td>
                  <td className="num small">{qtyText(ret.returned, ret.unit_of_measure)}</td>
                  <td className="num small">{qtyText(ret.variance, ret.unit_of_measure)}</td>
                  <td><Badge value={ret.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <h3>Returns held for inspection</h3>
        <ul>
          {d.inspections.filter((i) => i.pending).map((i) => (
            <li key={i.id}>
              <span className="mono small">{i.container_code}</span> ({i.material_name}):{" "}
              {i.completed.confirmed}/8 checks confirmed, {i.completed.unknown} UNKNOWN — measured{" "}
              {i.measured ? qtyText(i.measured, i.unit_of_measure) : "UNKNOWN"}.
            </li>
          ))}
          {!d.inspections.some((i) => i.pending) ? <li>None.</li> : null}
        </ul>
        <h3>Checks needing action</h3>
        <ul>
          {[...d.checks.overdue, ...d.checks.due, ...d.checks.unknown].map((c) => (
            <li key={c.id}>
              <span className="mono small">{c.container_code}</span> {c.quarter} — <Badge value={c.status} /> due {c.due_at.slice(0, 10)}
            </li>
          ))}
          {!d.checks.overdue.length && !d.checks.due.length && !d.checks.unknown.length ? <li>None.</li> : null}
        </ul>

        <h2>4. Conflicts, sync and offline status</h2>
        <ul>
          <li>Open conflicts: {d.conflicts.length}</li>
          <li>Sync nodes needing attention: {d.nodes.filter((n) => n.status !== "synced").length}</li>
          {d.nodes.map((n) => (
            <li key={n.id}>{n.name} — <Badge value={n.status} /> {n.pending_changes == null ? "pending UNKNOWN" : `${n.pending_changes} pending`}</li>
          ))}
        </ul>

        <h2>5. HITL exceptions and cybersecurity</h2>
        <ul>
          {d.hitl.map((h) => (<li key={h.id}><span className="mono small">{h.code}</span> {h.title} — <Badge value={h.severity} /></li>))}
          {!d.hitl.length ? <li>No open HITL exceptions.</li> : null}
          {d.security.map((s) => (<li key={s.id}><span className="mono small">{s.code}</span> {s.title} — <Badge value={s.status} /></li>))}
          {!d.security.length ? <li>No open security events.</li> : null}
        </ul>

        <h2>6. Blockers and evidence gaps</h2>
        <ul>
          {d.blockers.map((b) => (<li key={b.id}><span className="mono small">{b.code}</span> {b.title} — owner {b.owner ?? UNKNOWN}</li>))}
          {!d.blockers.length ? <li>No open blockers.</li> : null}
          <li>Evidence gaps: {d.evidence_gaps.total} (unknown {d.overview.evidenceGaps.unknown}, unverified {d.overview.evidenceGaps.unverified}, failed {d.overview.evidenceGaps.failed})</li>
        </ul>

        <h2>7. Decisions needed this week</h2>
        <ul>
          {d.approvals.map((a) => (
            <li key={a.id}>Approve/reject {a.environment} deployment of {a.artifact_name} {a.artifact_version}.</li>
          ))}
          {d.hitl.map((h) => (<li key={h.id}>Decide HITL exception {h.code}: {h.title}.</li>))}
          {d.inspections.filter((i) => i.pending).length ? (
            <li>Complete {d.inspections.filter((i) => i.pending).length} return inspection(s) before any container re-enters available stock.</li>
          ) : null}
          {d.overview.hazmat.varianceCount ? (
            <li>Resolve {d.overview.hazmat.varianceCount} recorded quantity variance(s); they have not been written off.</li>
          ) : null}
          {!d.approvals.length && !d.hitl.length && !d.inspections.filter((i) => i.pending).length && !d.overview.hazmat.varianceCount ? <li>None.</li> : null}
        </ul>

        <h2>8. Next week</h2>
        <ul>
          <li>Owner narrative: <Badge value={UNKNOWN} /> (not provided)</li>
          {d.blockers.length ? <li>Clear blockers listed in section 6.</li> : null}
          {d.checks.overdue.length ? <li>Complete {d.checks.overdue.length} overdue quarterly check(s).</li> : null}
          {d.inspections.filter((i) => i.pending).length ? <li>Obtain inspector sign-off for {d.inspections.filter((i) => i.pending).length} held return(s).</li> : null}
          {d.overview.hazmat.varianceCount ? <li>Investigate quantity variances and record disposition.</li> : null}
          {d.overview.hazmat.dispositionPending ? <li>Complete disposition of containers awaiting disposal decision.</li> : null}
          {d.evidence_gaps.total ? <li>Close evidence gaps or record an explicit HITL exception.</li> : null}
        </ul>
      </div>
    </Page>
  );
}
