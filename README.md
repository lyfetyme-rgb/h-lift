# H-LIFT - Three-Plane Mission Control

A full-stack operations console that traces every H-LIFT deliverable from **mission requirement** through to **release**, controls the hazmat lifecycle, and adds the two planes a DoD pilot needs around it: **cybersecurity** and **assurance**. All three planes share one trusted data layer and one append-only, hash-chained audit bus.

The governing rule of the whole platform: **unknown and unverified data is preserved, never guessed.** A missing expiry, an unmeasured return, a blank approver, an unobserved integrity check or an unassessed control renders as `UNKNOWN` / `UNVERIFIED` and stays visible. Nothing is inferred from naming, recency, ownership or "probably fine".

H-LIFT does not replace CHRIMP or any existing NAVSUP HAZMAT system. It is designed to **interoperate** with them: it consumes the same lifecycle functions (request, issue, custody, return, inspection, disposition), preserves unknown data, and exposes an identity adapter and event bus that a command can integrate with its own identity service and monitoring stack.

---

## Run it

Requires Node 22+ (built and verified on Node 26).

```bash
cd h-lift
npm install
npm run seed        # create data/hlift.db and load the demo dataset
npm run dev         # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Docker (TRL 8 deployment):
```bash
docker compose up -d --build
# http://localhost:3000
# logs: docker compose logs -f
# stop:  docker compose down
```
The image is a multi-stage build with a non-root runtime user, a persistent `hlift-data` volume for SQLite, and a `/api/health` healthcheck. Set `SEED_DEMO=1` (default in compose) to load the demonstration dataset on first start; unset it for a production database that keeps its own records. Schema and migrations are applied automatically by `scripts/init-db.mjs` before the server starts.

Useful scripts:

| Script | Purpose |
|---|---|
| `npm run seed` | Create the database and seed it (idempotent schema; re-running without `--reset` adds duplicate rows, so prefer `db:reset` once seeded) |
| `npm run db:reset` | Delete the database and seed from scratch - restores the pristine demo state |
| `npm run db:verify` | Assert the seed is pristine: 7 materials / 23 containers, 3 pending + 1 accepted inspection, 3.400 GAL returned pail, NULL unmeasured tube, 2.000 OZ variance, no REAL quantity columns, no illegal AVAILABLE container; plus 6 migrations, 14 failed logins, 7 open vulnerabilities, 2 active incidents, 2 configuration drifts, 1 integrity mismatch, 42 controls / 29 implemented, 75 evidence objects, 6 open findings, 7 POA&M entries, 9 authorization decisions (5 denied), 31 audit events and a valid SHA-256 chain |

---

## Architecture

```
h-lift/
  db/schema.sql              24-table SQLite baseline (traceability chain + container hazmat)
  db/migrations/             forward migrations 001-006; the baseline is never overwritten
    001_material_identity.sql
    002_container_package.sql
    003_custody_event_model.sql
    004_role_capability_model.sql
    005_security_events.sql
    006_assurance_evidence.sql
  scripts/seed.mjs           realistic, deliberately imperfect dataset + chained audit seed
  scripts/verify-seed.mjs    pristine-seed and three-plane assertions
  src/lib/
    db.ts                    node:sqlite connection (WAL), migration runner, transaction helper
    repo.ts                  graph loading, chain derivation, gaps, container accounting, weekly aggregation
    audit.ts                 canonical JSON, SHA-256 hash chain, append/verify
    identity.ts              DoD identity-service adapter -> local principal, roles, capabilities
    authz.ts                 scoped policy engine, decision persistence, container scope
    security-plane.ts        SOC aggregation, incident/event ingestion, source health
    assurance.ts             RMF projection, controls, evidence, findings, POA&M
    qty.ts                   exact BigInt fixed-point decimal arithmetic
    lifecycle.ts             request and container state machines, checklist fields
    status.ts                UNKNOWN/UNVERIFIED vocabulary, tone mapping, shelf-life state
    weekly.ts                HLIFT-WSR v1 markdown renderer
    hazmat-display.ts        quantity/bucket rendering that never turns UNKNOWN into zero
    format.ts                date / relative-time / percent formatting
    http.ts                  JSON response helpers, decimal and tri-state coercion, 403 decision
  src/app/                   App Router pages + API routes
  src/components/            shared UI primitives, nav, identity bar, access-denied panel, client mutation forms
