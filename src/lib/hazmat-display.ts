import type { BucketCell, Row } from "./repo";
import { Dec, formatDec } from "./qty";

/** A quantity plus its unit, or UNKNOWN. Never rounds or infers. */
export function qtyText(q: Dec | null | undefined, uom: string): string {
  return q === null || q === undefined ? "UNKNOWN" : `${formatDec(q)} ${uom}`;
}

/**
 * Render a bucket without pretending an unknown remainder is zero.
 * If every container in the bucket has an unknown quantity the cell reads
 * "N × UNKNOWN"; a partial total is shown with an explicit "+N UNKNOWN".
 */
export function bucketText(b: BucketCell | undefined, uom: string): string {
  if (!b || b.count === 0) return "—";
  if (b.unknownCount >= b.count) return `${b.count} × UNKNOWN`;
  const known = b.quantity ? formatDec(b.quantity) : "0";
  return b.unknownCount ? `${known} ${uom} +${b.unknownCount} UNKNOWN` : `${known} ${uom}`;
}

/** Current container quantity, preserving an unmeasured container as UNKNOWN. */
export function containerQty(c: Row): string {
  return qtyText(c.current as Dec | null, c.unit_of_measure);
}

export function inspectionMark(value: number | null | undefined, inverted = false): string {
  if (value === null || value === undefined) return "UNKNOWN";
  const ok = inverted ? value === 0 : value === 1;
  return ok ? "PASS" : "FAIL";
}
