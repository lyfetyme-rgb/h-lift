import Link from "next/link";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { inventoryByMaterial } from "@/lib/repo";
import { bucketText, qtyText } from "@/lib/hazmat-display";
import { display } from "@/lib/status";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  ISSUED: "Issued / in custody",
  RETURN_HOLD: "Return hold",
  QUARANTINED: "Quarantined",
  EXPIRED: "Expired",
  DISPOSITION_PENDING: "Disposition pending",
  DISPOSED: "Disposed",
};

export default function InventoryPage() {
  const inventory = inventoryByMaterial();

  return (
    <Page
      title="Inventory & accountability buckets"
      subtitle="Inventory quantity is not one float. Each material carries separate buckets, and each bucket is a sum of container quantities in that bucket — never across different units of measure."
    >
      <UnknownNotice>
        current_quantity is NULL when the remainder was never measured. The bucket then reports an
        unknown count instead of a number. Declared quantities stay on the inspection record until an
        inspector measures them.
      </UnknownNotice>

      {inventory.map((row) => {
        const m = row.material;
        const uom = m.unit_of_measure;
        return (
          <Panel
            key={m.id}
            title={
              <span>
                <span className="mono">{m.material_code}</span>{" "}
                {m.name} <Badge value={m.status} />
              </span>
            }
            actions={<Link className="small" href="/hazmat/containers">containers →</Link>}
          >
            <div className="grid cols-2" style={{ marginBottom: 14 }}>
              <table>
                <tbody>
                  <tr><td>NSN</td><td className="mono">{display(m.nsn)}</td></tr>
                  <tr><td>Manufacturer</td><td>{display(m.manufacturer)}</td></tr>
                  <tr><td>Part number</td><td className="mono">{display(m.manufacturer_part_no)}</td></tr>
                  <tr><td>Unit of issue</td><td className="mono">{m.unit_of_issue}</td></tr>
                  <tr><td>Package</td><td>{display(m.package_description)}</td></tr>
                  <tr><td>Measurement basis</td><td><Badge value={m.measurement_basis} /></td></tr>
                </tbody>
              </table>
              <table>
                <tbody>
                  <tr><td>Unit of measure</td><td className="mono">{uom}</td></tr>
                  <tr><td>Nominal per container</td><td className="num">{m.nominal_quantity_per_container} {uom}</td></tr>
                  <tr><td>Partial-container accounting</td><td>{m.partial_allowed ? "permitted" : "not permitted"}</td></tr>
                  <tr><td>Hazard class</td><td>{display(m.hazard_class)}</td></tr>
                  <tr><td>Storage compatibility</td><td>{display(m.storage_compatibility)}</td></tr>
                  <tr><td>Shelf life</td><td>{m.shelf_life_days == null ? "UNKNOWN" : `${m.shelf_life_days} d`}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Quantity</th>
                    <th>Containers</th>
                    <th>Unknown quantities</th>
                  </tr>
                </thead>
                <tbody>
                  {row.buckets.map((b) => (
                    <tr key={b.key}>
                      <td><Badge value={b.key} /> <span className="small dim">{BUCKET_LABEL[b.key]}</span></td>
                      <td className="num">{bucketText(b, uom)}</td>
                      <td className="num">{b.count}</td>
                      <td className="num">{b.unknownCount ? `${b.unknownCount} UNKNOWN` : "0"}</td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>On hand (all non-disposed)</strong></td>
                    <td className="num">
                      <strong>{qtyText(row.onHand, uom)}</strong>
                      {row.onHandUnknown ? <span className="faint"> +{row.onHandUnknown} UNKNOWN</span> : null}
                    </td>
                    <td className="num">{row.containers.filter((c) => c.bucket !== "DISPOSED").length}</td>
                    <td className="num">{row.onHandUnknown ? `${row.onHandUnknown} UNKNOWN` : "0"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th>Container</th>
                    <th>Lot</th>
                    <th>Current</th>
                    <th>Nominal</th>
                    <th>Seal</th>
                    <th>Condition</th>
                    <th>State</th>
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {row.containers.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/hazmat/containers/${c.id}`} className="mono">{c.container_code}</Link></td>
                      <td className="mono small">{display(c.lot)}</td>
                      <td className="num small">{qtyText(c.current, c.unit_of_measure)}</td>
                      <td className="num small">{qtyText(c.nominal, c.unit_of_measure)}</td>
                      <td><Badge value={c.seal_status} /></td>
                      <td><Badge value={c.condition} /></td>
                      <td><Badge value={c.state} /></td>
                      <td><Badge value={c.expiry_state} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}

      {inventory.length === 0 ? <Panel><div className="empty">No materials recorded.</div></Panel> : null}

      <p className="dim small">
        Units are never combined. 20 GAL of hydraulic fluid and 192 OZ of lubricant are different
        dimensions and appear on separate rows by construction.
      </p>
    </Page>
  );
}
