import AccessDenied from "@/components/AccessDenied";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { authorize } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fmtDateTime, rel } from "@/lib/format";
import { listVulnerabilities } from "@/lib/security-plane";

export const dynamic = "force-dynamic";

export default async function VulnerabilitiesPage() {
  const principal = await currentPrincipal();
  const decision = authorize({ principal, action: "SECURITY_EVENTS_READ" }, { record: false });
  if (!decision.permitted) {
    return (
      <AccessDenied
        title="Vulnerabilities & assets"
        plane="CYBERSECURITY"
        capability="security.events.read"
        principal={principal}
        decision={decision}
      />
    );
  }

  const vulnerabilities = listVulnerabilities();
  const open = vulnerabilities.filter((v) => v.status === "OPEN" || v.status === "TRIAGED");

  return (
    <Page
      title="Vulnerabilities, assets and integrity"
      subtitle="Scanner results, configuration drift and integrity observations are separate records. A remediated vulnerability keeps its remediation time; an unobserved check stays UNKNOWN."
    >
      <UnknownNotice>
        CVSS is stored as decimal text, never a floating-point estimate. A vulnerability without a
        recorded remediation time is not counted as remediated.
      </UnknownNotice>

      <Panel title={`Vulnerabilities (${open.length} open or triaged)`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vulnerability</th>
                <th>Severity / CVSS</th>
                <th>Asset</th>
                <th>Status</th>
                <th>Discovered</th>
                <th>Due</th>
                <th>Remediated</th>
              </tr>
            </thead>
            <tbody>
              {vulnerabilities.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="mono">{v.code}</div>
                    <div className="small" style={{ maxWidth: 320 }}>{v.title}</div>
                    <div className="small faint">{v.cve_id ?? v.source ?? "no CVE"}</div>
                  </td>
                  <td>
                    <Badge value={v.severity} />
                    <div className="small num faint">{v.cvss ?? "—"}</div>
                  </td>
                  <td className="small">
                    {v.asset_name ?? "UNKNOWN"}
                    <div className="faint">{v.asset_criticality ?? ""}</div>
                  </td>
                  <td><Badge value={v.status} /></td>
                  <td className="small num">{fmtDateTime(v.discovered_at)}</td>
                  <td className="small num">{v.due_at ? rel(v.due_at) : "UNKNOWN"}</td>
                  <td className="small num">{v.remediated_at ? fmtDateTime(v.remediated_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="notice">
        Asset inventory, configuration checks and integrity observations are managed in the
        <a href="/it"> IT administration console</a>, which is restricted to IT administrators.
      </p>
    </Page>
  );
}
