# Temporary Staging Deployment Runbook — Cloud Run / Cloud SQL

更新日: 2026-09-20 JST  
対象Repository: `yoshihisahagisaka/atlib-sales-tools`  
対象環境: `msp-zabbix / asia-northeast1 / sales-tools-staging`

## 1. Purpose / boundary

この文書は、無料診断Development Laneおよび同一Repository上の追加機能をTemporary Stagingへ安全に反映するための再現可能な手順を記録する。

- Production `sales-tools` / Production DB / Production IAM / Production Secret / Production Scheduler は変更しない。
- migrationはCloud Run service起動時に実行しない。
- DB schema変更がある場合は、migration専用Docker stage → migration専用image → Cloud Run Jobの順で実行する。
- runtimeとmigrationのDB authorityを分離する。
- migration成功を確認してからruntime serviceを更新する。
- staging smoke test完了まではProduction利用可能とは判定しない。

## 2. Confirmed staging topology

| Item | Value |
|---|---|
| Project | `msp-zabbix` |
| Region | `asia-northeast1` |
| Cloud Run service | `sales-tools-staging` |
| Cloud SQL instance | `sales-tools-staging-db` |
| Staging DB | `sales_tools_staging_f4` |
| Runtime DB role | `sales_tools_runtime` |
| Migration DB role | `sales_tools_migration` |
| Staging service account | `sales-tools-staging-sa@msp-zabbix.iam.gserviceaccount.com` |
| Artifact Registry repository | `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy` |
| Migration password Secret | `sales-tools-migration-db-password` |

`sales_tools_migration` is the application schema migration role and owns the application tables. `sales_tools_runtime` is non-owner and must not be used as a migration substitute. A real test with runtime credentials failed at schema authority as intended.

## 3. Docker artifact rule

The repository Dockerfile has separate targets:

- `migration`: copies compiled `dist` and `migrations/*.sql`; default command is `node dist/db/migrateCli.js`.
- `runtime`: copies compiled `dist` and `public`; starts `node dist/server.js`.

Therefore a normal Docker build of the final `runtime` stage is not a migration artifact. Build the `migration` target explicitly.

The migration CLI uses `loadDatabaseConfig('migration')` and therefore requires:

- `DB_NAME`
- `DB_MIGRATION_USER`
- `DB_MIGRATION_PASSWORD` (or Secret Manager fallback `sales-tools-migration-db-password`)
- `DB_SOCKET_PATH`
- `GCP_PROJECT_ID`

The migration runner uses a PostgreSQL advisory lock, maintains `schema_migrations`, sorts numbered SQL migrations, skips already-applied filenames, runs each new migration in a transaction, records it only after success, and releases the lock.

## 4. Build runtime image

Use an immutable task-specific tag. Example:

```bat
gcloud builds submit --tag asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging:<TAG> .
```

Do not deploy it yet when a new DB migration is included.

## 5. Build migration image

Use the same source commit as the runtime image and explicitly target `migration`.

Example temporary Cloud Build config:

```yaml
steps:
- name: gcr.io/cloud-builders/docker
  args: ['build','--target','migration','-t','asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging:<TAG>-migration','.']
images:
- asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging:<TAG>-migration
```

Then:

```bat
gcloud builds submit --project=msp-zabbix --region=asia-northeast1 --config=<CONFIG_FILE> .
```

Require Cloud Build `SUCCESS` before continuing.

## 6. Migration credential / Secret rule

Do not paste DB passwords into chat, Git, command history, or documentation.

Expected Secret:
`sales-tools-migration-db-password`

The staging service account needs only `roles/secretmanager.secretAccessor` for this Secret. Prefer Secret-level IAM rather than broadening project-level permissions.

If the Secret is missing, do not silently fall back to `sales_tools_runtime`. Confirm the existing migration role and restore/reset its credential through an authorized Human operation, then store the credential in Secret Manager.

## 7. Create temporary migration Cloud Run Job

Example:

