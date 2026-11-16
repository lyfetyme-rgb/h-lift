import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { listSyncNodes } from "@/lib/repo";
import { fmtDateTime, rel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function SyncPage() {
  const nodes = listSyncNodes();
  const attention = nodes.filter((n) => ["pending", "conflict", "offline"].includes(n.status));
  const unknown = nodes.filter((n) => n.status === "UNKNOWN");

  return (
    <Page
      title="Offline sync status"
      subtitle="Field kits, tablets and gateways reconcile locally and merge on reconnect. A node that has never synced reports UNKNOWN rather than an optimistic zero."
    >
      <UnknownNotice>
        Pending-change counts are shown as reported. Where a node has never registered, both its
        last sync and its pending count are UNKNOWN.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="kpi ok"><div className="label">Synced</div><div className="value">{nodes.filter((n) => n.status === "synced").length}</div><div className="note">clean merge</div></div>
        <div className="kpi warn"><div className="label">Needs attention</div><div className="value">{attention.length}</div><div className="note">pending / conflict / offline</div></div>
        <div className="kpi unknown"><div className="label">Unknown</div><div className="value">{unknown.length}</div><div className="note">no sync record</div></div>
      </div>

      <Panel title="Sync nodes" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Node</th>
                <th>Kind</th>
                <th>Last sync</th>
                <th>Pending changes</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.id}>
                  <td>{n.name}</td>
                  <td className="small">{n.kind.replaceAll("_", " ")}</td>
                  <td className="num small">
                    {fmtDateTime(n.last_sync_at)}
                    <div className="faint">{rel(n.last_sync_at)}</div>
                  </td>
                  <td className="num">{n.pending_changes ?? "UNKNOWN"}</td>
                  <td><Badge value={n.status} /></td>
                  <td className="small dim" style={{ maxWidth: 340 }}>{n.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
