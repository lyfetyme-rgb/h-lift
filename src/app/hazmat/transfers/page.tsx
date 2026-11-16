import Link from "next/link";
import AccessDenied from "@/components/AccessDenied";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { authorize } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fmtDateTime, rel } from "@/lib/format";
import {
  destinationCommands,
  listPackoutCandidates,
  listTransfers,
  listTransferGroups,
} from "@/lib/transfers";
import { TransferPackout, UnusedReturn } from "@/components/TransferForm";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const principal = await currentPrincipal();
  const canTransfer = authorize(
    { principal, action: "MATERIAL_TRANSFER" },
    { record: false }
  ).permitted;
  const canOversight = authorize(
    { principal, action: "OVERSIGHT_READ" },
    { record: false }
  ).permitted;

  if (!canTransfer && !canOversight) {
    return (
      <AccessDenied
        title="Deployment pack-out"
        plane="OPERATIONAL"
        capability="material.transfer"
        principal={principal}
        decision={authorize({ principal, action: "MATERIAL_TRANSFER" }, { record: false })}
      />
    );
  }

  const source = principal?.command_id ?? null;
  const transfers = listTransfers();
  const groups = listTransferGroups();
  const candidates = canTransfer && source ? listPackoutCandidates(source) : [];
  const destinations = destinationCommands();

  return (
    <Page
      title="Task Unit deployment pack-out"
      subtitle="Pack out NSW HAZMAT lots from a Logistics Support Unit to a deploying Task Unit. Every transfer is validated against source custody, records both command IDs, and appends to the SHA-256 audit bus. Reconciled unused returns land in the return inspection queue."
    >
      <UnknownNotice>
        A pack-out requires named custody and a valid destination. Quantity UNKNOWN stays
        UNKNOWN; transfers destined for a unit that does not exist return 404.
      </UnknownNotice>

      {canTransfer ? (
        <Panel title="Pack out a lot">
          <p className="small dim" style={{ marginBottom: 12 }}>
            Select containers from{" "}
            <span className="mono">{source ?? "no command"}</span> and the deploying task unit.
          </p>
          <TransferPackout
            candidates={candidates.map((c) => ({
              id: c.id,
              container_code: c.container_code,
              material_name: c.material_name,
              lot: c.lot,
              unit_of_measure: c.unit_of_measure,
              current_quantity: c.current_quantity,
              expires_at: c.expires_at,
              state: c.state,
            }))}
            destinations={destinations as any}
            subject={principal?.subject_id ?? "UNKNOWN"}
          />
        </Panel>
      ) : (
        <div className="callout">
          <strong>Read-only view.</strong> This principal does not hold material.transfer, so no
          pack-out control is rendered.
        </div>
      )}

      <Panel title="Pack-out groups" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Source → destination</th>
                <th>Containers</th>
                <th>Deployment order</th>
                <th>Status</th>
                <th>Packed</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.transfer_group}>
                  <td className="mono small">{g.transfer_group}</td>
                  <td className="small mono">
                    {g.source_command_id} → {g.destination_command_id}
                  </td>
                  <td className="num">{g.transfer_count}</td>
                  <td className="small">{g.deployment_order ?? "UNKNOWN"}</td>
                  <td><Badge value={g.status} /></td>
                  <td className="small num">{fmtDateTime(g.packed_at)}</td>
                </tr>
              ))}
              {groups.length === 0 ? (
                <tr><td colSpan={6}><div className="empty">No pack-outs recorded.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Transfers" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transfer</th>
                <th>Container</th>
                <th>Source → destination</th>
                <th>Order</th>
                <th>Status</th>
                <th>Unused return</th>
                <th>Transferred</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="mono small">{t.id}</td>
                  <td>
                    <div className="mono">{t.container_code}</div>
                    <div className="small dim">{t.material_name}</div>
                  </td>
                  <td className="small mono">
                    {t.source_command_name} → {t.destination_command_name}
                  </td>
                  <td className="small">{t.deployment_order ?? "UNKNOWN"}</td>
                  <td><Badge value={t.status} /></td>
                  <td className="small">
                    {t.returned_unused_quantity ? (
                      <>{t.returned_unused_quantity} {t.returned_unused_unit ?? ""}</>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="small num">{t.transferred_at ? rel(t.transferred_at) : "—"}</td>
                  <td>
                    {canTransfer && t.status === "TRANSFERRED" ? (
                      <UnusedReturn transferId={t.id} currentStatus={t.status} />
                    ) : (
                      <span className="small faint">{t.status === "RETURNED_UNUSED" ? "reconciled" : "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {transfers.length === 0 ? (
                <tr><td colSpan={8}><div className="empty">No transfers recorded.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="notice">
        Unused items returned from a task unit are reconciled here and queued in{" "}
        <Link href="/hazmat/returns">Returns &amp; inspections</Link>.
      </p>
    </Page>
  );
}
