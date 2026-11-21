# H-LIFT Security Controls Overlay

This document maps the hardening implemented in H-LIFT to the frameworks the
programme references: **DoD SRG/STIGs**, **NIST SP 800-53 Rev. 5**, **NIST SP
800-207 (Zero Trust Architecture)**, **RFC 8446 (TLS 1.3)**, **W3C web
security**, **FedRAMP**, **ISO/IEC 27001**, and **STIX/TAXII/SIEM**.

Status key: **Implemented** (code or configuration in this repository),
**Deployment** (must be set by the deployment environment), **Partial** (pilot
shortcut that must be replaced before production).

## Control matrix

| Framework | Control | H-LIFT implementation | Status |
|---|---|---|---|
| NIST 800-53 AC-2 | Account management | `principals`, `roles`, `principal_roles`, `role_capabilities`; six seeded subjects; no anonymous account | Implemented |
| NIST 800-53 AC-3 | Access enforcement | `src/lib/authz.ts` scoped policy engine; capability + command + facility + lifecycle + expiry + assurance | Implemented |
| NIST 800-53 AC-6 | Least privilege | Canonical capabilities, not role names; narrow `assurance.finding.close`, `release.approve`, `exception.decide` | Implemented |
| NIST 800-53 AC-17 | Remote access | mTLS mapping for `/taxii2/` in `deploy/tls/nginx.conf`; proxy asserts identity from the client certificate | Deployment |
| NIST 800-53 AU-2 / AU-3 | Audit events | Append-only `audit_events` with subject, resource, correlation, outcome | Implemented |
| NIST 800-53 AU-6 | Audit review | `/audit` recomputes the SHA-256 chain from genesis; `npm run db:verify` asserts integrity | Implemented |
| NIST 800-53 AU-12 | Audit generation | Every PERMIT/DENY, mutation, integration sync and webhook appends an event | Implemented |
| NIST 800-53 IA-9 / SC-8 | Service authentication | Webhook shared secrets are constant-time compared and required when `HLIFT_ZERO_TRUST=1`; unauthenticated writes fail closed | Implemented |
| NIST 800-53 CM-6 | Configuration settings | Baseline configuration checks + drift records (`configuration_checks`), reported as drift, never silently healthy | Implemented |
| NIST 800-53 IA-2 | Identification & authentication | `verifyAssertion()` validates HS256 JWT signature, issuer, audience and expiry; `sub` becomes the principal; demo fallback is disabled in signed mode | Implemented |
| NIST 800-53 IA-5 | Authenticator management | H-LIFT stores no credentials, tokens or keys (see `SECURITY.md`) | Implemented |
| NIST 800-53 IR-4 / IR-5 | Incident handling | `security_incidents`, `incident_actions`, capability-gated status changes, linked events | Implemented |
| NIST 800-53 RA-5 | Vulnerability scanning | `vulnerabilities` register with CVSS as decimal text; exported as STIX | Implemented |
| NIST 800-53 SC-8 / SC-23 | Transmission confidentiality/integrity | TLS 1.3 only at the edge; HSTS preload; no downgrade | Deployment + Implemented |
| NIST 800-53 SC-13 | Cryptographic protection | SHA-256 audit chain; TLS 1.3 AES-256/ChaCha20/AES-128 suites; constant-time webhook and assertion signature comparison | Implemented |
| NIST 800-53 CP-9 / SC-8 | Backup protection | `npm run backup:encrypted` / `restore:encrypted` use scrypt + AES-256-GCM with a passphrase that is never stored | Implemented |
| NIST 800-53 SI-2 | Flaw remediation | CI runs typecheck, build, seed verification, Docker build, gitleaks and blocking `npm audit --audit-level=high` | Implemented |
| NIST 800-53 SI-4 | System monitoring | SOC console, ingest-source health (`STALE` never healthy), configuration and integrity observations | Implemented |
| NIST 800-207 4.1 | Identity as the perimeter | `x-hlift-subject` / `hlift_subject` assertion on every request; `src/proxy.ts` rejects unasserted `/api` calls when `HLIFT_ZERO_TRUST=1` | Implemented |
| NIST 800-207 4.2 | Least privilege, per-transaction | `authorize()` evaluated per request; decisions persisted; segregation of duties | Implemented |
| NIST 800-207 4.3 | Micro-segmentation | Facility scope (`FACILITY_SCOPE_MISMATCH`) and command hierarchy (`DESCENDANTS`) enforced in policy | Implemented |
| NIST 800-207 4.4 | Continuous monitoring/verification | Decision ledger + hash-chained audit bus; deny decisions are recorded, not swallowed | Implemented |
| NIST 800-207 4.5 | Assume breach | Append-only audit, integrity observations, hash-chain verification, no inferred data | Implemented |
| RFC 8446 | TLS 1.3 only | `deploy/tls/nginx.conf`: `ssl_protocols TLSv1.3`, tickets off, OCSP stapling, HSTS | Deployment |
| RFC 6797 / W3C | Transport + document security | HSTS preload, CSP, `X-Content-Type-Options`, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy` in `next.config.mjs` | Implemented |
| W3C WebAppSec | Content Security Policy | CSP with `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | Implemented |
| FedRAMP AC/AU/SC | Baselines | Same controls as NIST 800-53 Rev. 5 above; FedRAMP is a profile of them | Implemented |
| FedRAMP / STIG | Container hardening | Multi-stage image, patched Alpine packages in every stage, npm/corepack removed from runtime, non-root `hlift` user, healthcheck, no secrets in the image | Implemented |
| ISO/IEC 27001 A.9 / A.12 | Access & operations | Authz engine, audit bus, configuration drift, change-gated CI | Implemented |
| ISO/IEC 27001 A.16 | Incident management | Security plane + incident register + POA&M in the assurance plane | Implemented |
| STIX 2.1 | Threat information | `src/lib/stix.ts` projects security events to indicators and vulnerabilities to STIX vulnerability objects; `GET /api/security/stix` | Implemented |
| TAXII 2.1 | Protocol | `/taxii2/` discovery, `/taxii2/collections/`, collection detail, manifest and objects endpoints | Implemented |
| SIEM | Log forwarding | `src/lib/siem.ts` forwards every audit event to `SIEM_WEBHOOK_URL` (best-effort, optional) | Implemented |