```

- **Next.js 16 App Router + TypeScript**, no UI library - a hand-written CSS design system in `src/app/globals.css` (dark console theme, print stylesheet for PDF export).
- **SQLite via Node's built-in `node:sqlite`** (`DatabaseSync`). No native modules, no ORM. The database file lives at `data/hlift.db`.
- Every page and route that reads the database sets `export const dynamic = "force-dynamic"`, so nothing is prerendered against a build-time database.
- Mutations are written straight to SQLite through the repository layer; client forms call the JSON API and refresh the server components.

---

## Three planes over one trusted layer

**Operational** material identity → container/package identity → location → custody → transaction → inspection → disposition. **Cybersecurity** identity events, authorization decisions, security incidents, vulnerabilities, configuration drift and integrity observations. **Assurance** controls, evidence objects, assessments, findings and POA&M. The planes share identities, event records, material states and authorization decisions; they do not maintain divergent copies.

```
DoD identity service  (authenticates; H-LIFT never sees a credential)
        │  stable subject + organizational claims
        ▼
H-LIFT identity adapter        src/lib/identity.ts
        │  principal, roles, facility, credential assurance
        ▼
scoped authorization engine    src/lib/authz.ts
        │  capability + command + facility + lifecycle + expiry + policy
        ├── PERMIT / DENY persisted to authorization_decisions
        └── AUTHORIZATION_DECISION appended to the audit bus
```

### Identity adapter

- The assertion is carried by `x-hlift-subject` (automation) or the `hlift_subject` cookie (console). The top bar switches the acting demo principal.
- Six seeded subjects map to six roles: `HAZMAT_OPERATOR`, `HAZMAT_CUSTODIAN`, `IT_ADMINISTRATOR`, `CYBERSECURITY_PERSONNEL`, `COMMAND_OVERSIGHT`, `AUDITOR_ASSESSOR`.
- Business rules reference **canonical capabilities**, never role names, so a command can remap its own job titles by changing `role_capabilities` without rewriting the application.
- H-LIFT is **not** a credential authority. It stores subject, command/facility attributes, credential assurance and role assignments; it stores no password, token or key.

### Canonical capabilities

| Group | Capabilities |
|---|---|
| Material | `material.request`, `material.issue`, `material.receive`, `material.return`, `material.inspect`, `material.relabel` |
| Inventory | `inventory.read`, `inventory.adjust`, `inventory.reconcile` |
| Security | `security.events.read`, `security.incident.manage`, `security.configuration.manage`, `security.vulnerability.manage` |
| Assurance | `assurance.controls.read`, `assurance.evidence.read`, `assurance.finding.manage`, `assurance.finding.close` |
| Governance | `oversight.read`, `release.approve`, `exception.decide` |

`assurance.finding.close`, `release.approve` and `exception.decide` are deliberately narrow: closing an assurance finding is a command acknowledgement, not ordinary assessor work.

### Authorization rules

Every decision records the subject, roles, capability, command, facility, resource type/id, action, lifecycle state, credential assurance, policy version, outcome and obligations. The rules in `db/migrations/004_role_capability_model.sql` include:

- Writes require `HIGH` credential assurance. A lower assurance is denied as `INSUFFICIENT_ASSURANCE`.
- Facility-scoped writes require the principal and resource to share a facility (`FACILITY_SCOPE_MISMATCH` otherwise).
- Issue, receive, inspect and relabel require a **valid recorded expiry**. `EXPIRED` is `EXPIRY_BLOCKED`; missing/`UNKNOWN` is `EXPIRY_UNKNOWN`. Expiry interrupts an action; it is not just another linear state.
- `COMMAND_OVERSIGHT` is read/acknowledge/review by default, never broad write access.
- No principal may approve their own request (`SEGREGATION_OF_DUTIES`). Finding closure is restricted to command oversight and carries `COMMAND_ACKNOWLEDGEMENT_REQUIRED`.

### Audit bus

`audit_events` is append-only and hash-chained. Hash material is the previous hash plus the newline-joined fields (`id`, `occurred_at`, `plane`, `event_type`, `source`, `subject_id`, `resource_type`, `resource_id`, `correlation_id`, `severity`, `outcome`, canonical-JSON `payload`). The seed and the runtime use byte-identical canonical encoding, and `/audit` recomputes the chain from genesis.

### Counts are records

The SOC console and RMF posture page never render a decorative percentage. Failed logins are a count of `AUTHENTICATION` / `FAILURE` events; open vulnerabilities are rows in `vulnerabilities`; active incidents are rows in `security_incidents`; implemented controls are rows whose evidence exists. A stale ingest source is `STALE`, not healthy. An unassessed control is `NOT_ASSESSED`, not implemented.

### Data model

The traceability chain is a normalised chain of foreign keys:

```
mission_requirements -> operational_needs -> capabilities -> system_requirements
  -> design_components -> engineering_issues -> code_links (branch/commit/PR)
  -> evidence (test | security | policy) -> build_artifacts
  -> deployment_approvals -> operational_validations -> releases
