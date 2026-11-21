import { createHash, randomUUID } from "node:crypto";
import { all, one } from "./db";
import { listSecurityEvents, listVulnerabilities } from "./security-plane";

/**
 * STIX 2.1 projection of the cybersecurity plane.
 *
 * The SOC console keeps records in normalized tables; this module projects the
 * same records into STIX so a SIEM, TAXII client or threat-intelligence
 * platform can consume them without a proprietary adapter. IDs are derived
 * deterministically from the source record id, so repeated exports are stable
 * and a TAXII client can page without duplicates.
 *
 * Nothing here invents a finding: an object exists only because a
 * `security_events` or `vulnerabilities` row exists.
 */

export const STIX_SPEC_VERSION = "2.1";

/** Deterministic UUID-shaped id from a stable seed. */
function stableUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function stixTime(value: string | null | undefined, fallback: string): string {
  if (value) return value.replace(/\.000Z$/, "Z");
  return fallback;
}

const INDICATOR_TYPES: Record<string, string> = {
  AUTHENTICATION: "anomalous-activity",
  FAILURE: "anomalous-activity",
  INTRUSION: "malicious-activity",
  MALWARE: "malicious-activity",
  EXPLOIT: "malicious-activity",
};

function indicatorType(eventType: string | null): string {
  const key = (eventType ?? "").toUpperCase();
  return INDICATOR_TYPES[key] ?? "unknown";
}

function confidence(severity: string | null): number {
  switch ((severity ?? "").toUpperCase()) {
    case "CRITICAL":
    case "HIGH":
      return 90;
    case "MEDIUM":
      return 70;
    case "LOW":
      return 50;
    default:
      return 30;
  }
}

function identityObject(): Record<string, unknown> {
  return {
    type: "identity",
    id: `identity--${stableUuid("hlift-producer")}`,
    spec_version: STIX_SPEC_VERSION,
    created: "2026-01-01T00:00:00.000Z",
    modified: new Date().toISOString(),
    name: "H-LIFT",
    description: "H-LIFT three-plane mission control - cybersecurity plane producer.",
    identity_class: "system",
    sectors: ["government"],
  };
}

export function stixObjects(limit = 500): Record<string, unknown>[] {
  const now = new Date().toISOString();
  const objects: Record<string, unknown>[] = [identityObject()];

  const events = listSecurityEvents(limit);
  for (const e of events) {
    objects.push({
      type: "indicator",
      id: `indicator--${stableUuid(`event:${e.id}`)}`,
      spec_version: STIX_SPEC_VERSION,
      created: stixTime(e.occurred_at, now),
      modified: stixTime(e.ingested_at, now),
      name: `${e.code ?? e.id} ${e.title ?? ""}`.trim(),
      description:
        `${e.event_type ?? "UNKNOWN"} event from ${e.source ?? "UNKNOWN"}` +
        `${e.outcome ? `; outcome ${e.outcome}` : ""}.`,
      indicator_types: [indicatorType(e.event_type)],
      pattern: `[x-hlift-event:id = '${e.id}']`,
      pattern_type: "stix",
      valid_from: stixTime(e.occurred_at, now),
      labels: [e.severity ?? "UNKNOWN"],
      confidence: confidence(e.severity),
      object_marking_refs: undefined,
    });
  }

  const vulns = listVulnerabilities();
  for (const v of vulns) {
    const external: Record<string, string>[] = [];
    if (v.cve_id) {
      external.push({
        source_name: "cve",
        external_id: v.cve_id,
        url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(v.cve_id)}`,
      });
    }
    objects.push({
      type: "vulnerability",
      id: `vulnerability--${stableUuid(`vuln:${v.id}`)}`,
      spec_version: STIX_SPEC_VERSION,
      created: stixTime(v.discovered_at, now),
      modified: stixTime(v.remediated_at ?? v.discovered_at, now),
      name: v.title ?? v.code,
      description: v.notes ?? `${v.code} on ${v.asset_name ?? "UNKNOWN asset"}.`,
      labels: [v.severity ?? "UNKNOWN"],
      external_references: external.length ? external : undefined,
      object_marking_refs: undefined,
    } as Record<string, unknown>);
  }

  return objects;
}

export function buildStixBundle(limit = 500): Record<string, unknown> {
  return {
    type: "bundle",
    id: `bundle--${randomUUID()}`,
    spec_version: STIX_SPEC_VERSION,
    objects: stixObjects(limit),
  };
}

/** Count of STIX objects currently projected (for TAXII collection metadata). */
export function stixCounts(): { indicators: number; vulnerabilities: number; total: number } {
  const objects = stixObjects();
  const indicators = objects.filter((o) => o.type === "indicator").length;
  const vulnerabilities = objects.filter((o) => o.type === "vulnerability").length;
  return { indicators, vulnerabilities, total: objects.length };
}

/** TAXII 2.1 collection metadata for the H-LIFT cybersecurity feed. */
export function taxiiCollections() {
  const counts = stixCounts();
  return [
    {
      id: "a1a0914e-e3aa-4080-a0fb-a67dec49c1a3",
      title: "H-LIFT cybersecurity indicators and vulnerabilities",
      description:
        "STIX 2.1 projection of normalized H-LIFT security events and the vulnerability register. Counts are record counts, not decorative.",
      can_read: true,
      can_write: false,
      media_types: ["application/stix+json;version=2.1"],
      objects_count: counts.total,
    },
  ];
}

export function taxiiDiscovery() {
  return {
    title: "H-LIFT TAXII 2.1 Server",
    description: "TAXII 2.1 feed for the H-LIFT cybersecurity plane.",
    contact: "H-LIFT maintainers",
    default: "/taxii2/collections/",
    api_roots: ["/taxii2/"],
  };
}

export function stixManifest(collectionId: string, limit = 500) {
  const objects = stixObjects(limit).filter((o) => o.type !== "identity");
  return {
    more: false,
    objects: objects.map((o) => ({
      id: o.id,
      date_added: o.created,
      version: o.modified,
      media_type: "application/stix+json;version=2.1",
      collection: collectionId,
    })),
  };
}

/** Query helper kept here so the route stays thin. */
export function eventById(id: string) {
  return one("SELECT * FROM security_events WHERE id = ?", id);
}

export function allEventsLimit(limit: number) {
  return all("SELECT id FROM security_events ORDER BY occurred_at DESC LIMIT ?", limit);
}
