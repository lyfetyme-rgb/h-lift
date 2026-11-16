import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { ApprovalDecision } from "@/components/Actions";
import { listApprovals, listHitl } from "@/lib/repo";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function ApprovalsPage() {
  const approvals = listApprovals();
  const hitl = listHitl().filter((h) => h.status === "OPEN" || h.status === "UNKNOWN");
  const pending = approvals.filter((a) => a.status === "pending" || a.status === "UNKNOWN");

  return (
    <Page
      title="Approval queues"
      subtitle="Staging and production deployment approvals, plus HITL exceptions that gate a release. An approval is only valid with a named approver and decision time; incomplete records stay UNKNOWN."
    >
      <UnknownNotice>
        Approval records with no approver or no decision time render as UNKNOWN. They never
        count as approved.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="kpi warn"><div className="label">Awaiting decision</div><div className="value">{pending.length}</div><div className="note">deployments + HITL</div></div>
        <div className="kpi ok"><div className="label">Approved</div><div className="value">{approvals.filter((a) => a.status === "approved").length}</div><div className="note">named approver</div></div>
        <div className="kpi bad"><div className="label">Rejected</div><div className="value">{approvals.filter((a) => a.status === "rejected").length}</div><div className="note">no release</div></div>
        <div className="kpi unknown"><div className="label">Unknown</div><div className="value">{approvals.filter((a) => a.status === "UNKNOWN").length}</div><div className="note">incomplete record</div></div>
      </div>

      <Panel title="Deployment approvals" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Environment</th>
                <th>Artifact status</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="mono">{a.artifact_name}</div>
                    <div className="small dim">{a.artifact_version}</div>
                    {a.container_image ? <div className="small faint">{a.container_image}</div> : null}
                  </td>
                  <td className="small">{a.environment}</td>
                  <td><Badge value={a.artifact_status} /></td>
                  <td className="num small">
                    {fmtDateTime(a.requested_at)}
                    <div className="faint">{a.requested_by ?? "UNKNOWN"}</div>
                    {a.note ? <div className="dim" style={{ maxWidth: 300 }}>{a.note}</div> : null}
                  </td>
                  <td><Badge value={a.status} /></td>
                  <td>
                    {a.status === "pending" || a.status === "UNKNOWN" ? (
                      <ApprovalDecision id={a.id} />
                    ) : (
                      <div className="small">
                        {a.approver ?? "UNKNOWN"}
                        <div className="faint">{fmtDateTime(a.decided_at)}</div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="HITL exceptions gating release" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Exception</th><th>Reason</th><th>Severity</th><th>Status</th><th>Decision</th></tr>
            </thead>
            <tbody>
              {hitl.length === 0 ? (
                <tr><td colSpan={5}><div className="empty">No open HITL exceptions.</div></td></tr>
              ) : (
                hitl.map((h) => (
                  <tr key={h.id}>
                    <td><span className="mono">{h.code}</span> {h.title}</td>
                    <td className="small dim" style={{ maxWidth: 360 }}>{h.reason ?? "UNKNOWN"}</td>
                    <td><Badge value={h.severity} /></td>
                    <td><Badge value={h.status} /></td>
                    <td><a href="/hitl" className="small">open queue →</a></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
