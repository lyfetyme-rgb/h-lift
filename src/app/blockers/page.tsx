import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { listBlockers } from "@/lib/repo";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function BlockersPage() {
  const blockers = listBlockers();
  const open = blockers.filter((b) => b.status === "OPEN");

  return (
    <Page
      title="Blockers"
      subtitle="Open impediments with a named owner and the record they block. A blocker without an owner is shown as UNKNOWN ownership rather than assigned by assumption."
    >
      <UnknownNotice>
        Ownership is not guessed. Blocker rows with no owner display UNKNOWN.
      </UnknownNotice>

      <Panel title={`Open blockers (${open.length})`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Blocker</th><th>Severity</th><th>Owner</th><th>Blocks</th><th>Raised</th><th>Status</th></tr>
            </thead>
            <tbody>
              {blockers.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div className="mono">{b.code}</div>
                    <div style={{ maxWidth: 420 }}>{b.title}</div>
                    {b.notes ? <div className="small dim">{b.notes}</div> : null}
                  </td>
                  <td><Badge value={b.severity} /></td>
                  <td className="small">{b.owner ?? "UNKNOWN"}</td>
                  <td className="small mono">{b.linked_kind ? `${b.linked_kind} / ${b.linked_id ?? "UNKNOWN"}` : "UNKNOWN"}</td>
                  <td className="num small">
                    {fmtDateTime(b.created_at)}
                    {b.resolved_at ? <div className="faint">resolved {fmtDateTime(b.resolved_at)}</div> : null}
                  </td>
                  <td><Badge value={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