```bat
gcloud run jobs create <JOB_NAME> --project=msp-zabbix --region=asia-northeast1 --image=asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging:<TAG>-migration --service-account=sales-tools-staging-sa@msp-zabbix.iam.gserviceaccount.com --set-cloudsql-instances=msp-zabbix:asia-northeast1:sales-tools-staging-db --set-env-vars=GCP_PROJECT_ID=msp-zabbix,DB_NAME=sales_tools_staging_f4,DB_MIGRATION_USER=sales_tools_migration,DB_SOCKET_PATH=/cloudsql/msp-zabbix:asia-northeast1:sales-tools-staging-db --set-secrets=DB_MIGRATION_PASSWORD=sales-tools-migration-db-password:latest --max-retries=0 --task-timeout=10m
```

Before execution, inspect the Job JSON and verify:

- image tag
- service account
- Cloud SQL instance
- DB name
- migration user
- socket path
- Secret reference (never Secret value)
- `maxRetries=0`

## 8. Execute and verify migration

Execute only after the configuration review:

```bat
gcloud run jobs execute <JOB_NAME> --project=msp-zabbix --region=asia-northeast1 --wait
```

Require successful completion.

Then read Cloud Logging for that execution. Acceptance evidence is:

- previously applied migrations → `migration_skipped`
- only intended new migration(s) → `migration_applied`
- container → `exit(0)`

Do not treat Cloud Run Job creation or start as migration success.

## 9. Deploy runtime only after migration PASS

```bat
gcloud run services update sales-tools-staging --project=msp-zabbix --region=asia-northeast1 --image=asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging:<TAG>
```

Verify:

- new revision created
- 100% staging traffic points to intended revision
- service URL unchanged as expected
- Production service untouched

## 10. Smoke test

After runtime deployment:

1. open the intended staging UI
2. authenticate through the configured staging auth path
3. create one synthetic/mock case
4. save
5. reload and confirm persistence
6. edit and save again
7. verify the Human Decision / business-specific state required by the feature
8. confirm no Production data was used

A successful build, migration, and deploy does not replace the browser/E2E smoke test.

## 11. 2026-09-20〜21 Customer Fit Check evidence

Initial source integration commit used locally: `487a8ce`  
Runtime authority integration commit: `4b3f863`  
UX integration commit: `0331751`

### Schema migration

Initial runtime image tag: `customer-fit-487a8ce`  
Migration image tag: `customer-fit-487a8ce-migration`

Migration execution:
- Job: `sales-tools-customer-fit-migration`
- execution: `sales-tools-customer-fit-migration-rr7fd`
- 001–016: all `migration_skipped`
- `017_customer_fit_checks.sql`: `migration_applied`
- container: `exit(0)`

### OAuth / runtime

Staging OAuth was corrected and browser login succeeded.

OAuth-ready runtime:
- revision: `sales-tools-staging-00007-bgh`
- traffic: 100%
- Production: unchanged

### Runtime authority provisioning

The first real Customer Fit save reached the application but failed with PostgreSQL `42501 permission denied for table customer_fit_checks`. This was confirmed as a Runtime Authority provisioning omission, not an input-validation, OAuth, or schema-migration failure.

Customer Fit authority was provisioned separately from schema migration with the migration authority:

- authority image: `customer-fit-4b3f863-migration`
- Cloud Build: `96a6e343-c87b-4405-a4d6-5404702f9a4d` — SUCCESS
- Job: `sales-tools-customer-fit-authority`
- execution: `sales-tools-customer-fit-authority-59khh` — SUCCESS
- runtime role: `sales_tools_runtime`
- `customer_fit_checks`: SELECT, INSERT, UPDATE
- `customer_fit_check_items`: SELECT, INSERT, DELETE

No table ownership, schema authority, or migration authority was granted to the runtime role.

### Browser / Business Acceptance smoke test

