import Link from "next/link";
import AccessDenied from "@/components/AccessDenied";
import { Badge, Kpi, Page, Panel, UnknownNotice } from "@/components/ui";
import { authorize } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fmtDateTime, rel } from "@/lib/format";
import {
  correlationGroups,
  listConfigurationChecks,
  listIncidents,
  listIntegrityChecks,
  listIngestSources,
  listSecurityEvents,
  listVulnerabilities,
  socSummary,
} from "@/lib/security-plane";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const principal = await currentPrincipal();
  const decision = authorize(
    { principal, action: "SECURITY_EVENTS_READ" },
    { record: false }
  );
  if (!decision.permitted) {
    return (
      <AccessDenied
        title="Cybersecurity console"
        plane="CYBERSECURITY"
        capability="security.events.read"
        principal={principal}
        decision={decision}
      />
    );
  }

  const summary = socSummary();
  const events = listSecurityEvents(40);
  const incidents = listIncidents();
  const vulnerabilities = listVulnerabilities();
  const configuration = listConfigurationChecks();
  const integrity = listIntegrityChecks();
  const sources = listIngestSources();
  const correlations = correlationGroups();

  return (
    <Page
      title="Cybersecurity console"
      subtitle="One normalization and correlation pipeline over identity-provider, API-gateway, host-telemetry, scanner, configuration and integrity sources. Every count below is a count of stored records, not a health score."
    >
      <UnknownNotice>
        A stale ingest source is shown as STALE, not healthy. An event with no conclusion remains
        UNKNOWN. Unnormalized records are counted and left visible rather than dropped.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi
          label="Failed logins"
          value={summary.failedLogins}
          severity={summary.failedLogins ? "bad" : "ok"}
          note={`${summary.failedLogins24h} in the last 24 h`}
        />
        <Kpi
          label="Open vulnerabilities"
          value={summary.openVulnerabilities}
          severity={summary.openVulnerabilities ? "warn" : "ok"}
          note={`${summary.criticalVulnerabilities} critical`}
        />
        <Kpi
          label="Active incidents"
          value={summary.activeIncidents}
          severity={summary.activeIncidents ? "bad" : "ok"}
          note={`${summary.containedIncidents} contained`}
        />
        <Kpi
          label="Configuration drift"
          value={summary.configurationDrift}
          severity={summary.configurationDrift ? "warn" : "ok"}
          note="checks in DRIFT or FAIL"
        />
        <Kpi
          label="Integrity mismatch"
          value={summary.integrityMismatches}
          severity={summary.integrityMismatches ? "bad" : "ok"}
          note="observed digest differs"
        />
        <Kpi
          label="Unnormalized events"
          value={summary.unnormalized}
          severity={summary.unnormalized ? "unknown" : "ok"}
          note={`${summary.correlatedEvents} carry a correlation id`}
        />
      </div>

      <div className="grid cols-2">
        <Panel title="Ingest sources" flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Kind</th>
                  <th>Last ingest</th>
                  <th>Events</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div>{s.name}</div>
                      <div className="small dim">{s.notes ?? "—"}</div>
                    </td>
                    <td className="small mono">{s.kind}</td>
                    <td className="small num">
                      {fmtDateTime(s.last_ingest_at)}
                      <div className="faint">{rel(s.last_ingest_at)}</div>
                    </td>
                    <td className="num">{s.event_count}</td>
                    <td><Badge value={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Correlation groups" flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Correlation</th>
                  <th>Events</th>
                  <th>Sources</th>
                  <th>Window</th>
                  <th>Max severity</th>
                </tr>
              </thead>
              <tbody>
                {correlations.map((c) => (
                  <tr key={c.correlation_id}>
                    <td className="mono small">{c.correlation_id}</td>
                    <td className="num">{c.n}</td>
                    <td className="small dim" style={{ maxWidth: 220 }}>{c.sources ?? "UNKNOWN"}</td>
                    <td className="small num">
                      {fmtDateTime(c.first_at)}
                      <div className="faint">to {fmtDateTime(c.last_at)}</div>
                    </td>
                    <td><Badge value={c.max_severity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid cols-2">
        <Panel
          title="Incidents"
          actions={<Link className="small" href="/security/incidents">all incidents →</Link>}
          flush
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Incident</th><th>Severity</th><th>Status</th><th>Opened</th></tr>
              </thead>
              <tbody>
                {incidents.slice(0, 5).map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="mono">{i.code}</div>
                      <div className="small">{i.title}</div>
                      <div className="small faint">{i.linked_events} linked events</div>
                    </td>
                    <td><Badge value={i.severity} /></td>
                    <td><Badge value={i.status} /></td>
                    <td className="small num">{rel(i.opened_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Open vulnerabilities"
          actions={<Link className="small" href="/security/vulnerabilities">all findings →</Link>}
          flush
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Vulnerability</th><th>Severity</th><th>Asset</th><th>Due</th></tr>
              </thead>
              <tbody>
                {vulnerabilities.filter((v) => v.status === "OPEN" || v.status === "TRIAGED").slice(0, 5).map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="mono">{v.code}</div>
                      <div className="small">{v.title}</div>
                      {v.cve_id ? <div className="small faint">{v.cve_id}</div> : null}
                    </td>
                    <td><Badge value={v.severity} /></td>
                    <td className="small">{v.asset_name ?? "UNKNOWN"}</td>
                    <td className="small num">{rel(v.due_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Normalized event register" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Outcome</th>
                <th>Subject / resource</th>
                <th>Source</th>
                <th>Occurred</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="mono">{e.code}</div>
                    <div className="small" style={{ maxWidth: 300 }}>{e.title}</div>
                  </td>
                  <td className="small mono">{e.event_type ?? "UNCLASSIFIED"}</td>
                  <td><Badge value={e.severity} /></td>
                  <td><Badge value={e.outcome ?? e.status} /></td>
                  <td className="small mono" style={{ maxWidth: 240 }}>
                    {e.subject_id ?? "—"}
                    <div className="faint">{e.resource_type ? `${e.resource_type}:${e.resource_id ?? "?"}` : "no resource"}</div>
                    {e.correlation_id ? <div className="faint">{e.correlation_id}</div> : null}
                  </td>
                  <td className="small">{e.source ?? "UNKNOWN"}</td>
                  <td className="small num">
                    {fmtDateTime(e.occurred_at)}
                    <div className="faint">{e.normalized ? "normalized" : "RAW"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid cols-2">
        <Panel title="Configuration checks" flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Check</th><th>Baseline</th><th>Observed</th><th>Status</th><th>Checked</th></tr>
              </thead>
              <tbody>
                {configuration.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="mono small">{c.check_code}</div>
                      <div className="small dim">{c.asset_name}</div>
                    </td>
                    <td className="small mono">{c.baseline}</td>
                    <td className="small mono">{c.observed ?? "UNKNOWN"}</td>
                    <td><Badge value={c.status} /></td>
                    <td className="small num">{rel(c.checked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Integrity checks" flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Target</th><th>Status</th><th>Checked</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {integrity.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="mono small" style={{ maxWidth: 260 }}>{i.target}</div>
                      <div className="small dim">{i.asset_name}</div>
                    </td>
                    <td><Badge value={i.status} /></td>
                    <td className="small num">{rel(i.checked_at)}</td>
                    <td className="small dim" style={{ maxWidth: 220 }}>{i.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
