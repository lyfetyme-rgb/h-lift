/**
 * Exact decimal arithmetic for hazmat quantities.
 *
 * SQLite REAL is IEEE-754 binary floating point: `1.6 - 1.4 !== 0.2`, and
 * `0.1 + 0.2 !== 0.3`. That is unacceptable for accountable material.
 *
 * Quantities are therefore stored as canonical decimal strings and every
 * addition, subtraction and comparison here is exact: values are held as a
 * BigInt of scaled integer units plus an explicit scale (number of decimal
 * places). `5.000` is { units: 5000n, scale: 3 }; `3.400` is { 3400n, 3 }.
 *
 * Floats appear nowhere in a quantity path. The only place a ratio is turned
 * into a display percentage, it is done with integer division.
 */

export interface Dec {
  readonly units: bigint;
  readonly scale: number;
}

const TEN = 10n;

export function decOf(units: bigint, scale: number): Dec {
  return { units, scale };
}

/** Parse a canonical decimal string. Rejects exponent notation and junk. */
export function parseDec(value: string | number | null | undefined): Dec | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "number" ? String(value) : value.trim();
  if (!raw) return null;
  const m = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return null;
  const sign = m[1] === "-" ? "-" : "";
  const whole = m[2];
  const frac = m[3] ?? "";
  return { units: BigInt(sign + whole + frac), scale: frac.length };
}

export function isDec(value: unknown): value is Dec {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Dec).units === "bigint" &&
    typeof (value as Dec).scale === "number"
  );
}

function pow10(n: number): bigint {
  let out = 1n;
  for (let i = 0; i < n; i++) out *= TEN;
  return out;
}

function align(a: Dec, b: Dec): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [
    a.units * pow10(scale - a.scale),
    b.units * pow10(scale - b.scale),
    scale,
  ];
}

export function add(a: Dec, b: Dec): Dec {
  const [x, y, scale] = align(a, b);
  return { units: x + y, scale };
}

export function sub(a: Dec, b: Dec): Dec {
  const [x, y, scale] = align(a, b);
  return { units: x - y, scale };
}

export function cmp(a: Dec, b: Dec): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function eq(a: Dec, b: Dec): boolean {
  return cmp(a, b) === 0;
}

export function isZero(a: Dec): boolean {
  return a.units === 0n;
}

export function isNegative(a: Dec): boolean {
  return a.units < 0n;
}

/** Sum a list; any UNKNOWN member makes the total UNKNOWN. */
export function sum(values: (Dec | null)[]): Dec | null {
  let total: Dec = { units: 0n, scale: 0 };
  for (const v of values) {
    if (v === null) return null;
    total = add(total, v);
  }
  return total;
}

/** Render with the exact stored scale, so precision stays visible. */
export function formatDec(d: Dec | null): string {
  if (d === null) return "UNKNOWN";
  const negative = d.units < 0n;
  const abs = negative ? -d.units : d.units;
  const digits = abs.toString().padStart(d.scale + 1, "0");
  const whole = d.scale === 0 ? digits : digits.slice(0, digits.length - d.scale);
  const frac = d.scale === 0 ? "" : "." + digits.slice(digits.length - d.scale);
  return `${negative ? "-" : ""}${whole}${frac}`;
}

export function formatQty(d: Dec | null, uom: string): string {
  return d === null ? "UNKNOWN" : `${formatDec(d)} ${uom}`;
}

/** part/whole as a percentage with one decimal, using integer arithmetic. */
export function percentOf(part: Dec | null, whole: Dec | null): string {
  if (part === null || whole === null || whole.units === 0n) return "UNKNOWN";
  // tenths of a percent
  const tenths = (part.units * 1000n) / whole.units;
  const negative = tenths < 0n;
  const abs = negative ? -tenths : tenths;
  return `${negative ? "-" : ""}${abs / 10n}.${abs % 10n}%`;
}