```

Hazmat is modelled as **product identity -> container -> accountable movement**, not as one scalar quantity:

```
materials        product identity, NSN / manufacturer IDs, unit of issue,
                 package size, measurement basis, unit of measure,
                 hazard/shelf-life attributes, partial-accounting permission
  |
  +-- containers         container ID, lot/batch, package type, nominal quantity,
  |                      current quantity, UoM, seal, expiry, location, condition, state
  |
  +-- issue_requests     authorized package count / quantity, request state
  |
  +-- issue_transactions issued / consumed / returned / disposed (variance is derived)
  |
  +-- container_ledger   append-only state history
  |
  +-- return_inspections eight-point checklist, declared vs measured quantity
  |
  +-- container_checks   quarterly cadence
```

Control-plane tables: `conflicts`, `sync_nodes`, `hitl_exceptions`, `security_events`, `blockers`.

Forward migrations extend the preserved baseline (the 24-table `schema.sql` is not rewritten):

| Migration | Adds |
|---|---|
| `001_material_identity.sql` | material identifiers (NSN / manufacturer part), legacy `quantity_on_hand` removal guards |
| `002_container_package.sql` | container package fields, label register, facility/owning command |
| `003_custody_event_model.sql` | custody assignments, container label history, `audit_events` hash-chained bus |
| `004_role_capability_model.sql` | `principals`, `roles`, `principal_roles`, `capability_catalog`, `role_capabilities`, `policies`, `authorization_decisions` |
| `005_security_events.sql` | event normalization columns, `security_assets`, `security_ingest_sources`, `security_incidents`, `incident_actions`, `security_event_links`, `vulnerabilities`, `configuration_checks`, `integrity_checks` |
| `006_assurance_evidence.sql` | `controls`, `control_evidence`, `assessments`, `findings`, `poam_entries`, `assessment_events` |

The `schema_migrations` ledger makes the `ALTER TABLE` migrations idempotent across restarts. Both `src/lib/db.ts` and `scripts/seed.mjs` apply migrations in lexical order.

---

## Exact decimal quantities

`Quantity` is never a float. SQLite `REAL` is IEEE-754 binary floating point, where `0.1 + 0.2 !== 0.3`, and an accountable remainder of 1.600 would not compare equal to 1.6.

- Every quantity column is `TEXT` holding a canonical decimal string (`"5.000"`, `"3.400"`).
- `src/lib/qty.ts` parses those strings into a BigInt of scaled integer units plus an explicit scale, and performs exact `add`, `sub`, `cmp` and `sum`.
- The seed assertion `5.000 - 3.400 = 1.600` is exact by construction.
- JSON responses render quantities as decimal strings; BigInt internals never leak.
- A quantity is never summed across different units of measure. 20 GAL of hydraulic fluid and 192 OZ of lubricant live in different dimensions.
- `current_quantity = NULL` means the remainder is UNKNOWN. It is never coerced to `0`.

Units of issue: `EA` each, `BX` box, `KT` kit, `DR` drum, `PA` pail, `CA` cartridge/container. Discrete products are tracked as whole packages unless `partial_container_accounting = 1`.

Measurement bases: `VOLUME`, `MASS`, `COUNT`, `LENGTH`, `AREA`, `PRESSURE`, `SERVICE_HOURS` (plus the reported remainder methods `ESTIMATED` and `MEASURED` on inspections).

---

## Accountability buckets

There is no `quantity_on_hand` column. Per material, quantities roll up into separate buckets:

`AVAILABLE`, `RESERVED`, `ISSUED` (in custody), `RETURN_HOLD`, `QUARANTINED`, `EXPIRED`, `DISPOSITION_PENDING`, `DISPOSED`.

Buckets are computed from container state and current quantity. A bucket cell shows the known subtotal plus an explicit `+N UNKNOWN`; if every container in the bucket is unmeasured it reads `N x UNKNOWN`. The on-hand total excludes disposed containers and never hides unknown members.

`ON_HAND_TOTAL` is the sum of the known quantities in all non-disposed buckets, always accompanied by its unknown count.

---

## Lifecycle

Two machines, both enforced server-side in `src/lib/lifecycle.ts` and `src/lib/repo.ts`.

Request:

```
REQUESTED -> VALIDATED -> AUTHORIZED -> RESERVED -> PICKUP_READY -> ISSUED
                                                              \-> CANCELLED
