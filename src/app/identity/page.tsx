import Link from "next/link";
import { Badge, Page, Panel } from "@/components/ui";
import { all } from "@/lib/db";
import { currentPrincipal, listPrincipals, roleLabel } from "@/lib/identity";
import { decisionSummary } from "@/lib/authz";

export const dynamic = "force-dynamic";

interface CapabilityRow {
  code: string;
  name: string;
  plane: string;
  is_write: number;
  roles: string | null;
}

export default async function IdentityPage() {
  const current = await currentPrincipal();
  const people = listPrincipals();
  const capabilities = all<CapabilityRow>(
    `SELECT cc.code, cc.name, cc.plane, cc.is_write,
            GROUP_CONCAT(r.code, ', ') AS roles
       FROM capability_catalog cc
       LEFT JOIN role_capabilities rc ON rc.capability_code = cc.code
       LEFT JOIN roles r ON r.id = rc.role_id
      GROUP BY cc.code
      ORDER BY cc.plane, cc.code`
  );
  const policies = all<Record<string, unknown>>(
    "SELECT * FROM policies WHERE active = 1 ORDER BY plane, capability_code"
  );
  const commands = all<Record<string, unknown>>(
    "SELECT c.id, c.code, c.name, c.level, c.parent_id, p.name AS parent_name FROM commands c LEFT JOIN commands p ON p.id = c.parent_id ORDER BY c.level, c.code"
  );
  const decisions = decisionSummary();

  return (
    <Page
      title="Identity & capabilities"
      subtitle="H-LIFT is not a credential authority. A DoD identity service authenticates the principal; this adapter maps the stable subject and organizational claims onto local roles, canonical capabilities and scoped policy."
    >
      <div className="grid cols-2">
        <Panel title="Acting principal">
          {current ? (
            <table>
              <tbody>
                <tr><td className="dim">Subject</td><td className="mono">{current.subject_id}</td></tr>
                <tr><td className="dim">Display name</td><td>{current.display_name}</td></tr>
                <tr><td className="dim">Roles</td><td className="mono">{roleLabel(current)}</td></tr>
                <tr><td className="dim">Command</td><td className="mono">{current.command_id ?? "UNKNOWN"} · {current.command_level ?? "UNKNOWN"}</td></tr>
                <tr><td className="dim">Command name</td><td>{current.command_name ?? "UNKNOWN"}</td></tr>
                <tr><td className="dim">Facility</td><td className="mono">{current.facility_id ?? "UNKNOWN"}</td></tr>
                <tr><td className="dim">Credential assurance</td><td><Badge value={current.credential_assurance} /></td></tr>
                <tr><td className="dim">Identity provider</td><td className="mono">{current.idp_issuer ?? "UNKNOWN"}</td></tr>
                <tr><td className="dim">Status</td><td><Badge value={current.status} /></td></tr>
              </tbody>
            </table>
          ) : (
            <p className="dim">No principal resolved.</p>
          )}
          <h3 style={{ marginTop: 16 }}>Capabilities</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(current?.capabilities ?? []).map((c) => (
              <span key={c} className="badge b-info mono">{c}</span>
            ))}
          </div>
        </Panel>

        <Panel title="Authorization ledger" actions={<Link className="small" href="/audit">audit bus →</Link>}>
          <table>
            <tbody>
              <tr><td className="dim">Decisions recorded</td><td className="num">{decisions.total}</td></tr>
              <tr><td className="dim">Permitted</td><td className="num">{decisions.permitted}</td></tr>
              <tr><td className="dim">Denied</td><td className="num">{decisions.denied}</td></tr>
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>Denial reasons</h3>
          {decisions.byReason.length === 0 ? (
            <p className="small dim">No decisions recorded.</p>
          ) : (
            <table>
              <tbody>
                {decisions.byReason.map((r) => (
                  <tr key={r.reason_code}>
                    <td className="mono small">{r.reason_code}</td>
                    <td className="num">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="Principal directory" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Principal</th>
                <th>Subject</th>
                <th>Roles</th>
                <th>Command / facility</th>
                <th>Assurance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>{p.display_name}</td>
                  <td className="mono small">{p.subject_id}</td>
                  <td className="mono small">{roleLabel(p)}</td>
                  <td className="small mono">
                    {p.command_id ?? "UNKNOWN"}
                    <div className="faint">{p.facility_id ?? "NO FACILITY"}</div>
                  </td>
                  <td><Badge value={p.credential_assurance} /></td>
                  <td><Badge value={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Command hierarchy (NAVSUP)" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Command</th>
                <th>Code</th>
                <th>Level</th>
                <th>Parent</th>
              </tr>
            </thead>
            <tbody>
              {commands.map((c) => (
                <tr key={String(c.id)}>
                  <td>{String(c.name)}</td>
                  <td className="mono small">{String(c.code)}</td>
                  <td className="small">{String(c.level)}</td>
                  <td className="small">{c.parent_name ? String(c.parent_name) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Canonical capabilities" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Capability</th>
                <th>Plane</th>
                <th>Write</th>
                <th>Granted to roles</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((c) => (
                <tr key={c.code}>
                  <td>
                    <div className="mono">{c.code}</div>
                    <div className="small dim">{c.name}</div>
                  </td>
                  <td className="small">{c.plane}</td>
                  <td className="small">{c.is_write ? "write" : "read"}</td>
                  <td className="small mono">{c.roles ?? "NO ROLE"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Local policy" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Policy</th>
                <th>Capability</th>
                <th>Effect</th>
                <th>Assurance</th>
                <th>Facility scope</th>
                <th>Allowed states</th>
                <th>Expiry guard</th>
                <th>Obligations</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={String(p.id)}>
                  <td className="mono small">
                    {String(p.id)}
                    <div className="faint">v{String(p.version)}</div>
                  </td>
                  <td className="mono small">{String(p.capability_code)}</td>
                  <td><Badge value={String(p.effect)} /></td>
                  <td className="small">{String(p.requires_assurance)}</td>
                  <td className="small">{String(p.facility_scope)}</td>
                  <td className="small mono" style={{ maxWidth: 240 }}>
                    {p.allowed_states ? String(p.allowed_states) : "any"}
                  </td>
                  <td className="small">{p.require_valid_expiry ? "required" : "—"}</td>
                  <td className="small mono" style={{ maxWidth: 220 }}>
                    {p.obligations ? String(p.obligations) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
