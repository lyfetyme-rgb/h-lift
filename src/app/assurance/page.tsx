import Link from "next/link";
import AccessDenied from "@/components/AccessDenied";
import { Badge, Bar, Kpi, Page, Panel } from "@/components/ui";
import { authorize } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fmtDate, rel } from "@/lib/format";
import { listFindings, listPoam, rmfSummary } from "@/lib/assurance";

export const dynamic = "force-dynamic";

export default async function AssurancePage() {
  const principal = await currentPrincipal();
  const decision = authorize(
    { principal, action: "ASSURANCE_CONTROLS_READ" },
    { record: false }
  );
  if (!decision.permitted) {
    return (
      <AccessDenied
        title="RMF posture"
        plane="ASSURANCE"
        capability="assurance.controls.read"
        principal={principal}
        decision={decision}
      />
    );
  }

  const rmf = rmfSummary();
  const findings = listFindings();
  const poam = listPoam();
  const openFindings = findings.filter((f) => f.status === "OPEN" || f.status === "REMEDIATION");
  const openPoam = poam.filter((p) => p.status !== "COMPLETED");

  return (
    <Page
      title="RMF posture"
      subtitle="This view is a projection of the control, evidence, assessment, finding and POA&M records. There is no target percentage and no manual override: stale evidence and missing evidence are counted from their own rows."
    >
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi
          label="Applicable controls"
          value={rmf.applicableControls}
          note={`${rmf.notApplicable} not applicable`}
        />
        <Kpi
          label="Implemented"
          value={rmf.implemented}
          severity="ok"
          note="recorded and evidenced"
        />
        <Kpi label="Partial" value={rmf.partial} severity={rmf.partial ? "warn" : "ok"} note="implementation incomplete" />
        <Kpi
          label="Not implemented"
          value={rmf.notImplemented}
          severity={rmf.notImplemented ? "bad" : "ok"}
          note="no control in place"
        />
        <Kpi
          label="Not assessed"
          value={rmf.notAssessed}
          severity="unknown"
          note="no assessment record"
        />
        <Kpi
          label="Open findings"
          value={rmf.openFindings}
          severity={rmf.openFindings ? "bad" : "ok"}
          note={`${rmf.poamEntries} POA&M entries`}
        />
      </div>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Evidence objects" value={rmf.evidenceObjects} note={`${rmf.assessments} assessments`} />
        <Kpi label="Current" value={rmf.currentEvidence} severity="ok" note="within validity" />
        <Kpi label="Stale" value={rmf.staleEvidence} severity={rmf.staleEvidence ? "warn" : "ok"} note="validity lapsed" />
        <Kpi label="Missing" value={rmf.missingEvidence} severity={rmf.missingEvidence ? "bad" : "ok"} note="required, not collected" />
        <Kpi label="Rejected" value={rmf.rejectedEvidence} severity={rmf.rejectedEvidence ? "bad" : "ok"} note="assessor rejected" />
        <Kpi label="Open POA&M" value={rmf.openPoam} severity={rmf.openPoam ? "warn" : "ok"} note="open, in progress or delayed" />
      </div>

      <Panel title="Control implementation by family" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Family</th>
                <th>Applicable</th>
                <th>Implemented</th>
                <th>Partial</th>
                <th>Not implemented</th>
                <th>Not assessed</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rmf.families.map((f) => {
                const total = Number(f.applicable) - Number(f.not_applicable);
                return (
                  <tr key={f.family}>
                    <td>
                      <div className="mono">{f.family}</div>
                      <div className="small dim">{f.family_name}</div>
                    </td>
                    <td className="num">{total}</td>
                    <td className="num">{f.implemented}</td>
                    <td className="num">{f.partial}</td>
                    <td className="num">{f.not_implemented}</td>
                    <td className="num">{f.not_assessed}</td>
                    <td>
                      <Bar value={Number(f.implemented)} total={total} kind={Number(f.not_implemented) ? "bad" : "ok"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid cols-2">
        <Panel
          title="Open findings"
          actions={<Link className="small" href="/assurance/findings">findings & POA&M →</Link>}
          flush
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Finding</th><th>Control</th><th>Severity</th><th>Status</th><th>Due</th></tr>
              </thead>
              <tbody>
                {openFindings.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="mono">{f.code}</div>
                      <div className="small" style={{ maxWidth: 300 }}>{f.title}</div>
                    </td>
                    <td className="mono small">{f.control_code ?? "—"}</td>
                    <td><Badge value={f.severity} /></td>
                    <td><Badge value={f.status} /></td>
                    <td className="small num">{rel(f.due_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="POA&M milestones" flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Entry</th><th>Milestone</th><th>Status</th><th>Scheduled</th><th>Residual</th></tr>
              </thead>
              <tbody>
                {openPoam.map((p) => (
                  <tr key={p.id}>
                    <td className="mono small">{p.code}</td>
                    <td className="small" style={{ maxWidth: 280 }}>
                      {p.milestone}
                      <div className="faint">{p.finding_code ?? "no finding"}</div>
                    </td>
                    <td><Badge value={p.status} /></td>
                    <td className="small num">{fmtDate(p.scheduled_at)}</td>
                    <td><Badge value={p.residual_risk} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
