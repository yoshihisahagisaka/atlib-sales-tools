# General SECU:MIE staging provisioning plan — 2026-11-28

Status: candidate / not executed. Source evidence PR #134 and C4. No production or existing DB changes. Existing shared Staging instance secumie-sg-shared-staging-db in msp-zabbix / asia-northeast1. Deadline 2026-12-04 10:12:12 JST (existing preservation decision; no extension). No new Cloud SQL instance.

## Fixed new resources (candidate)

| Resource | Identity | Cap |
|---|---|---:|
| Database | secumie_general_staging | separate logical DB |
| Migration | secumie_general_migration_staging | 1 |
| Public writer | secumie_general_writer_staging | 4 |
| Staff | secumie_general_staff_staging | 2 |
| Secret | secumie-general-stg-db-migration-password | independent generated credential |
| Secret | secumie-general-stg-db-writer-password | independent generated credential |
| Secret | secumie-general-stg-db-staff-password | independent generated credential |
| Secret | secumie-general-stg-receipt-secret | independent >=32 byte cryptographic value |

No existing secret payload reset, new IAM grants or production credentials; use existing authorized operator private connection. Do not reuse the old Insight bootstrap job. Any new runtime SA/Secret grants are independent acceptance decisions. Receipt secret separate from all DB passwords.

## Execution gates

1. Verify actual instance identity, private reachability via previously proven IAP path, successful backup/PITR and deletion protection, no name collisions (new DB/roles/Secrets), existing stage cost/deadline and current topology including unbounded WEB roles. Compare fresh server identity/connection metadata to owner CSV; stop if insufficient. Preserve existing 78 budget and allow 7 new stage role connections plus operator reserve. Do not raise DB flags. No DB rows read.
2. After limited staging-only authorization, use authorized operator with existing bootstrap credential; generate distinct credentials via Secret Manager using nonlogging flow, and create three non-elevated login roles with caps 1/4/2. Role SQL uses only approved fixed identifiers; password values passed through a secure client, not command arguments or SQL Studio history. Validate role flags and memberships before proceeding. Create only secumie_general_staging owned by migration role; revoke PUBLIC CONNECT/TEMP, grant CONNECT only to approved operator and dedicated roles. No cross-database grants. Stop on partial failure; no automatic deletion or overwrite.
3. Reuse src/db/migrate.ts on exact tracked design/secumie-general/migrations 001-006 (ordered, ledger, transactional per file). Verify exact filenames/sha256, database/role/PG16 guards, owners and role grants. No existing Insight/WEB/Guard or main migrations. Disposable CI has proven 001-006; actual staging run not yet executed.
4. Synthetic acceptance: two leads, both results, correction and cap, optional consultation using synthetic mail transport, signed staff session, link/unlink, shared sales state, denied operations. Use existing test runner/private endpoint and no public traffic. Preserve only aggregate evidence; remove synthetic test data via separately reviewed isolated cleanup or discard newly created dedicated staging DB after approval. Do not delete any other DB/role/secret. Actual Workspace/SMTP and image scan are separate gates.
5. Stop if shared resource impact, expiry or cost breach, ACL mismatch, authentication failure, unexpected objects, or security gate. Production equivalent migration and rollout remain independent. Retention/consent policy pending.

## Staging bootstrap execution candidate

C4 CI 46141966430 SUCCESS. Standalone Python operator script scripts/readiness/secumie_general_staging_bootstrap.py uses existing IAP route to msp-frontend-server, exact staging private IP 172.20.0.3 and postgres bootstrap Secret version 1; no value display. Default read-only; --apply creates only four new secrets, three capped non-elevated roles and one logical DB; stop on collision or partial failure, no blind retries. Guard fresh backup/PITR/deletion protection, exact observed existing DB/role inventory, capacity, no currently connected unbounded WEB role, no PUBLIC CONNECT to existing application DBs (if present, STOP for review, never modify them), normal statement logging configuration, and deadline. Client-generated SCRAM verifier in DDL, no raw password in SQL/argv/output; Cloud SQL server log policy still an operational prerequisite. Authenticate each new role and check DB ownership/ACL/Secret version metadata. Do not run 001-006 until bootstrap PASS. Existing IAP SSH access required; no IAM changes. Only bootstrap and metadata preflight, not actual GCP execution. New unit tests check verifier and capacity; actual cloud operator path untested. Do not use a production target or alter existing resources. Cost/expiry remains existing approved preservation scope; no extension.

## Partial bootstrap STOP and recovery decision — 2026-11-28

Owner log from source af805de3ef360dace6edc063e216b099c89e226b: metadata and DB preflight PASS (320 available, 10 observed); four new Secrets created and three roles committed; CREATE_DATABASE_FAILED. No migration. CI 46142307040 SUCCESS before real operator execution; this was not real Cloud SQL owner-boundary acceptance. Error stderr intentionally suppressed to avoid credential leakage; exact cause not directly captured. The prior Insight Staging canonical (docs/secumie-shared-staging-db-bootstrap-approval-20261106.md) records the identical CREATE DATABASE OWNER failure, and successful recovery via postgres-owned DB + explicit migration DB CREATE and public schema USAGE/CREATE, without role membership changes. Reuse that proven recovery boundary, not temporary role membership or password reset. This corrects the original owner assumption. New --recover --apply checks exact original + new role inventory, all three non-elevated role caps/no memberships, target DB absent, four existing secrets with single enabled version 1, verifies preserved role authentication, creates only the missing database, applies restricted DB/public-schema ACL and verifies postconditions. No recreation/rotation, no changes to existing roles/DB/Secrets; no automatic retry if partial state differs. Disposable PostgreSQL acceptance setup now uses non-superuser CREATEDB owner with no migration membership, rather than superuser-created migration-owned DB. Migration 001-006 still run as dedicated migration role; unchanged. GCP recovery pending; exact failure reason remains inferred from matching previous incident.
