import Link from "next/link";
import { Badge, Kpi, Page, Panel, UnknownNotice } from "@/components/ui";
import { hazmatSummary, inventoryByMaterial, listInspections, recentLedger } from "@/lib/repo";
import { bucketText, qtyText } from "@/lib/hazmat-display";
import { fmtDateTime, rel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function HazmatPage() {
  const summary = hazmatSummary();
  const inventory = inventoryByMaterial();
  const inspections = listInspections();
  const pending = inspections.filter((i) => i.pending);
  const ledger = recentLedger(25);

  return (
    <Page
      title="Hazmat control overview"
      subtitle="Container-aware accountability. Quantities are exact decimals held per container and summed only within one unit of measure. A returned container is held for inspection — it never re-enters available stock automatically."
      actions={
        <div className="actions-row">
          <Link href="/hazmat/inventory" className="badge b-info">Inventory →</Link>
          <Link href="/hazmat/returns" className="badge b-warn">Inspections {pending.length}</Link>
        </div>
      }
    >
      <UnknownNotice>
        A container whose remaining quantity was never measured keeps an UNKNOWN quantity. Bucket
        totals show the known subtotal plus an explicit unknown count; they are never padded with zero.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Containers" value={summary.containers} note={`${summary.materials} materials`} />
        <Kpi label="Available" value={summary.available} severity={summary.available ? "ok" : "warn"} note="sealed or accepted restock" />
        <Kpi label="Issued / in custody" value={summary.issued} severity="ok" note={`${summary.reserved} reserved`} />
        <Kpi label="Return hold" value={summary.returnHold} severity={summary.returnHold ? "warn" : "ok"} note={`${summary.inspectionsPending} inspection(s) pending`} />
        <Kpi label="Quarantined" value={summary.quarantined} severity={summary.quarantined ? "bad" : "ok"} note="unavailable by decision" />
        <Kpi label="Disposition pending" value={summary.dispositionPending} severity={summary.dispositionPending ? "bad" : "ok"} note="awaiting disposal decision" />
        <Kpi label="Expired" value={summary.expired} severity={summary.expired ? "bad" : "ok"} note={`${summary.unknownExpiry} expiry UNKNOWN`} />
        <Kpi label="Quantity UNKNOWN" value={summary.unknownQuantity} severity={summary.unknownQuantity ? "unknown" : "ok"} note="never coerced to zero" />
      </div>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Quantity variances" value={summary.varianceCount} severity={summary.varianceCount ? "bad" : "ok"} note="recorded, not written off" />
        <Kpi label="Unverified returns" value={summary.unverifiedTransactions} severity={summary.unverifiedTransactions ? "unknown" : "ok"} note="declared or estimated" />
        <Kpi label="Quarterly overdue" value={summary.checksOverdue} severity={summary.checksOverdue ? "bad" : "ok"} note={`${summary.checksDue} due · ${summary.checksUnknown} unknown`} />
        <Kpi label="Fully consumed" value={summary.consumed} note="closed containers" />
        <Kpi label="Disposed" value={summary.disposed} note="removed from stock" />
        <Kpi label="Inspection accepted" value={summary.inspectionsAccepted} severity="ok" note="passed eight-point check" />
      </div>

      <Panel title="Accountability by material" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>UoI / UoM</th>
                <th>On hand</th>
                <th>Available</th>
                <th>Reserved</th>
                <th>Issued</th>
                <th>Return hold</th>
                <th>Quarantined</th>
                <th>Expired</th>
                <th>Disposition</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((row) => {
                const uom = row.material.unit_of_measure;
                const b = (key: string) => row.buckets.find((x) => x.key === key);
                return (
                  <tr key={row.material.id}>
                    <td>
                      <Link href="/hazmat/inventory">{row.material.material_code}</Link>
                      <div className="small dim">{row.material.name}</div>
                    </td>
                    <td className="small mono">{row.material.unit_of_issue} / {uom}</td>
                    <td className="num small">
                      {row.onHand === null ? "UNKNOWN" : qtyText(row.onHand, uom)}
                      {row.onHandUnknown ? <div className="faint">{row.onHandUnknown} × UNKNOWN</div> : null}
                    </td>
                    <td className="num small">{bucketText(b("AVAILABLE"), uom)}</td>
                    <td className="num small">{bucketText(b("RESERVED"), uom)}</td>
                    <td className="num small">{bucketText(b("ISSUED"), uom)}</td>
                    <td className="num small">{bucketText(b("RETURN_HOLD"), uom)}</td>
                    <td className="num small">{bucketText(b("QUARANTINED"), uom)}</td>
                    <td className="num small">{bucketText(b("EXPIRED"), uom)}</td>
                    <td className="num small">{bucketText(b("DISPOSITION_PENDING"), uom)}</td>
                  </tr>
                );
              })}
              {inventory.length === 0 ? (
                <tr><td colSpan={10}><div className="empty">No materials recorded.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid cols-2">
        <Panel title={`Returns awaiting inspection (${pending.length})`} actions={<Link className="small" href="/hazmat/returns">open queue →</Link>}>
          {pending.length === 0 ? (
            <p className="dim">No returns waiting. Nothing is sitting between receipt and stock.</p>
          ) : (
            <table>
              <tbody>
                {pending.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link href={`/hazmat/containers/${i.container_id}`} className="mono">{i.container_code}</Link>
                      <div className="small dim">{i.material_name}</div>
                      <div className="small faint">
                        declared {i.declared ? qtyText(i.declared, i.unit_of_measure) : "UNKNOWN"} ·{" "}
                        {i.completed.confirmed}/8 checks · {i.measurement_method}
                      </div>
                    </td>
                    <td className="num"><Badge value={i.outcome} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Recent lifecycle events" actions={<Link className="small" href="/hazmat/lifecycle">full ledger →</Link>}>
          <ul className="timeline">
            {ledger.map((e) => (
              <li key={e.id}>
                <div className="when">{fmtDateTime(e.occurred_at)}</div>
                <div className="what">
                  <Badge value={e.event} /> <Link href={`/hazmat/containers/${e.container_id}`} className="mono">{e.container_code}</Link>
                </div>
                <div className="who">
                  {e.actor ?? "actor UNKNOWN"} · <Badge value={e.status} /> · {rel(e.occurred_at)}
                  {e.quantity_delta ? <span className="mono"> · {e.quantity_delta} {e.unit_of_measure}</span> : null}
                  {e.notes ? <div className="small dim">{e.notes}</div> : null}
                </div>
              </li>
            ))}
            {ledger.length === 0 ? <li className="dim">No lifecycle events recorded.</li> : null}
          </ul>
        </Panel>
      </div>
    </Page>
  );
}
