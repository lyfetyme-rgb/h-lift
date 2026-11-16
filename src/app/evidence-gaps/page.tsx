import Link from "next/link";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { evidenceGaps } from "@/lib/repo";
import { UNKNOWN, UNVERIFIED } from "@/lib/status";

export const dynamic = "force-dynamic";

export default function EvidenceGapsPage() {
  const gaps = evidenceGaps();
  const byKind = gaps.reduce<Record<string, number>>((acc, g) => {
    acc[g.kind] = (acc[g.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Page
      title="Evidence gaps"
      subtitle="Every requirement is checked against the evidence actually linked to it: verified tests, security and policy records, merged code, built artifacts, approvals and validations. A gap is reported; it is never silently treated as satisfied."
    >
      <UnknownNotice>
        Gaps with status {UNKNOWN} mean no usable record exists. Gaps with {UNVERIFIED} mean a
        record exists but has not been independently confirmed. Neither is counted as evidence.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="kpi bad"><div className="label">Total gaps</div><div className="value">{gaps.length}</div><div className="note">across requirements and hazmat</div></div>
        <div className="kpi unknown"><div className="label">Unknown</div><div className="value">{gaps.filter((g) => g.status === UNKNOWN).length}</div><div className="note">no record</div></div>
        <div className="kpi warn"><div className="label">Unverified</div><div className="value">{gaps.filter((g) => g.status === UNVERIFIED).length}</div><div className="note">record exists, unconfirmed</div></div>
        <div className="kpi bad"><div className="label">Failed</div><div className="value">{gaps.filter((g) => g.status === "FAILED").length}</div><div className="note">evidence contradicts requirement</div></div>
      </div>

      <Panel title="Gaps by stage">
        <div className="grid kpis">
          {Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([kind, n]) => (
            <div className="kpi" key={kind}>
              <div className="label">{kind.replaceAll("_", " ")}</div>
              <div className="value">{n}</div>
              <div className="note">
                {gaps.filter((g) => g.kind === kind && g.status === UNKNOWN).length} unknown
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`Gap register (${gaps.length})`} flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Stage</th><th>Record</th><th>Status</th><th>Detail</th><th /></tr>
            </thead>
            <tbody>
              {gaps.map((g) => (
                <tr key={g.id}>
                  <td><span className="badge b-muted">{g.kind.replaceAll("_", " ")}</span></td>
                  <td>
                    <div className="mono">{g.code}</div>
                    <div className="small dim">{g.name}</div>
                  </td>
                  <td><Badge value={g.status} /></td>
                  <td className="small dim" style={{ maxWidth: 520 }}>{g.detail}</td>
                  <td className="actions"><Link href={g.link} className="small">open →</Link></td>
                </tr>
              ))}
              {gaps.length === 0 ? (
                <tr><td colSpan={5}><div className="empty">No evidence gaps. Every requirement has linked, verified records.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