Synthetic Customer Fit case:
- create/save: PASS
- list display: PASS
- detail reload: PASS
- `sourceContext` persistence: PASS
- seven-item persistence: PASS
- Human Decision A persistence: PASS
- Human Decision A → B update/save/reload: PASS

UX feedback from the smoke test was implemented:
- explicit `保存しました。` success feedback
- bottom `一覧へ戻る` action so the operator does not need to scroll to the top

Final UX runtime:
- source integration commit: `0331751`
- runtime image: `customer-fit-0331751`
- Cloud Build: `9d094b82-c139-4c56-85d7-36a346bcb432` — SUCCESS
- revision: `sales-tools-staging-00008-lwl`
- traffic: 100%
- browser UX re-test: PASS
- Production: unchanged

**Customer Fit Check V1 Business Acceptance: PASS (2026-09-21).**

This closes Customer Fit V1 Business Acceptance only. It does not approve Production promotion and does not close any Free Diagnosis Product/Readiness gate.

## 12. Handoff to Free Diagnosis Development Lane

The Free Diagnosis Development Lane may reuse this deployment pattern. It must still:

- build from its own reviewed source commit,
- use an immutable tag tied to that source,
- run only migrations actually present in that source,
- verify migration logs,
- deploy only to `sales-tools-staging`,
- collect its own smoke/E2E evidence,
- keep its own Product/Readiness gates separate from Customer Fit Business Acceptance.

This runbook records deployment mechanics and evidence boundaries; it does not change Free Diagnosis Product decisions or close any Free Diagnosis readiness gate by itself.


## 13. 2026-09-21〜22 Staging credential rotation / secret hardening evidence

Customer Fit V1 staging acceptance後、作業中にstaging credentialが端末・会話上へ露出した可能性を前提として、Productionへ影響を与えずstaging credentialのrotation / Secret Manager参照化を実施した。

**重要:** credential値そのものはこのRunbookへ記録しない。Secret名、参照方式、実施結果のみを証跡とする。

### STAFF_JWT_SECRET

- Before: Cloud Run plain environment variable
- Existing Secret: `sales-tools-staging-staff-jwt-secret`
- After: Cloud Run `STAFF_JWT_SECRET` = Secret Manager reference (`latest`)
- revision `sales-tools-staging-00010-qkh` でSecret参照化
- final configuration check: `STAFF_JWT_SECRET=SECRET_REF`

### Google OAuth Client Secret

Staging OAuth Client IDは既存のstaging専用Clientを継続使用し、Client Secretのみrotationした。

- Secret Manager: `sales-tools-staging-google-oauth-client-secret`
- Version 3: current valid rotated Secret
- Version 2: registration procedure issueにより正しいOAuth Secretではない可能性が確認され、破棄
- Version 1: old Secret; 無効化
- Cloud Run reference: `GOOGLE_OAUTH_CLIENT_SECRET=...:latest`
- revision `sales-tools-staging-00012-wxn`: 100% traffic
- fresh Google Workspace authentication → Customer Fit Check list: PASS
- Google Auth Platform側の旧Client Secretも破棄
- final configuration check: `GOOGLE_OAUTH_CLIENT_SECRET=SECRET_REF`

Version 2の誤登録原因は、OAuth Secretをclipboardへコピーした後、clipboard経由のCLI登録用command自体をコピーしたことでclipboard内容が上書きされた可能性が高いこと。以後、credentialをclipboardからCLIへ渡す手順と、そのcommandを同じclipboardでコピーする手順を組み合わせない。

### Runtime DB password

Target:
- Cloud SQL instance: `sales-tools-staging-db`
- DB: `sales_tools_staging_f4`
- runtime role: `sales_tools_runtime`
- migration role `sales_tools_migration` は変更していない

