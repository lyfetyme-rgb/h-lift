import Link from "next/link";
import { Badge, Kpi, Page, Panel, UnknownNotice } from "@/components/ui";
import { listContainers, stateCounts } from "@/lib/repo";
import { containerQty } from "@/lib/hazmat-display";
import { fmtDate } from "@/lib/format";
import { display } from "@/lib/status";

export const dynamic = "force-dynamic";

const PRIORITY = [
  "DISPOSITION_REQUIRED",
  "QUARANTINED",
  "EXPIRED",
  "RETURN_HOLD",
  "RETURN_RECEIVED",
  "INSPECTED",
  "RELABEL_REQUIRED",
  "RESTOCK_APPROVED",
  "IN_USE",
  "IN_CUSTODY",
  "ISSUED",
  "RESERVED",
  "AVAILABLE",
  "FULLY_CONSUMED",
  "DISPOSED",
  "UNKNOWN",
];

export default function ContainersPage() {
  const containers = listContainers();
  const states = stateCounts();
  const ordered = [...containers].sort((a, b) => {
    const ai = PRIORITY.indexOf(a.state);
    const bi = PRIORITY.indexOf(b.state);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.container_code.localeCompare(b.container_code);
  });

  return (
    <Page
      title="Container register"
      subtitle="The container — not the material — is the accountable unit. Each row carries its own lot, nominal quantity, current quantity, seal state, expiry, location and lifecycle state."
    >
      <UnknownNotice>
        A container with an unrecorded expiry or quantity is shown as UNKNOWN and appears in the gap
        register. Opening a container never changes its nominal quantity.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        {PRIORITY.filter((s) => states[s]).map((s) => (
          <Kpi key={s} label={s.replaceAll("_", " ")} value={states[s]} />
        ))}
      </div>

      <Panel title={`Containers (${containers.length})`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Container</th>
                <th>Material</th>
                <th>Lot / package</th>
                <th>Current</th>
                <th>Nominal</th>
                <th>Seal</th>
                <th>Condition</th>
                <th>Expires</th>
                <th>Location</th>
                <th>State</th>
                <th>Inspection</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/hazmat/containers/${c.id}`} className="mono">{c.container_code}</Link>
                    <div className="small faint">{c.bucket ?? "no bucket"}</div>
                  </td>
                  <td>
                    <div className="mono small">{c.material_code}</div>
                    <div className="small dim">{c.material_name}</div>
                  </td>
                  <td className="small">
                    <div className="mono">{display(c.lot)}</div>
                    <div className="faint">{c.package_type.replaceAll("_", " ")}</div>
                  </td>
                  <td className="num small">{containerQty(c)}</td>
                  <td className="num small">{c.nominal_quantity} {c.unit_of_measure}</td>
                  <td><Badge value={c.seal_status} /></td>
                  <td><Badge value={c.condition} /></td>
                  <td className="small">
                    <div>{fmtDate(c.expires_at)}</div>
                    <Badge value={c.expiry_state} />
                  </td>
                  <td className="small dim">{display(c.location)}</td>
                  <td><Badge value={c.state} /></td>
                  <td className="small">
                    {c.inspection ? (
                      <>
                        <Badge value={c.inspection.outcome} />
                        <div className="faint">{c.inspection.measurement_method}</div>
                      </>
                    ) : (
                      <span className="faint">none</span>
                    )}
                  </td>
                </tr>
              ))}
              {ordered.length === 0 ? (
                <tr><td colSpan={11}><div className="empty">No containers recorded.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
