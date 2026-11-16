import Link from "next/link";
import AccessDenied from "@/components/AccessDenied";
import RecommendationDecision from "@/components/RecommendationDecision";
import { Badge, Kpi, Page, Panel, UnknownNotice } from "@/components/ui";
import { authorize, canRead } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import {
  effectivenessSummary,
  listMetrics,
  listRecommendations,
} from "@/lib/effectiveness";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ImprovementPage() {
  const principal = await currentPrincipal();
  const view = authorize({ principal, action: "OVERSIGHT_READ" }, { record: false });
  if (!view.permitted) {
    return (
      <AccessDenied
        title="Effectiveness loop"
        plane="ASSURANCE"
        capability="oversight.read"
        principal={principal}
        decision={view}
      />
    );
  }

  const canDecide = canRead(principal, "EXCEPTION_DECIDE");
  const summary = effectivenessSummary();
  const metrics = listMetrics(24);
  const recommendations = listRecommendations();

  return (
    <Page
      title="Effectiveness & assurance loop"
      subtitle="H-LIFT measures decisions, inspections, denials, incidents and findings, proposes tuning recommendations, and a named human decides. Nothing is applied automatically."
    >
      <UnknownNotice>
        Recommendations are proposals, not policy. Accepting one records a decision with its
        evidence and appends to the audit bus; the underlying rule changes only through a normal
        change-control process.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Recommendations" value={summary.totalRec} note={`${summary.proposed} proposed`} />
        <Kpi label="Proposed" value={summary.proposed} severity={summary.proposed ? "warn" : "ok"} note="awaiting a human decision" />
        <Kpi label="Approved" value={summary.approved} severity="ok" note="decided, not auto-applied" />
        <Kpi label="Metrics tracked" value={summary.latest.length} note="recomputed from records" />
      </div>

      <div className="actions-row" style={{ marginBottom: 16 }}>
        {canDecide ? (
          <form action="/api/improvement" method="POST">
            <button className="small primary" type="submit">Recompute effectiveness</button>
          </form>
        ) : null}
        <Link className="small" href="/audit">audit bus →</Link>
      </div>

      <Panel title="Latest metrics" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Metric</th><th>Value</th><th>Sample</th><th>Context</th><th>Computed</th></tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td className="mono small">{m.metric}</td>
                  <td className="num">{typeof m.value === "number" ? m.value.toFixed(3) : m.value}</td>
                  <td className="num">{m.sample_size}</td>
                  <td className="small mono faint" style={{ maxWidth: 260 }}>{m.context}</td>
                  <td className="small num">{fmtDateTime(m.computed_at)}</td>
                </tr>
              ))}
              {metrics.length === 0 ? (
                <tr><td colSpan={5}><div className="empty">No metrics computed yet. Click Recompute.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Tuning recommendations" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Recommendation</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Evidence</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((r) => (
                <tr key={r.id}>
                  <td className="small mono">{r.category}</td>
                  <td>
                    <div>{r.title}</div>
                    <div className="small dim" style={{ maxWidth: 420 }}>{r.detail}</div>
                  </td>
                  <td><Badge value={r.severity} /></td>
                  <td><Badge value={r.status} /></td>
                  <td className="small mono faint" style={{ maxWidth: 240 }}>{r.evidence}</td>
                  <td>
                    {r.status === "PROPOSED" ? (
                      <RecommendationDecision id={r.id} canDecide={canDecide} />
                    ) : (
                      <span className="small">
                        {r.decision_note ? <div className="faint">{r.decision_note}</div> : null}
                        <div className="faint">by {r.decided_by ?? "UNKNOWN"}</div>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {recommendations.length === 0 ? (
                <tr><td colSpan={6}><div className="empty">No recommendations yet. Click Recompute.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
