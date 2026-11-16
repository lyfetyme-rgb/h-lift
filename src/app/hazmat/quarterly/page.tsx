import Link from "next/link";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { quarterlyChecks } from "@/lib/repo";
import { dayWord, fmtDate } from "@/lib/format";
import { daysUntil } from "@/lib/status";

export const dynamic = "force-dynamic";

export default function QuarterlyPage() {
  const checks = quarterlyChecks();
  const overdue = checks.filter((c) => c.status === "OVERDUE");
  const due = checks.filter((c) => c.status === "DUE");
  const unknown = checks.filter((c) => c.status === "UNKNOWN");

  return (
    <Page
      title="Quarterly usage checks"
      subtitle="Quarterly checks are scheduled per container. Due dates come from the stored schedule; overdue state is computed from the current date, while a check with no schedule or result remains UNKNOWN."
    >
      <UnknownNotice>
        A check with no recorded inspector or result keeps its UNKNOWN status, even when the due date
        has passed.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="kpi bad"><div className="label">Overdue</div><div className="value">{overdue.length}</div><div className="note">breach of inspection cadence</div></div>
        <div className="kpi warn"><div className="label">Due</div><div className="value">{due.length}</div><div className="note">upcoming or current quarter</div></div>
        <div className="kpi unknown"><div className="label">Unknown</div><div className="value">{unknown.length}</div><div className="note">no reliable schedule</div></div>
        <div className="kpi ok"><div className="label">Complete</div><div className="value">{checks.filter((c) => c.status === "COMPLETE").length}</div><div className="note">with recorded result</div></div>
      </div>

      <Panel title="Check queue" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Container</th>
                <th>Material</th>
                <th>State</th>
                <th>Quarter</th>
                <th>Due</th>
                <th>Completed</th>
                <th>Inspector</th>
                <th>Result</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => {
                const d = daysUntil(c.due_at);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/hazmat/containers/${c.container_id}`} className="mono">{c.container_code}</Link>
                      <div className="small faint">{c.unit_of_measure}</div>
                    </td>
                    <td className="small dim">{c.material_name}</td>
                    <td><Badge value={c.container_state} /></td>
                    <td className="mono small">{c.quarter}</td>
                    <td className="num small">
                      {fmtDate(c.due_at)}
                      <div className="faint">{c.status === "COMPLETE" ? "—" : dayWord(d)}</div>
                    </td>
                    <td className="num small">{c.completed_at ? fmtDate(c.completed_at) : "UNKNOWN"}</td>
                    <td className="small">{c.inspector ?? "UNKNOWN"}</td>
                    <td className="small">{c.result ?? "UNKNOWN"}</td>
                    <td><Badge value={c.status} /></td>
                  </tr>
                );
              })}
              {checks.length === 0 ? (
                <tr><td colSpan={9}><div className="empty">No checks scheduled.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
