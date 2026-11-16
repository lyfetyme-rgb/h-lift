import Link from "next/link";
import { Badge, Kpi, Page, Panel, UnknownNotice } from "@/components/ui";
import { InspectionDecision, ReturnForm, type InspectionView } from "@/components/Actions";
import { hazmatSummary, listContainers, listInspections } from "@/lib/repo";
import { CHECKLIST_FIELDS, IN_CUSTODY_STATES } from "@/lib/lifecycle";
import { qtyText } from "@/lib/hazmat-display";
import { fmtDateTime } from "@/lib/format";
import { display } from "@/lib/status";

export const dynamic = "force-dynamic";

export default function ReturnsPage() {
  const containers = listContainers();
  const inspections = listInspections();
  const summary = hazmatSummary();
  const inCustody = containers.filter((c) => IN_CUSTODY_STATES.includes(c.state));
  const pending = inspections.filter((i) => i.pending);
  const completed = inspections.filter((i) => !i.pending);

  return (
    <Page
      title="Returns & inspections"
      subtitle="A returned container is received into RETURN_HOLD, inspected against eight checks, and only then may it become AVAILABLE. There is deliberately no direct path from RETURN_RECEIVED to available stock."
    >
      <UnknownNotice>
        A declared or estimated remainder is stored on the inspection record as UNVERIFIED. The
        container&apos;s accountable quantity stays UNKNOWN until an inspector measures it.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Returns pending" value={summary.inspectionsPending} severity={summary.inspectionsPending ? "warn" : "ok"} note="held in RETURN_HOLD" />
        <Kpi label="Inspections accepted" value={summary.inspectionsAccepted} severity="ok" note="restock approved" />
        <Kpi label="Containers in custody" value={inCustody.length} note="eligible for return" />
        <Kpi label="Return hold / lab" value={summary.returnHold} severity={summary.returnHold ? "warn" : "ok"} note="not available stock" />
        <Kpi label="Quarantined" value={summary.quarantined} severity={summary.quarantined ? "bad" : "ok"} note="after inspection" />
      </div>

      <Panel title="Receive a return">
        {inCustody.length === 0 ? (
          <p className="dim" style={{ margin: 0 }}>
            No container is currently in custody, so there is nothing to return. Issue a container first.
          </p>
        ) : (
          <ReturnForm
            containers={inCustody.map((c) => ({
              id: c.id,
              container_code: c.container_code,
              material_name: c.material_name,
              unit_of_measure: c.unit_of_measure,
              nominal_quantity: c.nominal_quantity,
              measurement_basis: c.measurement_basis,
              state: c.state,
              partial_allowed: c.partial_container_accounting === 1,
            }))}
          />
        )}
      </Panel>

      <Panel title={`Pending eight-point inspections (${pending.length})`} flush>
        {pending.length === 0 ? (
          <div className="empty">No returns waiting for inspection.</div>
        ) : (
          pending.map((i) => {
            const view: InspectionView = {
              id: i.id,
              container_code: i.container_code,
              material_name: i.material_name,
              unit_of_measure: i.unit_of_measure,
              declared_quantity: i.declared_quantity,
              measured_quantity: i.measured_quantity,
              measurement_method: i.measurement_method,
              checks: Object.fromEntries(
                CHECKLIST_FIELDS.map(([key]) => [
                  key,
                  i[key] === null || i[key] === undefined ? null : i[key] === 1,
                ])
              ),
            };
            return (
              <div key={i.id} style={{ padding: "14px 16px", borderTop: "1px solid var(--line)" }}>
                <div className="actions-row" style={{ marginBottom: 10 }}>
                  <Link href={`/hazmat/containers/${i.container_id}`} className="mono">{i.container_code}</Link>
                  <span className="small dim">{i.material_name}</span>
                  <Badge value={i.measurement_method} />
                  <Badge value={i.outcome} />
                  <span className="small faint">
                    received {fmtDateTime(i.received_at)} · declared{" "}
                    {i.declared ? qtyText(i.declared, i.unit_of_measure) : "UNKNOWN"} · measured{" "}
                    {i.measured ? qtyText(i.measured, i.unit_of_measure) : "UNKNOWN"} ·{" "}
                    {i.completed.confirmed}/8 confirmed
                  </span>
                </div>
                <InspectionDecision inspection={view} />
              </div>
            );
          })
        )}
      </Panel>

      <Panel title={`Completed inspections (${completed.length})`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Container</th>
                <th>Material</th>
                <th>Received</th>
                <th>Inspected</th>
                <th>Inspector</th>
                <th>Method</th>
                <th>Declared</th>
                <th>Measured</th>
                <th>Checks</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/hazmat/containers/${i.container_id}`} className="mono small">{i.container_code}</Link></td>
                  <td className="small dim">{i.material_name}</td>
                  <td className="num small">{fmtDateTime(i.received_at)}</td>
                  <td className="num small">{fmtDateTime(i.inspected_at)}</td>
                  <td className="small">{display(i.inspector)}</td>
                  <td className="small"><Badge value={i.measurement_method} /></td>
                  <td className="num small">{qtyText(i.declared, i.unit_of_measure)}</td>
                  <td className="num small">{qtyText(i.measured, i.unit_of_measure)}</td>
                  <td className="small">{i.completed.confirmed}/8 · {i.completed.unknown} UNKNOWN</td>
                  <td><Badge value={i.outcome} /></td>
                </tr>
              ))}
              {completed.length === 0 ? (
                <tr><td colSpan={10}><div className="empty">No completed inspections.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
