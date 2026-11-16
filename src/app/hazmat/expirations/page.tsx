import Link from "next/link";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { expirations } from "@/lib/repo";
import { fmtDate } from "@/lib/format";
import { display } from "@/lib/status";

export const dynamic = "force-dynamic";

export default function ExpirationsPage() {
  const containers = expirations();
  const expired = containers.filter((c) => c.expiry_state === "EXPIRED");
  const soon = containers.filter((c) => c.expiry_state === "EXPIRING_30D");
  const unknown = containers.filter((c) => c.expiry_state === "UNKNOWN");

  return (
    <Page
      title="Expiration & shelf life"
      subtitle="Shelf life belongs to the material; expiry belongs to the container. Where either is missing the container is UNKNOWN — the platform does not estimate expiry from a manufacture date or category."
    >
      <UnknownNotice>
        A container with no recorded expiry is UNKNOWN even when it is AVAILABLE. Those rows are
        surfaced here rather than hidden, and they appear in the evidence gap register.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="kpi bad"><div className="label">Expired</div><div className="value">{expired.length}</div><div className="note">past recorded expiry</div></div>
        <div className="kpi warn"><div className="label">Expiring ≤ 30 days</div><div className="value">{soon.length}</div><div className="note">plan replacement</div></div>
        <div className="kpi unknown"><div className="label">Expiry unknown</div><div className="value">{unknown.length}</div><div className="note">cannot be scheduled safely</div></div>
        <div className="kpi ok"><div className="label">Within shelf life</div><div className="value">{containers.filter((c) => c.expiry_state === "OK").length}</div><div className="note">recorded and future-dated</div></div>
      </div>

      <Panel title="Container shelf-life register" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Container</th>
                <th>Material</th>
                <th>Lot</th>
                <th>Manufactured</th>
                <th>Shelf life</th>
                <th>Expires</th>
                <th>Days remaining</th>
                <th>State</th>
                <th>Condition</th>
                <th>Computed</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/hazmat/containers/${c.id}`} className="mono">{c.container_code}</Link></td>
                  <td className="small dim">{c.material_name}</td>
                  <td className="mono small">{display(c.lot)}</td>
                  <td className="num small">{fmtDate(c.manufactured_at)}</td>
                  <td className="num small">{c.shelf_life_days == null ? "UNKNOWN" : `${c.shelf_life_days} d`}</td>
                  <td className="num small">{fmtDate(c.expires_at)}</td>
                  <td className="num small">
                    {c.days_to_expiry === null ? "UNKNOWN" : c.days_to_expiry < 0 ? `${Math.abs(c.days_to_expiry)} d past` : `${c.days_to_expiry} d`}
                  </td>
                  <td><Badge value={c.state} /></td>
                  <td><Badge value={c.condition} /></td>
                  <td><Badge value={c.expiry_state} /></td>
                </tr>
              ))}
              {containers.length === 0 ? (
                <tr><td colSpan={10}><div className="empty">No containers recorded.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
