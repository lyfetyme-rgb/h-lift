import Link from "next/link";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { missionSummaries } from "@/lib/repo";
import { pct } from "@/lib/format";

export const dynamic = "force-dynamic";

const STAGES = [
  "Mission requirement",
  "Operational need",
  "Capability",
  "System requirement",
  "Design component",
  "Engineering issue",
  "Branch / PR",
  "Evidence",
  "Artifact",
  "Approval",
  "Validation",
  "Release",
];

export default function TraceabilityPage() {
  const missions = missionSummaries();

  return (
    <Page
      title="Requirements-to-delivery traceability"
      subtitle="One chain per mission requirement. Each stage shows the linked records and their verification state; empty or unconfirmed stages appear as gaps rather than assumed complete."
    >
      <UnknownNotice />

      <Panel title="Chain stages">
        <div className="small dim" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {STAGES.map((s, i) => (
            <span key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              {i > 0 ? <span className="faint">→</span> : null}
              <span className="badge b-muted">{s}</span>
            </span>
          ))}
        </div>
      </Panel>

      <Panel title="Missions" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mission requirement</th>
                <th>Mission</th>
                <th>Status</th>
                <th>Chain</th>
                <th>Issues</th>
                <th>Evidence</th>
                <th>Approvals</th>
                <th>Gaps</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {missions.map((mr) => (
                <tr key={mr.id}>
                  <td>
                    <Link href={`/traceability/${mr.id}`}><strong>{mr.code}</strong></Link>
                    <div className="small dim" style={{ maxWidth: 360 }}>{mr.title}</div>
                  </td>
                  <td className="small">{mr.mission}</td>
                  <td><Badge value={mr.status} /></td>
                  <td className="small dim nowrap">
                    {mr.counts.needs} needs · {mr.counts.caps} caps · {mr.counts.sysReqs} sys
                  </td>
                  <td className="num">{mr.counts.issuesDone}/{mr.counts.issues}</td>
                  <td className="num">{pct(mr.counts.evidenceVerified, mr.counts.evidence)}</td>
                  <td className="num">
                    {mr.counts.approvalsPending > 0 ? (
                      <span className="badge b-warn">{mr.counts.approvalsPending} pending</span>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td className="num">{mr.gapCount ? <span className="badge b-bad">{mr.gapCount}</span> : <span className="badge b-ok">0</span>}</td>
                  <td className="actions"><Link href={`/traceability/${mr.id}`}>Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
