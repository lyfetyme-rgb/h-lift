import AccessDenied from "@/components/AccessDenied";
import { Badge, Page, Panel } from "@/components/ui";
import { authorize } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fmtDate } from "@/lib/format";
import {
  evidenceExposure,
  listAssessments,
  listControls,
  listEvidence,
} from "@/lib/assurance";

export const dynamic = "force-dynamic";

export default async function ControlsPage() {
  const principal = await currentPrincipal();
  const decision = authorize(
    { principal, action: "ASSURANCE_CONTROLS_READ" },
    { record: false }
  );
  if (!decision.permitted) {
    return (
      <AccessDenied
        title="Controls & evidence"
        plane="ASSURANCE"
        capability="assurance.controls.read"
        principal={principal}
        decision={decision}
      />
    );
  }

  const controls = listControls();
  const evidence = listEvidence();
  const assessments = listAssessments();
  const exposure = evidenceExposure();

  return (
    <Page
      title="Controls & evidence"
      subtitle="NIST SP 800-53 Rev. 5 families mapped for the pilot baseline. A control is IMPLEMENTED because its record says so and supporting evidence exists — not because a percentage target was reached."
    >
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="kpi"><div className="label">Controls</div><div className="value">{controls.length}</div><div className="note">in the catalogue</div></div>
        <div className="kpi"><div className="label">Evidence objects</div><div className="value">{evidence.length}</div><div className="note">linked to controls</div></div>
        <div className="kpi"><div className="label">Assessments</div><div className="value">{assessments.length}</div><div className="note">examine · interview · test</div></div>
        <div className="kpi warn"><div className="label">Needs attention</div><div className="value">{exposure.length}</div><div className="note">stale, missing or absent evidence</div></div>
      </div>

      <Panel title="Control catalogue" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Control</th>
                <th>Family</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Evidence current / total</th>
                <th>Open findings</th>
                <th>Assessed</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="mono">{c.control_id}</div>
                    <div className="small" style={{ maxWidth: 360 }}>{c.title}</div>
                  </td>
                  <td className="small mono">{c.family}</td>
                  <td><Badge value={c.implementation_status} /></td>
                  <td className="small mono">{c.owner_subject ?? "UNKNOWN"}</td>
                  <td className="small num">
                    {c.current_evidence} / {c.evidence_count}
                  </td>
                  <td className="num">{c.open_findings}</td>
                  <td className="small num">{c.assessed_at ? fmtDate(c.assessed_at) : "NOT_ASSESSED"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Evidence requiring attention" flush>
        {exposure.length === 0 ? (
          <div className="empty">Every control has current evidence with no missing object.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Control</th>
                  <th>Evidence</th>
                  <th>Current</th>
                  <th>Stale</th>
                  <th>Missing</th>
                </tr>
              </thead>
              <tbody>
                {exposure.map((e) => (
                  <tr key={e.control_id}>
                    <td>
                      <div className="mono">{e.control_id}</div>
                      <div className="small dim" style={{ maxWidth: 360 }}>{e.title}</div>
                    </td>
                    <td className="num">{e.evidence_count}</td>
                    <td className="num">{e.current_count ?? 0}</td>
                    <td className="num">{e.stale_count ?? 0}</td>
                    <td className="num">{e.missing_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Evidence register" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Control</th>
                <th>Evidence</th>
                <th>Type</th>
                <th>Status</th>
                <th>Collected</th>
                <th>Valid until</th>
                <th>Digest / reference</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.id}>
                  <td className="mono small">{e.control_code}</td>
                  <td className="small" style={{ maxWidth: 320 }}>
                    {e.name}
                    <div className="faint">{e.notes ?? e.source}</div>
                  </td>
                  <td className="small mono">{e.evidence_type}</td>
                  <td><Badge value={e.status} /></td>
                  <td className="small num">{e.collected_at ? fmtDate(e.collected_at) : "—"}</td>
                  <td className="small num">{e.valid_until ? fmtDate(e.valid_until) : "—"}</td>
                  <td className="small mono faint" style={{ maxWidth: 220 }}>
                    {e.digest ?? "NO DIGEST"}
                    <div>{e.object_ref ?? ""}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
