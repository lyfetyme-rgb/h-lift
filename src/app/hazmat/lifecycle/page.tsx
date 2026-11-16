import Link from "next/link";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { recentLedger, stateCounts } from "@/lib/repo";
import { CONTAINER_TRANSITIONS, REQUEST_TRANSITIONS } from "@/lib/lifecycle";
import { fmtDateTime, rel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function LifecyclePage() {
  const ledger = recentLedger(200);
  const states = stateCounts();

  return (
    <Page
      title="Lifecycle ledger"
      subtitle="Every state change is append-only. The ledger is the audit trail; the container row holds only current state. Request and container lifecycles are separate machines and both are enforced server-side."
    >
      <UnknownNotice>
        A ledger entry with status UNVERIFIED records what someone reported. It is not evidence that
        the quantity or condition was independently confirmed.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        {Object.entries(states)
          .sort((a, b) => b[1] - a[1])
          .map(([state, n]) => (
            <div className="kpi" key={state}>
              <div className="label">{state.replaceAll("_", " ")}</div>
              <div className="value">{n}</div>
              <div className="note">containers</div>
            </div>
          ))}
        {Object.keys(states).length === 0 ? <p className="dim">No containers.</p> : null}
      </div>

      <Panel title={`Container ledger (latest ${ledger.length})`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Container</th>
                <th>Material</th>
                <th>Actor</th>
                <th>Status</th>
                <th>Quantity delta</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={e.id}>
                  <td className="num small">
                    {fmtDateTime(e.occurred_at)}
                    <div className="faint">{rel(e.occurred_at)}</div>
                  </td>
                  <td><Badge value={e.event} /></td>
                  <td><Link href={`/hazmat/containers/${e.container_id}`} className="mono small">{e.container_code}</Link></td>
                  <td className="small dim">{e.material_name}</td>
                  <td className="small">{e.actor ?? "UNKNOWN"}</td>
                  <td><Badge value={e.status} /></td>
                  <td className="num small">
                    {e.quantity_delta == null ? "—" : `${e.quantity_delta} ${e.unit_of_measure}`}
                  </td>
                  <td className="small dim" style={{ maxWidth: 340 }}>{e.notes ?? "—"}</td>
                </tr>
              ))}
              {ledger.length === 0 ? (
                <tr><td colSpan={8}><div className="empty">No ledger entries.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid cols-2">
        <Panel title="Request lifecycle" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>From</th><th>Allowed next</th></tr></thead>
              <tbody>
                {Object.entries(REQUEST_TRANSITIONS).map(([from, to]) => (
                  <tr key={from}>
                    <td><Badge value={from} /></td>
                    <td className="small">{to.length ? to.map((s) => <Badge key={s} value={s} />) : <span className="faint">terminal</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Container lifecycle" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>From</th><th>Allowed next</th></tr></thead>
              <tbody>
                {Object.entries(CONTAINER_TRANSITIONS).map(([from, to]) => (
                  <tr key={from}>
                    <td><Badge value={from} /></td>
                    <td className="small">{to.length ? to.map((s) => <Badge key={s} value={s} />) : <span className="faint">terminal</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <p className="notice">
        RETURN_RECEIVED has exactly one outgoing edge: RETURN_HOLD. AVAILABLE can only be reached via
        RESTOCK_APPROVED, and the server additionally requires an ACCEPTED inspection with all eight
        checks passed and a measured quantity.
      </p>
    </Page>
  );
}
