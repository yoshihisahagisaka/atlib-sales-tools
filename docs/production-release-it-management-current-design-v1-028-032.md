# IT経営KAIZEN Current Design v1 — Production Release Package 028–032

## Release identity

- Starting application Release Candidate: `dffde2ffd73887650442bfeb18e258f258d7dac3`
- Branch: `release-candidate-sales-tools-20261008`
- Scope: a dedicated migration artifact containing only migrations 028–032, a separately built runtime artifact, and a read-only Production preflight.
- Out of scope: Production migration execution, Production DB writes, Cloud Run traffic changes, and runtime deployment.

## Decision provenance

Migration 028 was introduced by `7979621` as a Phase 1 draft and updated by `e5fc3bd` for disposable Phase 2B testing. The historical comment remains unchanged.

The 2026-10-08 Production Release Decision explicitly approves 028–032 as this Release Package's migration set, after Current Design v1 completion, runtime dependency confirmation, integrated regression, PostgreSQL 16 rehearsal from 027 through 032, and migration-executor architecture confirmation. This authorizes package creation and read-only preflight only; it does **not** authorize execution of a Production migration Job.

## Artifact contract

The canonical manifest is [`production-it-management-current-design-v1-028-032.json`](../migration-allowlists/production-it-management-current-design-v1-028-032.json).

`scripts/migration/buildItManagementCurrentDesignReleaseArtifact.cjs` reads each allowlisted SQL file directly from its canonical Git blob at the starting RC, rejects CRLF bytes, and verifies blob ID, byte count, SHA-256, order, and final Release Candidate ancestry. It writes a context with only the five SQL files, `manifest.json`, compiled migration CLI, production dependencies, and the dedicated Dockerfile.

The migration image must be built and later run by immutable registry digest, with OCI label `org.opencontainers.image.revision` set to the final Release Candidate SHA. Its only command is `node dist/db/migrateCli.js` and `MIGRATIONS_DIR` must be `/app/migrations`.

## Read-only Production preflight

`scripts/migration/preflightItManagementCurrentDesignV1Production.cjs` requires `PREFLIGHT_READ_ONLY=true`, validates the built artifact before connecting, then uses `BEGIN READ ONLY` and verifies:

1. `sales_tools`, PostgreSQL 16.x, and transaction read-only state.
2. `027_free_diagnosis_rule_based_v1.sql` exactly once; 028–032 absent; no migration number greater than 027.
3. Required 027 baseline tables and constraints.
4. Ownership of every altered table by `sales_tools_migration`.
5. The baseline `sales_activity` count for later compatibility verification.

The command does not execute SQL migrations and does not create, alter, grant, insert, update, or delete anything.

## Future execution configuration — not performed by this package

Only after a separately approved Production migration execution decision:

- Cloud Run Job identity: a new dedicated 028–032 Job, not an update of an existing Job.
- Service account: `sales-tools-sa@msp-zabbix.iam.gserviceaccount.com`.
- DB role: `sales_tools_migration`.
- Password secret reference: `sales-tools-production-migration-db-password`.
- Cloud SQL socket: the Production `sales_tools` instance attachment.
- Command: `node dist/db/migrateCli.js`.
- Environment: `MIGRATIONS_DIR=/app/migrations`.
- Retry count: zero; immutable image digest only.

After a successful execution, a separate fail-closed read-only verifier must check ledger entries, columns, PK/FK/composite FK/CHECK/generated columns/indexes, runtime `sales_tools_app` DML privileges, `referral_person_name`, and legacy-row compatibility.
