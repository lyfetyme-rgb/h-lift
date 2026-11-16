export function fmtDate(iso?: string | null): string {
  if (!iso) return "UNKNOWN";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "UNKNOWN";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "UNKNOWN";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "UNKNOWN";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function rel(iso?: string | null): string {
  if (!iso) return "UNKNOWN";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "UNKNOWN";
  const delta = Date.now() - t;
  const abs = Math.abs(delta);
  const mins = Math.round(abs / 60000);
  if (mins < 60) return delta >= 0 ? `${mins} min ago` : `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return delta >= 0 ? `${hrs} h ago` : `in ${hrs} h`;
  const days = Math.round(hrs / 24);
  return delta >= 0 ? `${days} d ago` : `in ${days} d`;
}

export function dayWord(days: number | null): string {
  if (days === null) return "UNKNOWN";
  if (days < 0) return `${Math.abs(days)} d overdue`;
  if (days === 0) return "today";
  return `in ${days} d`;
}

export function pct(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}%`;
}
