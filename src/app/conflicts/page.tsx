import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { ConflictResolve } from "@/components/Actions";
import { listConflicts } from "@/lib/repo";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function ConflictsPage() {
  const conflicts = listConflicts();
  const open = conflicts.filter((c) => c.status === "open").length;
  const unknown = conflicts.filter((c) => c.status === "UNKNOWN").length;

  return (
    <Page
      title="Conflict queue"
      subtitle="Divergent links, contradictory states, stale sync and unresolved ownership. Resolution requires a written note; records whose state cannot be determined remain UNKNOWN."
    >
      <UnknownNotice>
        A conflict with status UNKNOWN has not been triaged — it is not treated as low severity
        merely because the source left the field blank.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="kpi warn"><div className="label">Open</div><div className="value">{open}</div><div className="note">need triage</div></div>
        <div className="kpi unknown"><div className="label">Unknown</div><div className="value">{unknown}</div><div className="note">insufficient data</div></div>
        <div className="kpi ok"><div className="label">Resolved</div><div className="value">{conflicts.filter((c) => c.status === "resolved").length}</div><div className="note">with resolution note</div></div>
      </div>

      <Panel title="Conflicts" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Conflict</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Entities</th>
                <th>Detected</th>
                <th>Status</th>
                <th>Resolution</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="mono">{c.code}</div>
                    <div className="small dim" style={{ maxWidth: 320 }}>{c.notes ?? "No detail recorded."}</div>
                  </td>
                  <td className="small">{c.type.replaceAll("_", " ")}</td>
                  <td><Badge value={c.severity} /></td>
                  <td className="small">
                    <div>{c.entity_a ?? "UNKNOWN"}</div>
                    <div className="faint">{c.entity_b ?? "UNKNOWN"}</div>
                  </td>
                  <td className="num small">{fmtDateTime(c.detected_at)}</td>
                  <td><Badge value={c.status} /></td>
                  <td>
                    {c.status === "resolved" ? (
                      <div className="small">
                        {c.resolution}
                        <div className="faint">{fmtDateTime(c.resolved_at)}</div>
                      </div>
                    ) : (
                      <ConflictResolve id={c.id} />
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
