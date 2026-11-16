import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import IdentityBar from "@/components/IdentityBar";
import { overview } from "@/lib/repo";
import { canRead } from "@/lib/authz";
import { currentPrincipal, roleLabel } from "@/lib/identity";
import { socSummary } from "@/lib/security-plane";
import { rmfSummary } from "@/lib/assurance";
import { auditCount } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "H-LIFT · Three-Plane Mission Control",
  description:
    "Operational, cybersecurity and assurance planes over one trusted data layer and hash-chained audit bus.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let counts = {
    conflicts: 0, hitl: 0, approvals: 0, blockers: 0, gaps: 0,
    security: 0, sync: 0, checks: 0, returns: 0,
    incidents: 0, vulns: 0, findings: 0, poam: 0, audit: 0,
  };
  let principal = null;
  try {
    principal = await currentPrincipal();
  } catch {
    principal = null;
  }

  try {
    const ov = overview();
    counts = {
      ...counts,
      conflicts: ov.control.openConflicts + ov.control.unknownConflicts,
      hitl: ov.control.openHitl,
      approvals: ov.approvals.pending + ov.approvals.unknown,
      blockers: ov.control.openBlockers,
      gaps: ov.evidenceGaps.total,
      sync: ov.control.syncAttention + ov.control.syncUnknown,
      checks: ov.hazmat.checksOverdue + ov.hazmat.checksDue,
      returns: ov.hazmat.inspectionsPending,
      audit: auditCount(),
    };

    // A plane's badge is only populated for a principal that may read it.
    if (canRead(principal, "SECURITY_EVENTS_READ")) {
      const soc = socSummary();
      counts.security = soc.activeIncidents;
      counts.incidents = soc.activeIncidents;
      counts.vulns = soc.openVulnerabilities;
    }
    if (canRead(principal, "ASSURANCE_CONTROLS_READ")) {
      const rmf = rmfSummary();
      counts.findings = rmf.openFindings;
      counts.poam = rmf.openPoam;
    }
  } catch {
    // Empty or unseeded database: render the shell with zero counts.
  }

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="mark">
                H<span>·</span>LIFT
              </div>
              <span className="tag">Operational · Cyber · Assurance</span>
            </div>
            <Nav counts={counts} itAdmin={canRead(principal, "SECURITY_CONFIGURATION_MANAGE")} />
          </aside>
          <div className="main">
            <div className="topbar">
              <span className="mono dim">H-LIFT / three-plane console</span>
              <span className="spacer" />
              <span className="env" title="Identity adapter view; H-LIFT stores no credentials">
                {roleLabel(principal)} · {principal?.facility_id ?? "NO FACILITY"}
              </span>
              <IdentityBar />
            </div>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
