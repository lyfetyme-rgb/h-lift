import type { ReactNode } from "react";
import { display, tone } from "@/lib/status";

export function Badge({ value, title }: { value?: string | null; title?: string }) {
  const v = display(value);
  return (
    <span className={`badge b-${tone(v)}`} title={title ?? v}>
      {v}
    </span>
  );
}

export function Page({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: subtitle ? 2 : 16 }}>
        <h1>{title}</h1>
        <span className="spacer" />
        {actions}
      </div>
      {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      {children}
    </>
  );
}

export function Kpi({
  label,
  value,
  note,
  severity,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  severity?: "ok" | "warn" | "bad" | "unknown";
}) {
  return (
    <div className={`kpi ${severity ?? ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="note">{note ?? "\u00a0"}</div>
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  flush,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={`panel ${flush ? "flush" : ""}`}>
      {(title || actions) && (
        <div className="panel-head" style={flush ? { padding: "12px 16px 0", marginBottom: 8 } : undefined}>
          {title ? <h2>{title}</h2> : null}
          <span className="spacer" />
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function UnknownNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="callout">
      <strong>Unknowns are preserved, not guessed.</strong>{" "}
      {children ??
        "Values shown as UNKNOWN were not provided by the source system. Values shown as UNVERIFIED have been recorded but not independently confirmed."}
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend" style={{ marginBottom: 16 }}>
      <span><i className="dot ok" /> verified / approved</span>
      <span><i className="dot info" /> in progress</span>
      <span><i className="dot warn" /> pending / due</span>
      <span><i className="dot bad" /> failed / expired / blocked</span>
      <span><i className="dot unknown" /> unknown / unverified (dashed border)</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Bar({ value, total, kind }: { value: number; total: number; kind?: "ok" | "warn" | "bad" }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`bar ${kind ?? ""}`} title={`${value} / ${total}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  placeholder,
  step,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  step?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
      />
    </div>
  );
}
