import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Page, Panel, UnknownNotice } from "@/components/ui";
import { missionDetail } from "@/lib/repo";
import { fmtDate, rel } from "@/lib/format";
import { percent } from "@/lib/status";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
function Stage({ name, children, count }: { name: string; children: React.ReactNode; count?: number }) {
  return (
    <div className="chain-stage">
      <div className="stage-head">
        <span className="name">{name}</span>
        {typeof count === "number" ? <span className="badge b-muted">{count}</span> : null}
      </div>
      <div className="stage-body">{children}</div>
    </div>
  );
}

function Row({ title, meta, right }: { title: React.ReactNode; meta?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="chain-item">
      <div className="grow">
        <div className="title">{title}</div>
        {meta ? <div className="meta">{meta}</div> : null}
      </div>
      <div>{right}</div>
    </div>
  );
}

export default async function MissionTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = missionDetail(id);
  if (!detail) notFound();

  const { mission, tree, gaps } = detail;

  return (
    <Page
      title={`${mission.code} · ${mission.title}`}
      subtitle={`${mission.mission} — owner ${mission.owner ?? "UNKNOWN"} · priority ${mission.priority ?? "UNKNOWN"}`}
      actions={
        <div className="actions-row">
          <Badge value={mission.status} />
          <Link href="/traceability" className="small">← all missions</Link>
        </div>
      }
    >
      <UnknownNotice />

      <Panel title={`Gaps in this chain (${gaps.length})`} flush>
        {gaps.length === 0 ? (
          <div className="empty">No gaps detected. Every stage has linked, verified records.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Stage</th><th>Record</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>
                {gaps.map((g: any) => (
                  <tr key={g.id}>
                    <td><span className="badge b-muted">{g.kind}</span></td>
                    <td><span className="mono">{g.code}</span> <span className="small dim">{g.name}</span></td>
                    <td><Badge value={g.status} /></td>
                    <td className="small dim">{g.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="chain">
        <Stage name="1 · Mission requirement">
          <Row
            title={<><strong>{mission.code}</strong> — {mission.title}</>}
            meta={mission.description}
            right={<Badge value={mission.status} />}
          />
        </Stage>

        {tree.length === 0 ? (
          <div className="callout"><strong>No operational needs linked.</strong> This stage is UNKNOWN, not complete.</div>
        ) : null}

        {tree.map((need: any) => (
          <div key={need.id} className="chain">
            <div className="arrow">▼</div>
            <Stage name="2 · Operational need">
              <Row
                title={<><span className="mono">{need.code}</span> — {need.title}</>}
                meta={`owner ${need.owner ?? "UNKNOWN"}`}
                right={<Badge value={need.status} />}
              />
            </Stage>

            {need.caps.length === 0 ? (
              <div className="callout">No capability linked to {need.code}. Stage is UNKNOWN.</div>
            ) : null}

            {need.caps.map((cap: any) => (
              <div key={cap.id} className="chain">
                <div className="arrow">▼</div>
                <Stage name="3 · Capability">
                  <Row
                    title={<><span className="mono">{cap.code}</span> — {cap.name}</>}
                    meta={cap.description}
                    right={<Badge value={cap.status} />}
                  />
                </Stage>

                {cap.sysReqs.length === 0 ? (
                  <div className="callout">No system requirement linked to {cap.code}. Stage is UNKNOWN.</div>
                ) : null}

                {cap.sysReqs.map((sr: any) => (
                  <div key={sr.id} className="chain">
                    <div className="arrow">▼</div>
                    <Stage name="4 · System requirement">
                      <Row
                        title={<><span className="mono">{sr.code}</span> — {sr.title}</>}
                        meta={`${sr.kind} requirement`}
                        right={<Badge value={sr.status} />}
                      />
                      <div className="small dim">
                        {sr.evidence.length === 0 ? (
                          <span className="badge b-unknown">EVIDENCE UNKNOWN</span>
                        ) : (
                          sr.evidence.map((e: any) => (
                            <div key={e.id} style={{ marginTop: 4 }}>
                              <Badge value={e.status} /> <span className="mono">{e.type}</span> {e.name}
                              {e.artifact_url ? <a href={e.artifact_url} style={{ marginLeft: 6 }}>run</a> : null}
                            </div>
                          ))
                        )}
                      </div>
                    </Stage>

                    {sr.designs.length === 0 ? (
                      <div className="callout">No design component linked to {sr.code}. Stage is UNKNOWN.</div>
                    ) : null}

                    {sr.designs.map((dc: any) => (
                      <div key={dc.id} className="chain">
                        <div className="arrow">▼</div>
                        <Stage name="5 · Design component">
                          <Row
                            title={<><span className="mono">{dc.code}</span> — {dc.name}</>}
                            meta={`${dc.kind}${dc.description ? ` · ${dc.description}` : ""}`}
                            right={<Badge value={dc.status} />}
                          />
                        </Stage>

                        {dc.issues.length === 0 ? (
                          <div className="callout">No engineering issue linked to {dc.code}. Stage is UNKNOWN.</div>
                        ) : null}

                        {dc.issues.map((iss: any) => (
                          <div key={iss.id} className="chain">
                            <div className="arrow">▼</div>
                            <Stage name="6 · Engineering issue">
                              <Row
                                title={
                                  <>
                                    <span className="mono">{iss.key}</span> — {iss.title}
                                    {iss.linear_url ? <a href={iss.linear_url} style={{ marginLeft: 6 }} className="small">Linear ↗</a> : null}
                                  </>
                                }
                                meta={`assignee ${iss.assignee ?? "UNKNOWN"} · priority ${iss.priority}`}
                                right={<Badge value={iss.status} />}
                              />
                              <div className="small dim">Opened {fmtDate(iss.created_at)}</div>

                              <div style={{ marginTop: 6 }}>
                                <h3>7 · Branch / commit / PR</h3>
                                {iss.links.length === 0 ? (
                                  <Badge value="UNKNOWN" />
                                ) : (
                                  iss.links.map((l: any) => (
                                    <Row
                                      key={l.id}
                                      title={
                                        <>
                                          <span className="mono">{l.branch ?? "UNKNOWN branch"}</span>
                                          {l.commit_sha ? <span className="mono dim"> · {l.commit_sha}</span> : null}
                                          {l.pr_url ? <a href={l.pr_url} style={{ marginLeft: 6 }} className="small">PR ↗</a> : null}
                                        </>
                                      }
                                      meta={`checks ${l.checks_status} · updated ${rel(l.updated_at)}`}
                                      right={<Badge value={l.pr_state} />}
                                    />
                                  ))
                                )}
                              </div>

                              <div style={{ marginTop: 6 }}>
                                <h3>8 · Evidence</h3>
                                {iss.evidence.length === 0 ? (
                                  <Badge value="UNKNOWN" />
                                ) : (
                                  iss.evidence.map((e: any) => (
                                    <Row
                                      key={e.id}
                                      title={e.name}
                                      meta={`${e.type}${e.collected_at ? ` · ${fmtDate(e.collected_at)}` : ""}${e.notes ? ` · ${e.notes}` : ""}`}
                                      right={<Badge value={e.status} />}
                                    />
                                  ))
                                )}
                              </div>

                              <div style={{ marginTop: 6 }}>
                                <h3>9 · Build artifact</h3>
                                {iss.artifacts.length === 0 ? (
                                  <Badge value="UNKNOWN" />
                                ) : (
                                  iss.artifacts.map((art: any) => (
                                    <div key={art.id}>
                                      <Row
                                        title={<><span className="mono">{art.name}</span> : {art.version}</>}
                                        meta={`${art.container_image ?? "image UNKNOWN"}${art.digest ? ` · ${art.digest}` : ""}`}
                                        right={<Badge value={art.status} />}
                                      />
                                      <div style={{ marginLeft: 24 }}>
                                        <h3>10 · Deployment approval</h3>
                                        {art.approvals.length === 0 ? (
                                          <Badge value="UNKNOWN" />
                                        ) : (
                                          art.approvals.map((a: any) => (
                                            <Row
                                              key={a.id}
                                              title={`${a.environment} — ${a.status}`}
                                              meta={`requested by ${a.requested_by ?? "UNKNOWN"} · ${rel(a.requested_at)}${a.approver ? ` · approver ${a.approver}` : ""}${a.note ? ` · ${a.note}` : ""}`}
                                              right={<Badge value={a.status} />}
                                            />
                                          ))
                                        )}

                                        <h3 style={{ marginTop: 8 }}>11 · Operational validation</h3>
                                        {art.validations.length === 0 ? (
                                          <Badge value="UNKNOWN" />
                                        ) : (
                                          art.validations.map((v: any) => (
                                            <Row
                                              key={v.id}
                                              title={`validated by ${v.validated_by ?? "UNKNOWN"}`}
                                              meta={`${v.validated_at ? fmtDate(v.validated_at) : "date UNKNOWN"}${v.notes ? ` · ${v.notes}` : ""}`}
                                              right={<Badge value={v.status} />}
                                            />
                                          ))
                                        )}

                                        <h3 style={{ marginTop: 8 }}>12 · Release</h3>
                                        {art.releases.length === 0 ? (
                                          <Badge value="UNKNOWN" />
                                        ) : (
                                          art.releases.map((r: any) => (
                                            <Row
                                              key={r.id}
                                              title={`version ${r.version}`}
                                              meta={`${r.released_at ? fmtDate(r.released_at) : "not released"}${r.notes ? ` · ${r.notes}` : ""}`}
                                              right={<Badge value={r.status} />}
                                            />
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </Stage>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <Panel title="Traceability math" >
        <div className="small dim">
          Percentages and counts are computed from linked records only. A missing link renders as UNKNOWN
          or a gap row; nothing is inferred from naming, ownership or recency. Partial-use quantities,
          where present, are shown exactly as recorded (e.g. 0.25 = one quarter) with their verification
          status — {percent(0.25)} displays as 25%.
        </div>
      </Panel>
    </Page>
  );
}
