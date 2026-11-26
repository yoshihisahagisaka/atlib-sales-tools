# atLIB Test Runner VM — Sales Tools Verification Runbook

Status: OPERATOR-PROVIDED VM IDENTITY / HOST CAPABILITIES NOT YET VERIFIED
Date: 2026-11-26 JST
Scope: Sales Tools Common Foundation and service-isolated verification; no Production changes.

## 1. Registered VM identity

| Setting | Operator-provided value |
| --- | --- |
| GCP project | `msp-zabbix` |
| VM name | `atlib-test-runner` |
| Zone | `asia-northeast1-a` |
| Login user | `yoshihisa_hagisaka_atlib_jp` |
| Home | `/home/yoshihisa_hagisaka_atlib_jp` |
| Access | IAP-tunneled SSH |

These values are provided by the operator. This document does **not** claim that SSH, Docker, PostgreSQL, Node, Playwright, network egress, or permissions were tested on the VM.

Default: reuse this VM before requesting another VM, Cloud SQL instance, or other GCP resource.

## 2. Authorized scope and prohibitions

Use the existing VM for disposable Docker builds, isolated PostgreSQL/Migration tests, integrated tests, Playwright E2E, and pre-release acceptance.

- Pin every run to a reviewed Git commit SHA and record the exact commit, image digest if built, dependencies, command, result, and timestamp.
- Isolate each run by unique directory, Docker container name, test database/schema, and network/port. Keep a record of owned resources for cleanup.
- Never treat isolated test evidence as authorization for Production deployment.
- Do not execute Production migration, write to Production Cloud SQL, change Cloud Run, push images to Production Artifact Registry, alter Traffic, DNS, Secrets, IAM, or merge PRs without separate explicit approval.
- Do not reuse Production DB credentials, service-account keys, Secret values, or production customer records for tests.
- No blanket `docker system prune`, global container stop, or deletion of other workspaces. Cleanup only resources created for the specific run.
- If resources, privileges, or tools are missing: STOP and report; do not install packages, grant roles, or create GCP resources automatically.

## 3. Connection and identity check (non-mutating)

From a machine with an authorized `gcloud` identity:

```bash
gcloud compute instances describe atlib-test-runner \
  --project=msp-zabbix \
  --zone=asia-northeast1-a \
  --format='table(name,status,zone)'
```

Connect using the *operator-specified* Linux account:

```bash
gcloud compute ssh 'yoshihisa_hagisaka_atlib_jp@atlib-test-runner' \
  --project=msp-zabbix \
  --zone=asia-northeast1-a \
  --tunnel-through-iap
```

Authentication and OS Login policy may restrict the selected account. If login identity differs, stop and check the existing IAM/OS Login configuration; do not change permissions.

On the VM, run read-only inventory first:

```bash
whoami
printf 'HOME=%s\n' "$HOME"
uname -a
command -v git || true
command -v docker || true
command -v node || true
command -v npm || true
command -v psql || true
docker version --format '{{.Server.Version}}' 2>/dev/null || true
docker compose version 2>/dev/null || true
node --version 2>/dev/null || true
```

Share availability/version results, not credentials, tokens, environment dumps, or metadata-service responses. Verify access and the installed toolchain before choosing any test method.

## 4. Repeatable verification procedure

1. Confirm the reviewed PR, HEAD SHA, and source lineage in GitHub. Fetch only that revision to a fresh run-specific workspace under the configured home. Verify `git rev-parse HEAD` equals the intended SHA and that `git status --porcelain` is empty. Never run an arbitrary branch tip as the reviewed candidate.
2. Review the test command and its database/network settings before execution. Confirm it uses only disposable data, loopback-bound ports or an isolated Docker network, and does not reference Production SQL sockets, Cloud SQL instance connections, or Production service credentials.
3. For container verification, use the reviewed `Dockerfile` and the exact candidate SHA as `SOURCE_REVISION`; build to a **local-only** tag. Check non-root user, runtime Node version, npm/npx absence, pinned security packages, and the OCI revision label. Do not push the image.
4. For PostgreSQL 16 checks, run a disposable local `postgres:16-alpine` container with an isolated test database and test credentials. Existing `test/adminPortalKpis.postgres.test.ts` currently requires loopback `127.0.0.1:55438`, database `portal_kpi`, and `RUN_PORTAL_KPI_PG16=1`; check port availability and the test's exact configuration before launching it. It applies repository Migrations 027/033/035 in an isolated schema; it is not a Production migration runner.
5. For Playwright E2E, use isolated test URLs/accounts. Reuse the existing browser test configurations and established browser dependencies; do not change host-wide packages without explicit approval. A successful Chromium/PDF smoke must generate real `%PDF-` bytes.
6. Compare functional/regression results with the established baseline. Record the two inherited IT vertical-slice failures separately; any additional/different failure is a new blocker.
7. Keep test logs and reports in a run-specific Evidence directory, redact sensitive values, and record exact SHA, VM identity, versions, commands, counts, and cleanup status.
8. Stop/remove **only** run-specific temporary containers, databases, networks, and files after preserving Evidence and ensuring no other test uses them. Avoid global or destructive cleanup.

