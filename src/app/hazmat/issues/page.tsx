import Link from "next/link";
import { Badge, Kpi, Page, Panel, UnknownNotice } from "@/components/ui";
import { hazmatSummary, listIssueRequests, listTransactions } from "@/lib/repo";
import { qtyText } from "@/lib/hazmat-display";
import { isZero } from "@/lib/qty";
import { fmtDateTime } from "@/lib/format";
import { display } from "@/lib/status";

export const dynamic = "force-dynamic";

export default function IssuesPage() {
  const requests = listIssueRequests();
  const transactions = listTransactions();
  const summary = hazmatSummary();
  const openRequests = requests.filter((r) => !["ISSUED", "CANCELLED", "UNKNOWN"].includes(r.state));

  return (
    <Page
      title="Issue requests & accountable transactions"
      subtitle="A request authorizes packages; a transaction records what actually left the store, what was consumed, what came back and what was disposed. Variance is derived, never stored, so it cannot drift."
    >
      <UnknownNotice>
        An open issue with no reported consumption keeps consumed/returned/disposed as NULL. Its
        variance is UNKNOWN, not zero. Variance is issued − consumed − returned − disposed.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Issue requests" value={requests.length} note={`${openRequests.length} not yet issued`} severity={openRequests.length ? "warn" : "ok"} />
        <Kpi label="Transactions" value={transactions.length} note="all recorded movements" />
        <Kpi label="Open transactions" value={transactions.filter((t) => t.status === "OPEN").length} severity="warn" note="consumption not reported" />
        <Kpi label="Variances" value={summary.varianceCount} severity={summary.varianceCount ? "bad" : "ok"} note="not written off" />
        <Kpi label="Unverified returns" value={summary.unverifiedTransactions} severity={summary.unverifiedTransactions ? "unknown" : "ok"} note="declared or estimated" />
      </div>

      <Panel title={`Issue requests (${requests.length})`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Material</th>
                <th>Authorized</th>
                <th>State</th>
                <th>Requested by</th>
                <th>Authorized by</th>
                <th>Created</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="mono small">{r.request_code}</td>
                  <td>
                    <div className="mono small">{r.material_code}</div>
                    <div className="small dim">{r.material_name}</div>
                  </td>
                  <td className="num small">
                    {r.authorized_containers == null ? "UNKNOWN" : `${r.authorized_containers} × ${r.package_description}`}
                    <div className="faint">{qtyText(r.authorized, r.unit_of_measure)}</div>
                  </td>
                  <td><Badge value={r.state} /></td>
                  <td className="small">{display(r.requested_by)}</td>
                  <td className="small">{display(r.authorized_by)}</td>
                  <td className="num small">{fmtDateTime(r.created_at)}</td>
                  <td className="small dim" style={{ maxWidth: 280 }}>{display(r.notes)}</td>
                </tr>
              ))}
              {requests.length === 0 ? (
                <tr><td colSpan={8}><div className="empty">No issue requests.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`Transactions (${transactions.length})`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Container / material</th>
                <th>Issued</th>
                <th>Consumed</th>
                <th>Returned</th>
                <th>Disposed</th>
                <th>Variance</th>
                <th>Basis / UoM</th>
                <th>Status</th>
                <th>Issued</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const variance = t.variance !== null && !isZero(t.variance);
                return (
                  <tr key={t.id}>
                    <td className="mono small">{t.txn_code}</td>
                    <td>
                      <Link href={`/hazmat/containers/${t.container_id}`} className="mono small">{t.container_code}</Link>
                      <div className="small dim">{t.material_name}</div>
                      <div className="small faint">{t.package_description}</div>
                    </td>
                    <td className="num small">{qtyText(t.issued, t.unit_of_measure)}</td>
                    <td className="num small">{qtyText(t.consumed, t.unit_of_measure)}</td>
                    <td className="num small">{qtyText(t.returned, t.unit_of_measure)}</td>
                    <td className="num small">{qtyText(t.disposed, t.unit_of_measure)}</td>
                    <td className="num small">
                      {t.variance === null ? <Badge value="UNKNOWN" /> : (
                        <span style={{ color: variance ? "var(--bad)" : undefined }}>
                          {qtyText(t.variance, t.unit_of_measure)}
                          {variance ? <div className="faint">unaccounted</div> : null}
                        </span>
                      )}
                    </td>
                    <td className="small">
                      <Badge value={t.measurement_basis} />
                      <div className="faint mono">{t.unit_of_measure}</div>
                    </td>
                    <td><Badge value={t.status} /></td>
                    <td className="small">
                      {display(t.issued_to)}
                      <div className="faint">{fmtDateTime(t.issued_at)}</div>
                    </td>
                  </tr>
                );
              })}
              {transactions.length === 0 ? (
                <tr><td colSpan={10}><div className="empty">No transactions.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
