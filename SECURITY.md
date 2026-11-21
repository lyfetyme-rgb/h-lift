# Security policy

## Reporting a vulnerability
Report suspected vulnerabilities privately to the repository maintainers. Do not open a public issue for an undisclosed vulnerability.

## Secrets
H-LIFT never stores or handles credentials. Identity is asserted by the DoD identity service through the identity adapter (`src/lib/identity.ts`). No password, token, key or secret is committed to this repository; `.env` and `data/*.db` are gitignored. If you find a committed secret, treat it as an incident: rotate it immediately and notify the maintainers.

## Deployment hardening
- Run as the non-root `hlift` user (the Docker image does this by default).
- Keep `SEED_DEMO` unset in production so the demo dataset is not loaded.
- Put the service behind TLS and your command's identity-aware proxy. Use TLS 1.3 only - `deploy/tls/nginx.conf` is the reference edge configuration (RFC 8446).
- Back up and protect the SQLite volume (`hlift-data`); it contains operational records and the hash-chained audit bus.
- Verify the audit chain after any restore: `npm run db:verify` (or `/audit` in the console).
- Enable Zero Trust (`HLIFT_ZERO_TRUST=1`) so unasserted `/api` requests are rejected.
- Forward the audit bus to your SIEM with `SIEM_WEBHOOK_URL` / `SIEM_WEBHOOK_SECRET`, and/or consume the STIX export (`/api/security/stix`) and TAXII feed (`/taxii2/`).
- See `SECURITY_CONTROLS.md` for the full mapping to NIST 800-53 Rev. 5, NIST 800-207, RFC 8446, W3C web security, FedRAMP/ISO 27001 and STIX/TAXII/SIEM.

## Supported versions
Only the latest commit on `main` is supported.
