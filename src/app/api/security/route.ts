import { ok } from "@/lib/http";
import {
  correlationGroups,
  listAssets,
  listConfigurationChecks,
  listIncidents,
  listIngestSources,
  listIntegrityChecks,
  listSecurityEvents,
  listVulnerabilities,
  socSummary,
} from "@/lib/security-plane";

export const dynamic = "force-dynamic";

export function GET() {
  return ok({
    summary: socSummary(),
    events: listSecurityEvents(),
    incidents: listIncidents(),
    vulnerabilities: listVulnerabilities(),
    assets: listAssets(),
    configuration: listConfigurationChecks(),
    integrity: listIntegrityChecks(),
    sources: listIngestSources(),
    correlations: correlationGroups(),
  });
}
