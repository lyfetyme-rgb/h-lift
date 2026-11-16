import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { ContainerTransition } from "@/components/Actions";
import { containerDetail } from "@/lib/repo";
import { CHECKLIST_FIELDS } from "@/lib/lifecycle";
import { inspectionMark, qtyText } from "@/lib/hazmat-display";
import { fmtDate, fmtDateTime, rel } from "@/lib/format";
import { display } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function ContainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = containerDetail(id);
  if (!detail) notFound();

  const { container: c, ledger, transactions, inspections, checks, allowed } = detail;

  return (
    <Page
      title={`${c.container_code} — ${c.material_name}`}
      subtitle={
        <span>
          {c.material_code} · lot {display(c.lot)} · {c.package_type.replaceAll("_", " ")} ·{" "}
          {c.measurement_basis} measured in {c.unit_of_measure}. Lifecycle transitions are enforced
          server-side.
        </span>
      }
      actions={
        <div className="actions-row">
          <Badge value={c.state} />
          <Badge value={c.condition} />
          <Badge value={c.expiry_state} />
          <Link href="/hazmat/containers" className="badge b-info">All containers →</Link>
        </div>
      }
    >
      <UnknownNotice>
        UNKNOWN means the source never recorded the value. UNVERIFIED means a value was reported but
        not independently checked. Neither is upgraded by display or by passage of time.
      </UnknownNotice>

      <div className="grid cols-2">
        <Panel title="Container">
          <table>
            <tbody>
              <tr><td>Material</td><td><span className="mono">{c.material_code}</span> {c.material_name}</td></tr>
              <tr><td>NSN</td><td className="mono">{display(c.nsn)}</td></tr>
              <tr><td>Manufacturer / part</td><td>{display(c.manufacturer)} · <span className="mono">{display(c.manufacturer_part_no)}</span></td></tr>
              <tr><td>Unit of issue</td><td className="mono">{c.unit_of_issue}</td></tr>
              <tr><td>Package</td><td>{display(c.package_description)}</td></tr>
              <tr><td>Lot / batch</td><td className="mono">{display(c.lot)}</td></tr>
              <tr><td>Nominal quantity</td><td className="num">{qtyText(c.nominal, c.unit_of_measure)}</td></tr>
              <tr><td>Current quantity</td><td className="num">{qtyText(c.current, c.unit_of_measure)}</td></tr>
              <tr><td>Remaining fraction</td><td className="num">{c.remaining_fraction}</td></tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="State & shelf life">
          <table>
            <tbody>
              <tr><td>Lifecycle state</td><td><Badge value={c.state} /></td></tr>
              <tr><td>Accountability bucket</td><td>{c.bucket ? <Badge value={c.bucket} /> : <Badge value="UNKNOWN" />}</td></tr>
              <tr><td>State reason</td><td className="small">{display(c.state_reason)}</td></tr>
              <tr><td>Seal</td><td><Badge value={c.seal_status} /></td></tr>
              <tr><td>Condition</td><td><Badge value={c.condition} /></td></tr>
              <tr><td>Location</td><td>{display(c.location)}</td></tr>
              <tr><td>Manufactured</td><td>{fmtDate(c.manufactured_at)}</td></tr>
              <tr><td>Expires</td><td>{fmtDate(c.expires_at)} {c.days_to_expiry === null ? null : <span className="faint">({c.days_to_expiry} d)</span>}</td></tr>
              <tr><td>Created</td><td>{fmtDate(c.created_at)}</td></tr>
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Lifecycle transition">
        <p className="small dim" style={{ marginTop: 0 }}>
          Current state <Badge value={c.state} />. Allowed next states are derived from the container
          state machine. There is no direct edge from RETURN_RECEIVED to AVAILABLE.
        </p>
        <ContainerTransition id={c.id} current={c.state} allowed={allowed} />
      </Panel>

      <Panel title={`Issue transactions (${transactions.length})`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Issued</th>
                <th>Consumed</th>
                <th>Returned</th>
                <th>Disposed</th>
                <th>Variance</th>
                <th>Basis</th>
                <th>Status</th>
                <th>Issued to / at</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="mono small">{t.txn_code}</td>
                  <td className="num small">{qtyText(t.issued, t.unit_of_measure)}</td>
                  <td className="num small">{qtyText(t.consumed, t.unit_of_measure)}</td>
                  <td className="num small">{qtyText(t.returned, t.unit_of_measure)}</td>
                  <td className="num small">{qtyText(t.disposed, t.unit_of_measure)}</td>
                  <td className="num small">
                    {t.variance === null ? "UNKNOWN" : qtyText(t.variance, t.unit_of_measure)}
                  </td>
                  <td className="small"><Badge value={t.measurement_basis} /></td>
                  <td><Badge value={t.status} /></td>
                  <td className="small">
                    {display(t.issued_to)}
                    <div className="faint">{fmtDateTime(t.issued_at)}</div>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 ? (
                <tr><td colSpan={9}><div className="empty">No transactions.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`Return inspections (${inspections.length})`} flush>
        {inspections.length === 0 ? (
          <div className="empty">No return inspection recorded for this container.</div>
        ) : (
          inspections.map((i) => (
            <div key={i.id} style={{ padding: "14px 16px", borderTop: "1px solid var(--line)" }}>
              <div className="actions-row" style={{ marginBottom: 8 }}>
                <Badge value={i.outcome} />
                <Badge value={i.measurement_method} />
                <span className="small dim">
                  received {fmtDateTime(i.received_at)} · inspected {i.inspected_at ? fmtDateTime(i.inspected_at) : "UNKNOWN"} ·
                  inspector {display(i.inspector)}
                </span>
              </div>
              <div className="small" style={{ marginBottom: 8 }}>
                Declared {i.declared ? qtyText(i.declared, c.unit_of_measure) : "UNKNOWN"} · measured{" "}
                {i.measured ? qtyText(i.measured, c.unit_of_measure) : "UNKNOWN"} ·{" "}
                {i.completed.confirmed}/8 checks confirmed, {i.completed.unknown} UNKNOWN
              </div>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {CHECKLIST_FIELDS.map(([key, label]) => {
                      const inverted = key === "container_damaged" || key === "contamination_suspected";
                      return (
                        <tr key={key}>
                          <td>{label}</td>
                          <td className="num"><Badge value={inspectionMark(i[key], inverted)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {i.notes ? <p className="small dim" style={{ marginBottom: 0 }}>{i.notes}</p> : null}
            </div>
          ))
        )}
      </Panel>

      <div className="grid cols-2">
        <Panel title={`Quarterly checks (${checks.length})`} flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Quarter</th><th>Due</th><th>Completed</th><th>Result</th><th>Status</th></tr></thead>
              <tbody>
                {checks.map((k) => (
                  <tr key={k.id}>
                    <td className="mono small">{k.quarter}</td>
                    <td className="num small">{fmtDate(k.due_at)}</td>
                    <td className="num small">{fmtDate(k.completed_at)}</td>
                    <td className="small">{k.result ?? "UNKNOWN"}</td>
                    <td><Badge value={k.status} /></td>
                  </tr>
                ))}
                {checks.length === 0 ? <tr><td colSpan={5}><div className="empty">No check scheduled.</div></td></tr> : null}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={`Ledger (${ledger.length})`} flush>
          <div style={{ padding: "14px 16px" }}>
            <ul className="timeline">
              {ledger.map((e) => (
                <li key={e.id}>
                  <div className="when">{fmtDateTime(e.occurred_at)}</div>
                  <div className="what"><Badge value={e.event} /></div>
                  <div className="who">
                    {e.actor ?? "actor UNKNOWN"} · <Badge value={e.status} /> · {rel(e.occurred_at)}
                    {e.quantity_delta ? <span className="mono"> · {e.quantity_delta} {c.unit_of_measure}</span> : null}
                    {e.notes ? <div className="small dim">{e.notes}</div> : null}
                  </div>
                </li>
              ))}
              {ledger.length === 0 ? <li className="dim">No ledger entries.</li> : null}
            </ul>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