```

Container:

```
AVAILABLE -> RESERVED -> ISSUED -> IN_CUSTODY -> IN_USE
                                              -> FULLY_CONSUMED
                                              -> RETURN_INITIATED
RETURN_INITIATED -> RETURN_RECEIVED -> RETURN_HOLD
RETURN_HOLD -> INSPECTED -> RESTOCK_APPROVED -> AVAILABLE
                        \-> RELABEL_REQUIRED -> RESTOCK_APPROVED
                        \-> QUARANTINED
                        \-> DISPOSITION_REQUIRED -> DISPOSED
EXPIRED -> DISPOSITION_REQUIRED | DISPOSED
```

There is deliberately **no edge from RETURN_RECEIVED to AVAILABLE**. A returned container must pass through `RETURN_HOLD` and an accepted inspection.

`ACCEPT` requires all eight checklist items confirmed, no failed damage/contamination check, a measured remaining quantity, and `measurement_method = MEASURED`. Anything less returns `422`; the container stays out of available stock.

---

## Views

| Route | What it shows |
|---|---|
| `/` | Operations overview - KPI strip, chain counts, hazmat posture, decisions needed, control-plane attention, gaps by stage |
| `/traceability` | Mission-level chain summary with issue/evidence/approval/gap counts |
| `/traceability/[id]` | The full 12-stage chain for one mission requirement, stage by stage, with a per-chain gap list |
| `/hazmat` | Hazmat control overview: bucket KPIs, accountability by material, pending inspections, recent ledger |
| `/hazmat/inventory` | Per-material identity plus all eight accountability buckets and the container breakdown |
| `/hazmat/containers` | Container register: lot, quantities, seal, condition, expiry, location, state, inspection |
| `/hazmat/containers/[id]` | One container: identity, state, allowed transitions, transactions, inspections, checks, ledger |
| `/hazmat/issues` | Issue requests and accountable transactions with derived variance |
| `/hazmat/returns` | Return intake into RETURN_HOLD, pending eight-point inspections, completed inspections |
| `/hazmat/lifecycle` | Append-only container ledger plus both state-machine transition tables |
| `/hazmat/quarterly` | Quarterly usage checks, overdues and unknown schedules |
| `/hazmat/expirations` | Container shelf-life register: stored state vs computed expiry state, never merged |
| `/conflicts` | Conflict queue with inline resolution |
| `/sync` | Offline-sync node status and pending change counts |
| `/hitl` | Human-in-the-loop exception queue with decisioning |
| `/security` | SOC console: failed logins, open vulnerabilities, active incidents, configuration drift, integrity mismatch, ingest-source health, correlation groups and the normalized event register |
| `/security/incidents` | Incident register with action timeline, linked events and capability-gated status changes |
| `/security/vulnerabilities` | Vulnerabilities (CVSS as decimal text), asset inventory, configuration checks and integrity observations |
| `/assurance` | RMF posture projected from controls, evidence, assessments, findings and POA&M |
| `/assurance/controls` | Control catalogue by NIST family, evidence health and the full evidence register |
| `/assurance/findings` | Findings register with gated status changes and POA&M milestones |
| `/identity` | Acting principal, principal directory, canonical capabilities, policy table and decision summary |
| `/audit` | Hash-chain integrity, recent plane events and the full authorization-decision ledger |
| `/approvals` | Staging/production deployment approvals, plus HITL exceptions gating release |
| `/blockers` | Open impediments with owners |
| `/evidence-gaps` | The derived gap register across the whole system |
| `/weekly` | H-LIFT weekly status report, copyable as Markdown, printable |

Plane reads are authorized. A principal without `security.events.read` or `assurance.controls.read` sees an **access denied** panel with the required capability and policy reason, not a partial view; switch the acting principal in the top bar to a role that holds the capability.

---

## API

All endpoints return JSON. Mutations validate server-side; decisions require a named human identity.

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/health` | Service status plus overview summary |
| GET | `/api/overview` | Full overview aggregate |
| GET | `/api/traceability` | Mission summaries |
| GET | `/api/traceability/[id]` | Mission detail: chain tree + gaps |
| GET | `/api/hazmat/materials` | Materials with identity and measurement metadata |
| GET | `/api/hazmat/containers` | Containers with material join, bucket, variance and inspection |
| GET | `/api/hazmat/containers/[id]` | Container detail: ledger, transactions, inspections, checks, allowed transitions |
| POST | `/api/hazmat/containers/[id]/transition` | Body: `{ to, actor, notes? }` - illegal edges return `422` |
| GET | `/api/hazmat/inventory` | Per-material accountability buckets |
| GET | `/api/hazmat/transactions` | Issue transactions with derived variance |
| GET | `/api/hazmat/inspections` | Return inspections, pending first |
| POST | `/api/hazmat/inspections/[id]/decision` | Body: `{ inspector, outcome, checks, measured_quantity?, measurement_method?, notes? }` |
| GET | `/api/hazmat/expirations` | Container shelf-life register, earliest expiry first |
| GET | `/api/hazmat/quarterly` | Quarterly check queue |
| GET, POST | `/api/hazmat/returns` | List inspections / receive a return into RETURN_HOLD |
| GET | `/api/conflicts` | Conflict queue |
| POST | `/api/conflicts/[id]/resolve` | Body: `{ resolution }` |
| GET | `/api/sync` | Sync nodes |
| GET | `/api/hitl` | HITL exceptions |
| POST | `/api/hitl/[id]/decision` | Body: `{ action: "approve" \| "reject", decided_by, note? }` |
| GET | `/api/security` | Aggregated SOC data: summary, normalized events, incidents, vulnerabilities, assets, configuration, integrity, sources, correlations |
| GET | `/api/security/incidents` | Incident summary and register |
| POST | `/api/security/incidents/[id]` | Body: `{ status, actor, note? }` - requires `security.incident.manage` |
| GET | `/api/security/vulnerabilities` | Vulnerability summary and register |
| GET | `/api/assurance` | RMF summary, controls, evidence, assessments, findings, POA&M |
| POST | `/api/assurance/findings/[id]` | Body: `{ status, actor, note? }` - closing requires `assurance.finding.close` |
| GET | `/api/identity` | Acting principal, role label and principal directory with capabilities |
| GET | `/api/audit` | Chain status, recent events and the authorization-decision ledger |
| GET | `/api/approvals` | Approvals joined to artifact |
| POST | `/api/approvals/[id]/decision` | Body: `{ action: "approve" \| "reject", approver, note? }` |
| GET | `/api/blockers` | Blockers |
| GET | `/api/evidence-gaps` | Derived gap register |
| GET | `/api/weekly-status` | Weekly data + markdown; `?format=markdown` returns `text/markdown` |