### Example read-only repo pin and local container build

These examples do not run until repository access, Docker availability, and the reviewed SHA have been confirmed:

```bash
export REVIEWED_SHA='9ef708f74197c9b62c09ee3b4abf4479eb58852e'
export WORK_DIR="$HOME/atlib-verification/common-r4b-${REVIEWED_SHA:0:8}"
mkdir -p "$WORK_DIR"
git clone https://github.com/yoshihisahagisaka/atlib-sales-tools.git "$WORK_DIR/repo"
git -C "$WORK_DIR/repo" checkout --detach "$REVIEWED_SHA"
test "$(git -C "$WORK_DIR/repo" rev-parse HEAD)" = "$REVIEWED_SHA"
test -z "$(git -C "$WORK_DIR/repo" status --porcelain)"
```

```bash
cd "$WORK_DIR/repo"
docker build --target runtime \
  --build-arg "SOURCE_REVISION=$REVIEWED_SHA" \
  -t "sales-tools-vm-test:${REVIEWED_SHA:0:12}" .
docker image inspect "sales-tools-vm-test:${REVIEWED_SHA:0:12}" \
  --format 'user={{.Config.User}} revision={{index .Config.Labels "org.opencontainers.image.revision"}}'
```

These commands create local files and Docker images and are **not** part of the read-only inventory. Do not execute them on a shared VM until workspace naming, disk capacity, access, and cleanup ownership are approved.

## 5. R4c / Release gating

Reference baseline: Draft PR #121, HEAD `9ef708f74197c9b62c09ee3b4abf4479eb58852e`; Actions `45773650927` and PG16 `45773650921` passed in GitHub Actions.

The VM can add new isolated integration evidence when there is a specific evidence gap; it must not automatically rerun already passing CI tests.

The following release gates remain separate from VM readiness:

| Gate | Status / next evidence |
| --- | --- |
| Trivy residual | Critical 4 / High 136, 0 vendor FixedVersion in the R4b scan; explicit residual-risk decision required, not automatically accepted |
| Production `/healthz` 404 | Read-only Cloud Run revision/image/LB routing comparison; code contains route, production path remains unresolved |
| Production DB Ledger / ACL | Reuse 2026-11-25 Cloud SQL Studio observations and confirm only release-time changes in a separate approved **read-only** workflow |
| `sales_tools_app` role | Privileged Role membership/CREATE permissions are a separate risk and remediation decision; do not change them during VM tests |
| Secret hygiene | Existing Production configuration has sensitive plaintext-style values; never print or copy their contents to the VM |
| Attribution known mismatch | Confirm business impact and obtain explicit release acceptance or targeted remediation decision |
| Candidate Deploy / Traffic | NO-GO until release gates and separate approvals; VM verification does not authorize Cloud Run updates |

## 6. Future run evidence template

- Purpose / originating Issue or Draft PR:
- Reviewed Git SHA / tree and source lineage:
- VM name / zone / effective login identity:
- Toolchain versions and available storage:
- Isolation: workspace, container names, database/schema, network/ports:
- Commands executed (remove credentials):
- PASS/FAIL/known-baseline evidence and report paths:
- Security scan source/digest and outstanding findings:
- Cleanup: owned resources removed or retained intentionally:
- Production/Cloud Run/DB/Traffic change: **NONE**, unless separately approved and evidenced:
- Human approval required for next step:

This runbook captures an operator-registered VM and a safe procedure. It is not a VM provisioning, installation, permission, deployment, or Production-release authorization.
