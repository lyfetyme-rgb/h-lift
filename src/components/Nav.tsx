"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavCounts {
  conflicts: number;
  hitl: number;
  approvals: number;
  blockers: number;
  gaps: number;
  sync: number;
  checks: number;
  returns: number;
  incidents: number;
  vulns: number;
  findings: number;
  poam: number;
  audit: number;
}

interface NavItem {
  href: string;
  label: string;
  count?: keyof NavCounts;
}

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Mission & governance",
    items: [
      { href: "/", label: "Overview" },
      { href: "/traceability", label: "Traceability" },
      { href: "/weekly", label: "Weekly status" },
      { href: "/approvals", label: "Approvals", count: "approvals" },
      { href: "/hitl", label: "HITL exceptions", count: "hitl" },
      { href: "/conflicts", label: "Conflicts", count: "conflicts" },
      { href: "/blockers", label: "Blockers", count: "blockers" },
      { href: "/evidence-gaps", label: "Evidence gaps", count: "gaps" },
      { href: "/sync", label: "Offline sync", count: "sync" },
    ],
  },
  {
    label: "Operational plane",
    items: [
      { href: "/hazmat", label: "Control overview" },
      { href: "/hazmat/inventory", label: "Inventory & buckets" },
      { href: "/hazmat/containers", label: "Containers" },
      { href: "/hazmat/issues", label: "Issue & transactions" },
      { href: "/hazmat/returns", label: "Returns & inspections", count: "returns" },
      { href: "/hazmat/transfers", label: "Pack-out & transfers" },
      { href: "/hazmat/lifecycle", label: "Lifecycle ledger" },
      { href: "/hazmat/quarterly", label: "Quarterly checks", count: "checks" },
      { href: "/hazmat/expirations", label: "Expirations" },
    ],
  },
  {
    label: "Cybersecurity plane",
    items: [
      { href: "/security", label: "SOC console", count: "incidents" },
      { href: "/security/incidents", label: "Incidents" },
      { href: "/security/vulnerabilities", label: "Vulnerabilities", count: "vulns" },
    ],
  },
  {
    label: "Assurance plane",
    items: [
      { href: "/assurance", label: "RMF posture", count: "findings" },
      { href: "/assurance/controls", label: "Controls & evidence" },
      { href: "/assurance/findings", label: "Findings & POA&M", count: "poam" },
      { href: "/improvement", label: "Effectiveness loop" },
    ],
  },
  {
    label: "Trusted layer",
    items: [
      { href: "/identity", label: "Identity & capabilities" },
      { href: "/audit", label: "Audit bus", count: "audit" },
    ],
  },
];

export default function Nav({ counts, itAdmin = false }: { counts: NavCounts; itAdmin?: boolean }) {
  const pathname = usePathname();
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));

  const activeFor = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname === href) return true;
    if (!pathname.startsWith(href + "/")) return false;
    // A longer, more specific nav entry wins, so /security and
    // /security/incidents are never highlighted at the same time.
    return !hrefs.some(
      (other) => other !== href && other.startsWith(href + "/") && pathname.startsWith(other)
    );
  };

  const itGroup = itAdmin
    ? {
        label: "IT administration",
        items: [
          { href: "/it", label: "IT console" },
          { href: "/integrations", label: "Integrations" },
        ],
      }
    : null;

  return (
    <nav className="nav">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="nav-group">{group.label}</div>
          {group.items.map((item) => {
            const active = activeFor(item.href);
            const n = item.count ? counts[item.count] : 0;
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <span>{item.label}</span>
                {n > 0 ? <span className="count badge b-warn">{n}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
      {itGroup ? (
        <div key={itGroup.label}>
          <div className="nav-group">{itGroup.label}</div>
          {itGroup.items.map((item) => {
            const active = activeFor(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
