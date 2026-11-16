import AccessDenied from "@/components/AccessDenied";
import { Badge, Kpi, Page, Panel, UnknownNotice } from "@/components/ui";
import { authorize } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fmtDateTime, rel } from "@/lib/format";
import {
  listAssets,
  listConfigurationChecks,
  listIngestSources,
  listIntegrityChecks,
  socSummary,
} from "@/lib/security-plane";

export const dynamic = "force-dynamic";

export default async function ItAdminPage() {
  const principal = await currentPrincipal();
  const decision = authorize(
    { principal, action: "SECURITY_CONFIGURATION_MANAGE" },
    { record: false }
  );
  if (!decision.permitted) {
    return (
      <AccessDenied
        title="IT administration"
        plane="CYBERSECURITY"
        capability="security.configuration.manage"
        principal={principal}
        decision={decision}
      />
    );
  }

  const summary = socSummary();
  const assets = listAssets();
  const configuration = listConfigurationChecks();
  const integrity = listIntegrityChecks();
  const sources = listIngestSources();

  return (
    <Page
      title="IT administration"
      subtitle="Platform, asset, configuration and integrity management. This console is restricted to IT administrators; it is not part of the SOC or assurance views."
    >
      <UnknownNotice>
        An unobserved or stale check stays UNKNOWN. A stale ingest source is STALE, not healthy.
        Configuration and integrity records are separate observations.
      </UnknownNotice>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi label="Assets" value={assets.length} note="in the inventory" />
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
          note="awaiting normalization"
        />
        <Kpi label="Ingest sources" value={sources.length} note="registered" />
      </div>

      <Panel title="Asset inventory" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Type</th>
                <th>Environment</th>
                <th>Exposure</th>
                <th>Criticality</th>
                <th>Command</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div>{a.name}</div>
                    <div className="small dim">{a.notes ?? "—"}</div>
                  </td>
                  <td className="small mono">{a.asset_type}</td>
                  <td className="small">{a.environment}</td>
                  <td className="small">{a.exposure}</td>
                  <td><Badge value={a.criticality} /></td>
                  <td className="small mono">{a.owner_command ?? "UNKNOWN"}</td>
                  <td><Badge value={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Configuration checks" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Check</th><th>Baseline → observed</th><th>Status</th><th>Detail</th><th>Checked</th></tr>
            </thead>
            <tbody>
              {configuration.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="mono small">{c.check_code}</div>
                    <div className="small dim">{c.asset_name}</div>
                  </td>
                  <td className="small mono">
                    {c.baseline} → {c.observed ?? "UNKNOWN"}
                  </td>
                  <td><Badge value={c.status} /></td>
                  <td className="small dim" style={{ maxWidth: 260 }}>{c.drift_detail ?? "—"}</td>
                  <td className="small num">{rel(c.checked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Integrity observations" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Target</th><th>Status</th><th>Observed</th><th>Checked</th></tr>
            </thead>
            <tbody>
              {integrity.map((i) => (
                <tr key={i.id}>
                  <td>
                    <div className="mono small" style={{ maxWidth: 260 }}>{i.target}</div>
                    <div className="small dim">{i.notes ?? "—"}</div>
                  </td>
                  <td><Badge value={i.status} /></td>
                  <td className="small mono faint" style={{ maxWidth: 260 }}>
                    {i.observed_hash ?? "UNKNOWN"}
                  </td>
                  <td className="small num">{rel(i.checked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Ingest sources" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Source</th><th>Kind</th><th>Last ingest</th><th>Events</th><th>Status</th></tr>
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
    </Page>
  );
}