## Zero Trust posture (NIST 800-207)

1. **No implicit trust zone.** Every `/api` request is gated when
   `HLIFT_ZERO_TRUST=1`; there is no network-based trust.
2. **Identity is asserted per request**, not per session. In lab mode the
   assertion is `x-hlift-subject` / `hlift_subject`; with
   `HLIFT_IDP_HMAC_SECRET` configured it is a verified HS256 JWT in
   `x-hlift-assertion` / `hlift_assertion`, and no demo principal fallback is
   applied.
3. **Least privilege per transaction.** The policy engine resolves capability,
   assurance, command, facility, lifecycle and expiry on every decision.
4. **Micro-segmentation.** Facility and command hierarchy scoping are policy
   attributes, not network topology.
5. **Continuous verification.** Every decision is persisted and written to the
   hash-chained bus; denies are first-class records. Machine webhook writes are
   fail-closed under the same setting.
6. **Assume breach.** Integrity observations, hash-chain verification and the
   rule that unknown data is preserved rather than guessed.

## Known gaps (must close before production)

- **Asymmetric IdP assertions.** H-LIFT verifies HS256 shared-secret JWTs. If
  your IdP issues RS256/JWKS assertions, plug its verifier into
  `verifyAssertion()`; until then the shared secret must be protected as a key.
- **TLS termination.** TLS 1.3 is enforced by the edge proxy manifest; a bare
  `npm start` deployment has no TLS. This needs a host, DNS name and certificate.
- **Filesystem encryption at rest.** Backups are encrypted by the scripts above;
  encrypting the live `data/` volume (LUKS, BitLocker, cloud KMS) remains a host
  responsibility.
- **TAXII authentication** relies on the deployment (mTLS or a proxy-injected
  `x-hlift-subject`); `HLIFT_TAXII_OPEN=1` must never be set in production.

## Verification

```bash
npm run check                       # typecheck + pristine seed and audit chain
curl -s -H 'x-hlift-subject: cyber.s.lee' http://localhost:3000/api/security/stix
curl -s -H 'x-hlift-subject: cyber.s.lee' http://localhost:3000/taxii2/
curl -s -H 'x-hlift-subject: cyber.s.lee' http://localhost:3000/taxii2/collections/
# Zero Trust: with HLIFT_ZERO_TRUST=1, this must return 401
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/overview
```

Signed assertions and encrypted backups:

```bash
# Server started with HLIFT_IDP_HMAC_SECRET=<secret>
curl -s -H 'x-hlift-assertion: <signed-jwt>' http://localhost:3000/api/identity
# A plain x-hlift-subject header is ignored in this mode.

HLIFT_BACKUP_PASSPHRASE=<long-random-passphrase> npm run backup:encrypted
HLIFT_BACKUP_PASSPHRASE=<long-random-passphrase> npm run restore:encrypted -- backups/<file>.db.enc
npm run db:verify                   # always verify the chain after a restore
```

SIEM forwarding can be pointed at any collector:

```bash
SIEM_WEBHOOK_URL=https://siem.example.mil/hlift SIEM_WEBHOOK_SECRET=... npm run dev
```

Container image verification:

```bash
docker build -t h-lift:local .
docker scout cves local://h-lift:local --only-severity critical,high --exit-code 1
```
