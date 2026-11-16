import { UNKNOWN } from "./status";
import { formatDec } from "./qty";
import type { weeklyData } from "./repo";

type Weekly = ReturnType<typeof weeklyData>;
const anyD = (v: unknown) => v as any; // eslint-disable-line @typescript-eslint/no-explicit-any

function cell(bucket: { quantity: unknown; unknownCount: number; count: number }, uom: string): string {
  if (bucket.count === 0) return "0";
  if (bucket.unknownCount >= bucket.count) return `${bucket.count} × UNKNOWN`;
  const known = bucket.quantity ? formatDec(bucket.quantity as any) : "0";
  return bucket.unknownCount ? `${known} ${uom} +${bucket.unknownCount} UNKNOWN` : `${known} ${uom}`;
}

/**
 * H-LIFT weekly status format (HLIFT-WSR v1).
 *
 * Sections are fixed so the report can be diffed week to week. This is the
 * v1 template; if the programme has a mandated layout, replace the renderer
 * here — the data contract (weeklyData) stays the same.
 */
export function renderWeeklyMarkdown(d: Weekly): string {
  const r = d.report;
  const ov = d.overview;
  const hz = ov.hazmat;
  const lines: string[] = [];

  lines.push(`# ${r.title} — ${r.week}`);
  lines.push("");
  lines.push(`- **Format:** ${r.format}`);
  lines.push(`- **Reporting period:** ${r.period_start} → ${r.period_end}`);
  lines.push(`- **Generated:** ${r.generated_at}`);
  lines.push(`- **Programme:** ${r.store}`);
  lines.push(`- **Delta vs previous report:** ${r.delta_vs_previous === UNKNOWN ? "UNKNOWN (no stored prior report)" : r.delta_vs_previous}`);
  lines.push("");

  lines.push("## 1. Mission and requirements flow");
  lines.push("");
  lines.push(`- Mission requirements: ${ov.requirements.missions}`);
  lines.push(`- Operational needs: ${ov.requirements.needs}`);
  lines.push(`- Capabilities: ${ov.requirements.capabilities}`);
  lines.push(`- System requirements: ${ov.requirements.system}`);
  lines.push("");
  lines.push("| Requirement status | Count |");
  lines.push("|---|---:|");
  for (const row of d.requirements) lines.push(`| ${row.status} | ${row.n} |`);
  lines.push("");

  lines.push("## 2. Delivery pipeline");
  lines.push("");
  lines.push(`- Issues: ${ov.delivery.issues} total, ${ov.delivery.done} done, ${ov.delivery.inProgress} in progress`);
  lines.push(`- Open pull requests: ${ov.delivery.openPrs}; failing checks: ${ov.delivery.failingChecks}`);
  lines.push(`- Build artifacts: ${ov.delivery.artifacts}; unknown status: ${ov.delivery.unknownArtifacts}`);
  lines.push("");
  lines.push("| Issue status | Count |");
  lines.push("|---|---:|");
  for (const row of d.issues) lines.push(`| ${row.status} | ${row.n} |`);
  lines.push("");

  lines.push("## 3. Hazmat: containers, quantities and inspections");
  lines.push("");
  lines.push(`- Materials: ${hz.materials}; containers: ${hz.containers}`);
  lines.push(`- Available ${hz.available} · reserved ${hz.reserved} · issued ${hz.issued} · return hold ${hz.returnHold} · quarantined ${hz.quarantined} · expired ${hz.expired} · disposition pending ${hz.dispositionPending} · disposed ${hz.disposed}`);
  lines.push(`- Quantities UNKNOWN: ${hz.unknownQuantity} container(s); expiry UNKNOWN: ${hz.unknownExpiry}`);
  lines.push(`- Returns awaiting inspection: ${hz.inspectionsPending}`);
  lines.push(`- Quantity variances recorded: ${hz.varianceCount}; unverified return quantities: ${hz.unverifiedTransactions}`);
  lines.push(`- Quarterly checks due: ${hz.checksDue}; overdue: ${hz.checksOverdue}; unknown: ${hz.checksUnknown}`);
  lines.push("");
  lines.push("Accountability by material (quantities are never summed across units of measure):");
  lines.push("");
  lines.push("| Material | UoM | On hand | Available | Reserved | Issued | Return hold | Quarantined | Expired | Disposition | Disposed |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of d.inventory) {
    const b = (key: string) => cell(anyD(row.buckets.find((x: any) => x.key === key)), row.material.unit_of_measure);
    lines.push(
      `| ${row.material.material_code} ${row.material.name} | ${row.material.unit_of_measure} | ${cell({ quantity: row.onHand, unknownCount: row.onHandUnknown, count: row.containers.length }, row.material.unit_of_measure)} | ${b("AVAILABLE")} | ${b("RESERVED")} | ${b("ISSUED")} | ${b("RETURN_HOLD")} | ${b("QUARANTINED")} | ${b("EXPIRED")} | ${b("DISPOSITION_PENDING")} | ${b("DISPOSED")} |`
    );
  }
  lines.push("");
  if (d.returns.length) {
    lines.push("| Container | Material | Issued | Consumed | Returned | Variance | Status |");
    lines.push("|---|---|---:|---:|---:|---:|---|");
    for (const t of d.returns) {
      const v =
        t.variance === null
          ? "UNKNOWN"
          : `${formatDec(t.variance)} ${t.unit_of_measure}`;
      lines.push(
        `| ${t.container_code} | ${t.material_name} | ${formatDec(t.issued)} ${t.unit_of_measure} | ${t.consumed === null ? "UNKNOWN" : `${formatDec(t.consumed)} ${t.unit_of_measure}`} | ${formatDec(t.returned)} ${t.unit_of_measure} | ${v} | ${t.status} |`
      );
    }
    lines.push("");
  }
  lines.push("### Returns held for inspection");
  lines.push("");
  const pending = d.inspections.filter((i) => i.pending);
  if (!pending.length) {
    lines.push("- None.");
  } else {
    for (const i of pending) {
      lines.push(
        `- ${i.container_code} (${i.material_name}): ${i.completed.confirmed}/8 checks confirmed, ${i.completed.unknown} UNKNOWN — measured ${i.measured ? `${formatDec(i.measured)} ${i.unit_of_measure}` : "UNKNOWN"}.`
      );
    }
  }
  lines.push("");
  lines.push("### Quarterly checks needing action");
  lines.push("");
  if (!d.checks.overdue.length && !d.checks.due.length && !d.checks.unknown.length) {
    lines.push("- None.");
  } else {
    for (const c of [...d.checks.overdue, ...d.checks.due, ...d.checks.unknown]) {
      lines.push(`- ${c.container_code} ${c.quarter}: ${c.status} (due ${c.due_at.slice(0, 10)})`);
    }
  }
  lines.push("");

  lines.push("## 4. Conflicts, sync and offline status");
  lines.push("");
  lines.push(`- Open conflicts: ${d.conflicts.length}`);
  lines.push(`- Sync nodes needing attention: ${d.nodes.filter((n) => n.status !== "synced").length}`);
  for (const n of d.nodes) {
    lines.push(`  - ${n.name}: ${n.status}${n.pending_changes == null ? "" : `, ${n.pending_changes} pending`}`);
  }
  lines.push("");

  lines.push("## 5. HITL exceptions and cybersecurity");
  lines.push("");
  lines.push(`- Open HITL exceptions: ${d.hitl.length}`);
  for (const h of d.hitl) lines.push(`  - ${h.code}: ${h.title} (${h.severity})`);
  lines.push(`- Open security events: ${d.security.length}`);
  for (const s of d.security) lines.push(`  - ${s.code}: ${s.title} (${s.severity})`);
  lines.push("");

  lines.push("## 6. Blockers and evidence gaps");
  lines.push("");
  lines.push(`- Open blockers: ${d.blockers.length}`);
  for (const b of d.blockers) lines.push(`  - ${b.code}: ${b.title} — owner ${b.owner ?? UNKNOWN}`);
  lines.push(`- Evidence gaps: ${d.evidence_gaps.total} (unknown ${ov.evidenceGaps.unknown}, unverified ${ov.evidenceGaps.unverified}, failed ${ov.evidenceGaps.failed})`);
  lines.push("");
  if (d.evidence_gaps.list.length) {
    lines.push("| Stage | Record | Status | Detail |");
    lines.push("|---|---|---|---|");
    for (const g of d.evidence_gaps.list) lines.push(`| ${g.kind} | ${g.code} | ${g.status} | ${g.detail} |`);
    lines.push("");
  }

  lines.push("## 7. Decisions needed this week");
  lines.push("");
  if (!d.approvals.length && !d.hitl.length && !pending.length && !hz.varianceCount) {
    lines.push("- None.");
  } else {
    for (const a of d.approvals) lines.push(`- Approve/reject ${a.environment} deployment of ${a.artifact_name} ${a.artifact_version} (approval ${a.id}).`);
    for (const h of d.hitl) lines.push(`- Decide HITL exception ${h.code}: ${h.title}.`);
    if (pending.length) lines.push(`- Complete ${pending.length} return inspection(s) before any container re-enters available stock.`);
    if (hz.varianceCount) lines.push(`- Resolve ${hz.varianceCount} recorded quantity variance(s); they have not been written off.`);
  }
  lines.push("");

  lines.push("## 8. Next week");
  lines.push("");
  lines.push("- Owner narrative: UNKNOWN (not provided).");
  lines.push("- Derived focus (from open records above):");
  if (d.blockers.length) lines.push("  - Clear blockers named in section 6.");
  if (d.checks.overdue.length) lines.push("  - Complete overdue quarterly checks.");
  if (pending.length) lines.push("  - Obtain inspector sign-off for held returns.");
  if (hz.varianceCount) lines.push("  - Investigate quantity variances and record disposition.");
  if (hz.dispositionPending) lines.push("  - Complete disposition of containers awaiting disposal decision.");
  if (d.evidence_gaps.total) lines.push("  - Close evidence gaps or record an explicit HITL exception.");
  if (!d.blockers.length && !d.checks.overdue.length && !pending.length && !hz.varianceCount && !hz.dispositionPending && !d.evidence_gaps.total) lines.push("  - None derived.");
  lines.push("");

  return lines.join("\n");
}
