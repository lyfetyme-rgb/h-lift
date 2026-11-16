import { Page, Panel } from "@/components/ui";
import IdentityBar from "@/components/IdentityBar";
import type { AuthorizationDecision } from "@/lib/authz";
import { roleLabel, Principal } from "@/lib/identity";

/**
 * A denied plane view is still an auditable state. The page states which
 * capability was required, which principal asked, and the policy reason — it
 * never renders a partial or inferred view as though the read had succeeded.
 */
export default function AccessDenied({
  title,
  plane,
  capability,
  principal,
  decision,
}: {
  title: string;
  plane: string;
  capability: string;
  principal: Principal | null;
  decision: AuthorizationDecision;
}) {
  return (
    <Page
      title={title}
      subtitle={`${plane} plane reads require the ${capability} capability. The request was evaluated by the local policy engine and denied.`}
    >
      <Panel title="Access denied">
        <table style={{ maxWidth: 720 }}>
          <tbody>
            <tr><td className="dim">Principal</td><td className="mono">{principal?.subject_id ?? "UNRESOLVED"}</td></tr>
            <tr><td className="dim">Roles</td><td className="mono">{roleLabel(principal)}</td></tr>
            <tr><td className="dim">Required capability</td><td className="mono">{capability}</td></tr>
            <tr><td className="dim">Reason code</td><td><span className="badge b-bad">{decision.reason_code}</span></td></tr>
            <tr><td className="dim">Detail</td><td>{decision.detail ?? "No additional detail."}</td></tr>
            <tr><td className="dim">Facility scope</td><td className="mono">{decision.facility_id ?? "UNKNOWN"}</td></tr>
          </tbody>
        </table>
        <p className="notice" style={{ marginTop: 14 }}>
          Switch the acting principal to one whose role carries the capability. Reads are not
          recorded on the decision ledger; only writes and explicit decisions are.
        </p>
        <IdentityBar />
      </Panel>
    </Page>
  );
}
