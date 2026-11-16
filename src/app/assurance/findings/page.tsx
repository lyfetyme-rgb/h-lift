import AccessDenied from "@/components/AccessDenied";
import { FindingStatus } from "@/components/Actions";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { authorize, canRead } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fmtDate, rel } from "@/lib/format";
import { listFindings, listPoam, rmfSummary } from "@/lib/assurance";

export const dynamic = "force-dynamic";

export default async function FindingsPage() {
  const principal = await currentPrincipal();
  const decision = authorize(
    { principal, action: "ASSURANCE_CONTROLS_READ" },
    { record: false }
  );
  if (!decision.permitted) {
    return (
      <AccessDenied
        title="Findings & POA&M"
        plane="ASSURANCE"
        capability="assurance.controls.read"
        principal={principal}
        decision={decision}
      />
    );
  }

  const canManage = canRead(principal, "ASSURANCE_FINDING_MANAGE");
  const canClose = canRead(principal, "ASSURANCE_FINDING_CLOSE");
  const findings = listFindings();
  const poam = listPoam();
  const rmf = rmfSummary();

  return (
    <Page
      title="Findings & POA&M"
      subtitle="A finding is an assessed deficiency with a control, severity, owner and risk statement. Closing is not routine management: it is a narrow command acknowledgement that carries an explicit obligation on the authorization decision."
    >
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="kpi bad"><div className="label">Open findings</div><div className="value">{rmf.openFindings}</div><div className="note">open or in remediation</div></div>
        <div className="kpi"><div className="label">POA&M entries</div><div className="value">{rmf.poamEntries}</div><div className="note">{rmf.openPoam} not completed</div></div>
        <div className="kpi"><div className="label">Assessments</div><div className="value">{rmf.assessments}</div><div className="note">recorded examinations and tests</div></div>
        <div className="kpi unknown"><div className="label">Not assessed</div><div className="value">{rmf.notAssessed}</div><div className="note">controls without an assessment</div></div>
      </div>

      {!canManage && !canClose ? (
        <div className="callout">
          <strong>Read-only view.</strong> This principal holds neither assurance.finding.manage nor
          assurance.finding.close, so no finding control is rendered.
        </div>
      ) : null}

      <Panel title="Findings register" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Finding</th>
                <th>Control</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Opened / due</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="mono">{f.code}</div>
                    <div className="small" style={{ maxWidth: 380 }}>{f.title}</div>
                    <div className="small dim" style={{ maxWidth: 380 }}>{f.risk ?? f.description ?? "—"}</div>
                  </td>
                  <td className="mono small">{f.control_code ?? "—"}</td>
                  <td><Badge value={f.severity} /></td>
                  <td><Badge value={f.status} /></td>
                  <td className="small mono">{f.owner_subject ?? "UNKNOWN"}</td>
                  <td className="small num">
                    {fmtDate(f.opened_at)}
                    <div className="faint">due {f.due_at ? rel(f.due_at) : "UNKNOWN"}</div>
                  </td>
                  <td>
                    {f.status !== "CLOSED" && (canManage || canClose) ? (
                      <FindingStatus
                        id={f.id}
                        current={f.status}
                        canManage={canManage}
                        canClose={canClose}
                      />
                    ) : (
                      <span className="small faint">{f.closed_at ? `closed ${fmtDate(f.closed_at)}` : "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Plan of Action and Milestones" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Entry</th>
                <th>Finding</th>
                <th>Milestone</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Completed</th>
                <th>Residual risk</th>
              </tr>
            </thead>
            <tbody>
              {poam.map((p) => (
                <tr key={p.id}>
                  <td className="mono small">{p.code}</td>
                  <td className="small">
                    {p.finding_code ?? "—"}
                    <div className="faint">{p.control_code ?? ""}</div>
                  </td>
                  <td className="small" style={{ maxWidth: 340 }}>{p.milestone}</td>
                  <td><Badge value={p.status} /></td>
                  <td className="small num">{fmtDate(p.scheduled_at)}</td>
                  <td className="small num">{p.completed_at ? fmtDate(p.completed_at) : "—"}</td>
                  <td><Badge value={p.residual_risk} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <UnknownNotice>
        A finding with an unknown owner or missing due date stays visible as UNKNOWN. Closing a
        finding does not erase its risk statement or its POA&M history.
      </UnknownNotice>
    </Page>
  );
}
