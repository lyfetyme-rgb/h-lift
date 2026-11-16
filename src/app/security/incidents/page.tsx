import AccessDenied from "@/components/AccessDenied";
import { IncidentStatus } from "@/components/Actions";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { authorize, canRead } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fmtDateTime, rel } from "@/lib/format";
import {
  linkedEvents,
  listIncidentActions,
  listIncidents,
} from "@/lib/security-plane";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const principal = await currentPrincipal();
  const decision = authorize({ principal, action: "SECURITY_EVENTS_READ" }, { record: false });
  if (!decision.permitted) {
    return (
      <AccessDenied
        title="Security incidents"
        plane="CYBERSECURITY"
        capability="security.events.read"
        principal={principal}
        decision={decision}
      />
    );
  }

  const canManage = canRead(principal, "SECURITY_INCIDENT_MANAGE");
  const incidents = listIncidents();

  return (
    <Page
      title="Security incidents"
      subtitle="Incidents are opened from correlated events. Status changes require the security.incident.manage capability and are written to the incident action log and the hash-chained audit bus."
    >
      {!canManage ? (
        <div className="callout">
          <strong>Read-only view.</strong> This principal does not hold security.incident.manage, so
          no status control is rendered. Incident status is never changed on behalf of another
          principal.
        </div>
      ) : null}

      {incidents.map((i) => {
        const actions = listIncidentActions(i.id);
        const events = linkedEvents(i.id);
        return (
          <Panel
            key={i.id}
            title={
              <span>
                <span className="mono">{i.code}</span> · {i.title}
              </span>
            }
            actions={
              <span style={{ display: "inline-flex", gap: 6 }}>
                <Badge value={i.severity} />
                <Badge value={i.status} />
              </span>
            }
          >
            <div className="grid cols-2">
              <div>
                <table>
                  <tbody>
                    <tr><td className="dim">Category</td><td className="small mono">{i.category ?? "UNKNOWN"}</td></tr>
                    <tr><td className="dim">Owner</td><td className="small">{i.owner_name ?? i.owner_subject ?? "UNKNOWN"}</td></tr>
                    <tr><td className="dim">Opened</td><td className="small num">{fmtDateTime(i.opened_at)} · {rel(i.opened_at)}</td></tr>
                    <tr><td className="dim">Closed</td><td className="small num">{i.closed_at ? fmtDateTime(i.closed_at) : "—"}</td></tr>
                    <tr><td className="dim">Linked events</td><td className="num">{i.linked_events}</td></tr>
                  </tbody>
                </table>
                <h3 style={{ marginTop: 14 }}>Summary</h3>
                <p className="small dim">{i.summary ?? "No summary recorded."}</p>
                <h3>Containment</h3>
                <p className="small dim">{i.containment ?? "No containment recorded."}</p>
                <h3>Notes</h3>
                <p className="small dim">{i.notes ?? "—"}</p>
                {canManage && i.status !== "CLOSED" ? (
                  <div style={{ marginTop: 12 }}>
                    <IncidentStatus id={i.id} current={i.status} />
                  </div>
                ) : null}
              </div>

              <div>
                <h3>Action log</h3>
                {actions.length === 0 ? (
                  <p className="small dim">No actions recorded.</p>
                ) : (
                  <ul className="timeline">
                    {actions.map((a) => (
                      <li key={a.id}>
                        <div className="when">{fmtDateTime(a.at)}</div>
                        <div className="what mono">{a.action}</div>
                        <div className="who">{a.actor_subject ?? "UNKNOWN"}{a.notes ? ` · ${a.notes}` : ""}</div>
                      </li>
                    ))}
                  </ul>
                )}

                <h3 style={{ marginTop: 16 }}>Linked events</h3>
                {events.length === 0 ? (
                  <p className="small dim">No events linked.</p>
                ) : (
                  <table>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <div className="mono small">{e.code}</div>
                            <div className="small">{e.title}</div>
                          </td>
                          <td className="num"><Badge value={e.severity} /></td>
                          <td className="small num">{rel(e.occurred_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </Panel>
        );
      })}

      <UnknownNotice>
        An incident with an unresolved owner or no containment record remains visible as UNKNOWN.
        Closing an incident records a status and an actor; it does not imply the root cause was
        established.
      </UnknownNotice>
    </Page>
  );
}