Actions:
- new staging-only Secret created: `sales-tools-staging-db-password`
- `sales_tools_runtime` password rotated in Cloud SQL
- staging service account received Secret-level `roles/secretmanager.secretAccessor`
- Cloud Run plain `DB_PASSWORD` removed
- Cloud Run `DB_PASSWORD` replaced by Secret Manager reference (`latest`)
- failed revision caused by missing Secret Accessor authority was not routed; authority was added before successful redeploy
- final configuration check: `DB_PASSWORD=SECRET_REF`
- Customer Fit list/detail/save after rotation: PASS

No Production DB credential was changed.

### SMTP_PASSWORD

Staging SMTP configuration was confirmed as synthetic:
- `SMTP_HOST=smtp.example.test`
- `SMTP_USER=synthetic-smtp-user`

Therefore no external SMTP credential rotation was required. Plaintext staging configuration was nevertheless removed.

Actions:
- staging-only Secret created: `sales-tools-staging-smtp-password`
- staging service account received Secret-level `roles/secretmanager.secretAccessor`
- Cloud Run plain `SMTP_PASSWORD` removed
- Cloud Run `SMTP_PASSWORD` replaced by Secret Manager reference (`latest`)
- final configuration check: `SMTP_PASSWORD=SECRET_REF`

### Final Secret reference verification

Final staging configuration check returned:

- `DB_PASSWORD=SECRET_REF`
- `SMTP_PASSWORD=SECRET_REF`
- `GOOGLE_OAUTH_CLIENT_SECRET=SECRET_REF`
- `STAFF_JWT_SECRET=SECRET_REF`

### Local cleanup

Potentially sensitive temporary files were deleted:

- `%TEMP%\sales-tools-migration-password.txt`
- `%TEMP%\sales-tools-staging.yaml`
- `%TEMP%\sales-tools-staging-rotate.yaml`
- `%TEMP%\oauth-error-log.json`

Temporary untracked deployment file `cloudbuild.customer-fit-migration.yaml` was also deleted rather than committed.

Final `git status --short`: no output (clean worktree).

### Boundary / result

- Customer Fit staging remained the only runtime target.
- Production service / Production DB / Production credential were not changed.
- Credential values are intentionally not retained in Git documentation.
- Customer Fit Check V1 remains Business Acceptance: PASS.
- Staging credential rotation and plaintext-secret hardening: COMPLETE.


## 14. 2026-09-23 Customer Fit UX simplification staging evidence

Customer Fit Checkの自由記述過多を解消するUX simplificationをTemporary Stagingへ反映し、Business Acceptanceを再確認した。

Source / build:
- intended source commit: `4b1dde5`
- initial local HEAD discovered during troubleshooting: `0331751`
- local worktree was clean, then `git pull --ff-only` fast-forwarded `0331751..4b1dde5`
- rebuilt runtime image: `customer-fit-ux-4b1dde5-v2`
- Cloud Build: `52ea0e10-937d-40aa-8951-2c557ed52b98` — SUCCESS
- deployed revision: `sales-tools-staging-00022-vhh`
- traffic after verification: 100% to `sales-tools-staging-00022-vhh`

Browser smoke test:
- Customer Fit detail page open: PASS
- input: PASS
- save: PASS
- list display: PASS

### Incident / root cause

Before the successful rebuild, the GitHub integration branch had already been advanced to `4b1dde5`, but the local build worktree remained at `0331751`. `gcloud builds submit .` therefore packaged the old local checkout.

The resulting issue was not treated as a Customer Fit application defect. The build source and deployed artifact were corrected by synchronizing the local worktree to the intended commit and rebuilding.

### Preventive build-source check

Before any future `gcloud builds submit .` from a local worktree:

1. require a clean or intentionally reviewed `git status --short`;
2. verify `git rev-parse HEAD` / `git log -1 --oneline`;
3. confirm that HEAD equals the reviewed source commit intended for the deployment;
4. only then submit the local directory to Cloud Build.

When GitHub branches are updated remotely by another operator/tool, do not assume an existing local worktree has synchronized automatically.

Boundary:
- staging only
- Production unchanged
- no new DB migration was required for this UX-only change
- Customer Fit UX Simplification Business Acceptance: PASS