### Mutation rules

- `returned_quantity` must be a canonical decimal string such as `"3.400"`. Exponent notation, blanks and non-numeric text return `422`.
- A return is received as `RETURN_INITIATED -> RETURN_RECEIVED -> RETURN_HOLD` with `return_inspections.outcome = 'PENDING'`. The API never puts it into AVAILABLE.
- A declared or estimated remainder is stored on the inspection as UNVERIFIED. `current_quantity` stays NULL until a measurement exists.
- `ACCEPT` requires all eight checks confirmed, no failed check, a measured quantity and `MEASURED`. Otherwise `422`.
- An illegal lifecycle transition returns `422`; so does transitioning to AVAILABLE without an accepted inspection.
- Approvals and HITL decisions without a non-empty `approver` / `decided_by` return `422`. There is no anonymous approval path.
- Deciding an already-decided record returns `422` rather than overwriting the decision.
- Every operational and governance mutation passes through `requireRequest()` first. A denial returns `403` with the persisted decision (`error`, `decision.reason_code`, `decision.obligations`), so the caller can distinguish authorization from validation failure.
- Returns, inspections, container transitions, approvals, HITL decisions, conflict resolutions, incident status changes and finding status changes all append to the hash-chained audit bus with the acting subject.
- Writes require `HIGH` credential assurance; facility-scoped writes require a matching facility; issue/receive/inspect/relabel require a valid recorded expiry.
- Self-approval is denied by `SEGREGATION_OF_DUTIES`, including when the approver names the requester's display name, email or subject.
- Read pages authorize with `{ record: false }`; browsing does not flood the decision ledger.

