import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { HitlDecision } from "@/components/Actions";
import { listHitl } from "@/lib/repo";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function HitlPage() {
  const exceptions = listHitl();

  return (
    <Page
      title="HITL exceptions"
      subtitle="Human-in-the-loop decisions for cases the deterministic policy cannot settle: unverified evidence, unknown expiry, or a requested deviation. Only a named human decision closes an exception."
    >
      <UnknownNotice>
        An exception cannot be closed by the platform. Approval or rejection requires a named
        decision-maker; unauthenticated or blank decisions are rejected by the API.
      </UnknownNotice>

      <Panel title="Exception queue" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Exception</th>
                <th>Reason</th>
                <th>Severity</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((h) => (
                <tr key={h.id}>
                  <td>
                    <div className="mono">{h.code}</div>
                    <div style={{ maxWidth: 360 }}>{h.title}</div>
                    {h.linked_kind ? (
                      <div className="small faint">linked: {h.linked_kind} / {h.linked_id}</div>
                    ) : null}
                  </td>
                  <td className="small dim" style={{ maxWidth: 360 }}>{h.reason ?? "UNKNOWN"}</td>
                  <td><Badge value={h.severity} /></td>
                  <td className="num small">
                    {fmtDateTime(h.created_at)}
                    <div className="faint">{h.requested_by ?? "UNKNOWN"}</div>
                  </td>
                  <td><Badge value={h.status} /></td>
                  <td>
                    {h.status === "OPEN" || h.status === "UNKNOWN" ? (
                      <HitlDecision id={h.id} />
                    ) : (
                      <div className="small">
                        {h.decided_by ?? "UNKNOWN"}
                        <div className="faint">{fmtDateTime(h.decided_at)}</div>
                        {h.decision_note ? <div className="dim">{h.decision_note}</div> : null}
                      </div>
                    )}
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