---

## Status rules

`src/lib/status.ts` is the single source of truth.

- **Stored state** - what the source system recorded. Never rewritten by the UI.
- **Computed state** - e.g. shelf-life `EXPIRED` / `EXPIRING_30D` / `OK`, derived from `expires_at` and today's date. Displayed *alongside* stored state, never substituted for it.
- **UNKNOWN** - the value was not provided, could not be parsed, or a required record is missing.
- **UNVERIFIED** - a value exists but has not been independently confirmed.
- Missing dates, actors, owners and approvers render as `UNKNOWN`, never as a plausible default.

### Derived gaps

`evidenceGaps()` walks every requirement and reports no evidence, unverified evidence, failed evidence, missing merged PRs, and missing design/issue/artifact/approval/validation/release records.

Hazmat gaps include missing expiry, unknown container quantity, quarantine/expiry/disposition states, unaccepted returns, quantity variances, unverified return quantities, and overdue/unknown quarterly checks.

---

## Returns and inspections in the demo

The two cases that motivated the model correction are seeded literally:

| Container | Story | State |
|---|---|---|
| `CT-HYD-0004` | 5 GAL pail issued, 3.400 GAL measured return, 1.600 GAL consumed | `RETURN_HOLD` with a pending eight-point inspection |
| `CT-TUBE-018` | operator declared 2.000 H remaining, no inspector measurement | `RETURN_HOLD`, `current_quantity = NULL`, quantity shown as UNKNOWN |
| `CT-TUBE-014` | 2.000 H measured, all eight checks passed | accepted, restocked as `AVAILABLE` |
| `CT-ADH-001` | 32.000 OZ issued, 12.000 consumed, 18.000 returned = 2.000 OZ variance | `DISPOSITION_REQUIRED`, variance not written off |

Open `/hazmat/returns` to receive a return or decide a pending inspection. The intake form refuses anonymous receipt; the decision form refuses an incomplete ACCEPT.

---

## Weekly status format - HLIFT-WSR v1

`src/lib/weekly.ts` renders a fixed eight-section report (`HLIFT-WSR v1`):

1. Mission and requirements flow
2. Delivery pipeline
3. Hazmat: containers, quantities and inspections
4. Conflicts, sync and offline status
5. HITL exceptions and cybersecurity
6. Blockers and evidence gaps
7. Decisions needed this week
8. Next week

**Caveat:** the mandated H-LIFT weekly layout was never supplied, so this is a self-defined v1 template with a stable section order and a stable data contract (`weeklyData()` in `repo.ts`). If the programme has a prescribed format, replace the renderer in `weekly.ts` only - every view and the API keep working.

Two fields are deliberately `UNKNOWN`:

- **Delta vs previous report** - no prior report is stored, so no trend is invented.
- **Section 8 narrative** - owner commentary is not derivable from records. Section 8 lists only focus items derived from the open records above it, labelled as derived.

Copy the Markdown with the button on `/weekly`, or fetch `/api/weekly-status?format=markdown`.

---

## Notes

- The demo dataset is intentionally incomplete: unknown artifact builds, a failing end-to-end test, a quarantined container with no expiry, a sync node that never registered, a security event with no conclusion, a stale integrity source, two configuration drifts, unassessed controls, stale and missing evidence, and a declared-but-unmeasured return. These exist so the "don't guess" behaviour is observable.
- Security-plane counts are seeded from records, not fabricated: 14 failed authentication events, 7 open/triaged vulnerabilities, 2 active incidents, 2 configuration drifts, 1 integrity mismatch and 4 raw security events. Assurance counts are 42 controls (29 implemented), 75 evidence objects (65 current, 7 stale, 2 missing), 6 open findings and 7 POA&M entries. `npm run db:verify` asserts all of them.
- The demo identity assertion is a pilot adapter, not production authentication. In a real deployment the identity service supplies a signed assertion and H-LIFT verifies it; H-LIFT still never handles credentials. Changing `hlift_subject` in the demo is equivalent to switching the console's asserted principal.
- Seed data is fictional. No real mission, personnel or supplier data is present. NSNs and CVEs are illustrative; manufacturer/part numbers are labelled "(demo)".
- The hazmat correction is schema-level: legacy `hazmat_items`, `hazmat_events`, `hazmat_checks` and any `quantity_on_hand` / REAL quantity column are removed. Do not reintroduce them.
- The audit chain is only useful if it is verified. `/audit` and `npm run db:verify` recompute it from genesis. Do not edit `audit_events` rows in place; append a correcting event instead.

---

## License

H-LIFT is released under the **Business Source License 1.1** (see `LICENSE`).

- You may **view, modify, and make non-production use** of the source code, and contribute improvements.
- **Production use** — including any deployment supporting a government, military, or commercial operation — requires a paid license agreement with the Licensor.
- On the **Change Date (2029-11-16)**, this version of the Licensed Work becomes available under the **Apache License, Version 2.0**.

For licensing inquiries, contact the repository maintainers.
