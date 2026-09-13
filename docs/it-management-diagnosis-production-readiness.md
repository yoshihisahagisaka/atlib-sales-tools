# 無料 IT経営診断 MVP — Production / Pilot Readiness Evidence

検証日: 2026-09-13 JST。Repository: `yoshihisahagisaka/atlib-sales-tools`。
Base: `main` @ `2c81a0b1ad354ced710884a36998c32497dd9237`。
Branch: `feat/it-management-diagnosis-production-readiness`。mainへのmerge/本番deployは実施していない。
SSOT: `git_KAIZEN` origin/main @ `5225acf75cd19637226ab05b1ba85f7a2d0a12ab` の無料診断docs/17〜32を確認。今回の正本はdocs/32。SSOT側は変更していない。

## 1. Executive verdict — NO-GO

**一般顧客提供・外部pilotとも、現時点ではNO-GO。** 実GCP設定、実Workspace OAuth、実Anthropic AI-01〜04、実通知を含むstaging E2E、Cloud SQL restoreのEvidenceがない。Workerのrequest外実行保証、privacy保持/削除方針も未確定。さらにNode20 EOLと依存脆弱性が残る。local test成功だけではCritical Gateを閉じられず、Conditional Goの条件を満たさない。

このGate作業の成果は「投入可能という宣言」ではなく、再現可能なlocal Evidence、必要最小限のhardening、残課題と責任分担を揃えたレビュー資料である。

## 2. Commit / evidence identity

実装・test・runbook commit: `1cc428154e503a23b4d863be5dd886fd77f95638`。この文書の後続commitはEvidence報告のみ。最終branch SHAは `git rev-parse HEAD` と `git ls-remote origin refs/heads/feat/it-management-diagnosis-production-readiness` で照合する（自己参照SHAを文書へ埋め込まない）。

Host: Windows / Node24.18.0 / npm11.16.0。実DB: Docker PostgreSQL16.15、loopback:55436、synthetic dataのみ。Docker daemon29.7.2。

| Artifact | 実測identity |
|---|---|
| runtime `diagnosis-readiness:runtime` | image ID `sha256:b74bd98007a35631aaf7c5ab5177903fbfb4baa900da7c9a59d217e55ff79bfc` |
| migration `diagnosis-readiness:migration` | image ID `sha256:ad7e2cf30994fff0aca12fcdbaa1a2b8e908be97c01635ac72facd0cd61e1205` |
| Node20 base | digest `sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293`; runtime実測v20.20.2 / UID1000 |
| PostgreSQL16 base | digest `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`; server_version16.15 |

imageはlocal buildでありArtifact Registryへpublishしていない。Docker build中のnpm ci/buildはclean filesystemで成功。さらにhardening commitの独立したclean checkoutでnpm ci/build/security testsを実行した。Secretを持つcheckoutをDockerへ丸ごと送信せず、`.dockerignore`をallowlist化した。

## 3. Files changed / reuse

| Files | 変更目的 |
|---|---|
| `Dockerfile`, `.dockerignore` | 専用migration target、runtime prod依存/非root、build context制限 |
| `src/db/migrate.ts`, `src/db/migrateCli.ts`, `migrations/runner.ts` | compiled migration、DB単位advisory lock、既存ts-node入口再利用 |
| `src/config.ts`, `src/db/pool.ts` | DBのみのconfig取得、必須値/本番HTTPS/JWT検証、接続待ち上限 |
| `src/services/staffAuthService.ts`, `src/routes/staffAuth.ts` | JWT用途分離、payload検証、redirect制約、安全なOAuth failure log |
| `src/middleware/diagnosisLogging.ts`, `src/middleware/safeRequestError.ts`, `src/server.ts` | response header秘匿、不正JSON/raw error秘匿、DB/startup event |
| `src/services/slackNotifier.ts` | timeout、例外にwebhook URLを出さない |
| `package.json`, `package-lock.json` | readiness scripts、互換範囲のnodemailer/body-parser security更新 |
| `test/productionReadiness.*.test.ts` | 実PG/migration/concurrency/両経路とauth/config/loggingの再現test |
| `scripts/readiness/rehearse-docker.cjs`, `scripts/readiness/observe.sql` | artifact/restore smoke、read-only運用query |
| 本書、`it-management-diagnosis-readiness-runbook.md`, `evidence/readiness/report-print-synthetic.png` | 判定/手順/合成データによる目視Evidence |

既存Domain/Repo/Worker/Provider/Express/Google Workspace/CSSとSlice fixtureを再利用。既存SQL001〜012、legacy table/API、AI責任境界、Business内容は変更していない。新機能Slice、production migrationの追加、down migrationはない。

## 4. Gate matrix A〜K

結果はGate全体の判定。括弧内local PASSを外部実証の代替にしない。Evidence IDは下記の実行記録に対応する。

| Gate | Result | Evidence / 残条件 |
|---|---|---|
| A Build / Runtime | **FAIL** | E1/E2: clean ci/build、Docker/health/static/admin gate/prod deps/UID1000成功。ただしNode20はEOL（F1）。 |
| B Migration / DB | **BLOCKED_EXTERNAL** | E2/E3: 空DB001〜012、001〜006からadditive更新、ledger12件、rollback/rerun/restore成功。実production clone・Cloud SQL backup/PITR・既存ledgerは未確認。 |
| C Environment / Secrets | **BLOCKED_EXTERNAL** | E4/E7: 必須config fail-fast・AI未設定起動・Secret pattern scan成功。SM/IAM/実注入/本番URLは未確認。 |
| D Real Anthropic | **BLOCKED_EXTERNAL** | 実APIキーなし、実AI成功は0回。E3/E5はfake/invalid/timeout/Human Gateのlocal Evidenceのみ。 |
| E Workspace OAuth | **BLOCKED_EXTERNAL** | E4/E6: 未認証/顧客token拒否・state/secure cookie/domain契約はlocal成功。実Google login/非許可accountは未実施。 |
| F Cloud Run Worker | **BLOCKED_EXTERNAL** | E3: DB claim/lease/late result成功。実CPU allocation/min instances/scale zero/deploy中断のEvidenceなし。 |
| G PostgreSQL concurrency | **PASS** | E3: 実PG・2 Pool、one claim、SKIP LOCKED、type isolation、期限切れlease、late result、同時Human/version、rollback、immutable trigger。 |
| H Security / Privacy | **FAIL** + **BUSINESS_DECISION_REQUIRED** | E4/E5/E6/E7: local token/CSRF/XSS/ログ/immutable確認。依存脆弱性F2・proxy/rate F3・DB権限F4残存。保持/削除/Transcript方針未決定。 |
| I Observability | **BLOCKED_EXTERNAL** | E8: safe events/read-only SQLは実行成功。外部alert/受信先/通知受信/uptime監視は未確認。 |
| J Backup / Runbook | **BLOCKED_EXTERNAL** | E2: pg_dump→別DB restoreとapp接続成功、runbookあり。Cloud SQL restore/旧revision traffic rollbackの実証なし。 |
| K Pilot E2E | **BLOCKED_EXTERNAL** | E3/E6: local両経路CLOSEDとbrowser成功。実staging+実AI+実OAuth+実通知を組み合わせた完走は未実施。 |

### 実行Evidence

| ID | 実行 / 結果 |
|---|---|
| E1 | Host `npm run build` exit0。独立clean checkout `npm ci` + `npm run build` + `npm run test:readiness`。Dockerの新しいbuild/prod-deps filesystemでも `npm ci` / `npm ci --omit=dev` / build成功。 |
| E2 | `docker build --target runtime ...`、`--target migration ...` 成功。専用migration imageで001〜012適用。`node scripts/readiness/rehearse-docker.cjs` exit0: `migration_artifact_rerun` skipped12、`local_backup_restore_verified` ledger12/triggers2、`runtime_smoke_pass` Node20.20.2/UID1000/restored DB/AI未設定、`runtime_log_synthetic_secret_check` PASS。health200、公開HTML200、OAuth login302、admin HTML302、admin API401。 |
| E3 | `$env:RUN_READINESS_PG='1'; npm run test:readiness:postgres` をclean checkoutから実行: 6 PASS（親test1+subtest5）、0 FAIL、0 skip、最終約12.5秒。空DB/upgrade/migration fault/concurrent runners、queue/concurrency、frozen objects、WEB、SALES_VISIT。 |
| E4 | `npm run test:readiness`: 3 PASS、0 FAIL。JWT目的/形/期限/改ざん、local OAuth stubで許可/不許可domain・cookie・state・logout・redirect、malformed/oversized JSONとaccess/errorログ、config fail-fast/DBのみ/AIなし。 |
| E5 | 全Golden filesをNode test runnerで実行: **87 PASS / 4 skip / 0 FAIL**。Slice1=13、Slice2=11+1skip、Slice3=14+1skip、Slice4=15+1skip、Slice5=13、Slice6=9、legacy kaizen=12+1skip。skipは実AI環境なし、PASS扱いにしない。 |
| E6 | `npm run test:diagnosis:browser`: desktop16 + mobile16 = **32 PASS**、約1.3分。local PGLite/Provider fixture、実OAuthの代替ではない。Report print screenshotを目視し、会社名+様/atLIB株式会社/UNKNOWN・仮説表示/操作UI非表示を確認。 |
| E7 | `git diff --check`成功。tracked+今回追加候補180ファイルを高信頼credential patternでscanし0match（完全検出の保証ではない）。`.env`はGit未追跡。`npm audit --omit=dev --json`はexit1、**7 moderate / high0 / critical0**。 |
| E8 | `scripts/readiness/observe.sql` を実PG16.15で実行しREAD ONLY transaction成功、ledger12件、空queue/集計/接続数を確認。gcloud実service照会は `Reauthentication failed ... cannot prompt during non-interactive execution` で失敗。認証情報やSecret値は記録しない。 |

Docker probeの初回はtest scriptを `/tmp` に置いたためmodule解決で失敗し、`/app/node_modules/pg`参照へ修正後成功。長文fixtureの初回は既存20,000文字上限超過で422、14,000文字へ修正後両経路成功。どちらもproduction挙動を都合よく変更していない。

## 5. Critical findings fixed

| Finding | 対応 / 限界 |
|---|---|
| response access logにSet-Cookie/OAuth Locationが出得る | Pino response serializerをstatusCode allowlistに変更。OAuth loginを含む実runtimeとlocalログtestでtoken/headerが出ないことを確認。過去productionログの存在/アクセスは未確認、Security担当の追跡対象。 |
| OAuth SDK/Slack/起動例外・JSON parser errorからSecret/Raw dataが出得る | 固定event/statusのみ記録、request parse汎用error、Slack timeout10秒。合成marker漏洩test成功。 |
| OAuth state JWT/session JWTの用途・payloadの検証不足 | purpose+HS256+必要field検証。stateをsession Cookieに置く攻撃を拒否。旧sessionは再ログインが必要。 |
| returnToがbackslashを許容 | `/admin/`に制限しbackslash/CRLF拒否。回帰test成功。 |
| runtimeにmigration実行依存がない／二重runner競合 | 別migration artifactとDB-only config、DB advisory lockで直列化。SQL/ledgerを同一transaction、既存入口維持。 |
| placeholder/短い署名鍵/HTTP本番URL | production fail-fast。Secret品質/IAM/rotationの実運用証明は外部に残る。 |
| nodemailer high vulnerability | lockfile 9.0.5→9.1.1、body-parser1.20.6→1.20.8。`npm audit fix`の互換範囲のみ、force/major overrideなし。残る7件はFAILとして記録。 |

## 6. Open findings — severity / owner / action

ownerは責任ロールであり、担当者指名済みという意味ではない。いずれも投入前に担当者・期限・Evidenceを確定する。未確定のままConditional Goにはしない。

| ID | Severity / status | Owner | Action |
|---|---|---|---|
| F1 | High / FAIL | Platform + Maintainer | docs32指定Node20の動作は確認したが、現日付ではEOL。サポートされるLTSへの更新方針をレビューし、runtime/依存/実接続を再検証。今回勝手にmajor変更しない。 |
| F2 | Moderate / FAIL | Maintainer + Security | express→qs、Google SDK系→uuid由来の7件。audit fix後も残存。到達性調査と互換性を確認した上で依存更新/overrideをレビューする。auditのfixAvailableだけでは解消済みにしない。 |
| F3 | High / FAIL（構成未確認） | Platform + Security | `trust proxy=true`は任意のX-Forwarded-Forを信頼し得る。in-memory rate limitはinstance別、expired keyの全体掃除なし。local同設定probeでcaller指定X-Forwarded-Forがreq.ipになることを再現済み（本番ingress試験ではない）。実ingressでheader偽装を検証し信頼proxy/edge rate制御を確定。legacy大容量parserはauth前なのでedge/body上限も確認。 |
| F4 | High / BLOCKED_EXTERNAL | DB + Security | report/handoff triggerは実証したがaudit/raw tableはDB ownerなら変更可能。migration identityとruntime/read-only identityの権限分離、監査ログ外部保存/アクセス/改変検知のEvidenceが必要。 |
| F5 | Critical gate / BLOCKED_EXTERNAL | Platform | request外CPU、min/max/scale zero、Cloud SQL接続枠、deploy中断を実環境で検証。pool max5×旧新instance+他appのcapacity budgetを作る。 |
| F6 | Critical gate / BLOCKED_EXTERNAL | Platform + QA + Workspace | 実AI/OAuth/SMTP/Slack/staging E2E/Cloud SQL restoreを実行。偽Providerの成功を転用しない。 |
| F7 | Critical privacy / BUSINESS_DECISION_REQUIRED | Product Owner + Security | retention/deletion/Transcript/AI保存範囲/顧客削除要求について決定。下記8を参照。 |
| F8 | High operations / BLOCKED_EXTERNAL | Operations + Product Owner | alert/当番/復旧責任者/backup復旧目標、通知失敗時手動確認の担当を確定してtest alertを受信する。 |
| F9 | Medium practical limit / 未検証部分あり | Maintainer + 診断責任者 | 1 SourceRecord上限20,000文字。AI02/03は直近20source×先頭2,000文字、theme/plan各100件等で切り詰める。大量Case/長期履歴/AI04の大Context/同時admin高負荷の実staging測定は未実施。 |

[Node release table](https://nodejs.org/en/about/previous-releases) と [release schedule](https://github.com/nodejs/Release) でNode20 EOLを確認。依存指摘は [qs isBuffer DoS](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)、[qs array limit](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx)、[uuid bounds check](https://github.com/advisories/GHSA-w5hq-g745-h8pq)。audit件数は依存経路の影響package数を含み、独立した7攻撃を意味しない。

## 7. External blockers

GCP active accountはあるが実service read時に再認証で停止。Secret Manager/Cloud SQL/Cloud Run/Monitoringの実設定を参照できない。実AI key、OAuth client設定と許可/非許可テストaccount、staging実URL、通知先受信確認手段がない。Cloud SQL production clone/backup/PITR/restoreと実revision rollbackは未実施。値の提供をチャットやGitに求めず、管理者がSecret injectionと認証済み環境を準備する。

### Environment / Secret inventory

| Variable | 用途 / 要求 / Evidence |
|---|---|
| NODE_ENV, PORT | production / Cloud Run PORT8080。local Dockerで起動確認。 |
| GCP_PROJECT_ID | default msp-zabbix、実環境を照合する。 |
| DB_NAME, DB_USER, DB_PASSWORD | 必須。passwordはenv優先、なければ `sales-tools-db-password`。名前/ユーザー欠落はfail-fast。 |
| DB_SOCKET_PATH, DB_HOST, DB_PORT | socket優先、なければTCP127.0.0.1:5432。実Cloud SQL mount/IAM未確認。 |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM | 必須（port default587）。password fallback `sales-tools-smtp-password`。実送受信未検証。 |
| PORTAL_BASE_URL | 本番HTTPS必須。通知linkのoriginとGoogle redirect登録を照合。 |
| GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET | 必須。secret fallback `sales-tools-google-oauth-client-secret`。実疎通未検証。 |
| STAFF_JWT_SECRET | 必須。本番32文字以上/placeholder拒否、fallback `sales-tools-staff-jwt-secret`。実rotation/IAM未検証。 |
| DIAGNOSTIC_NOTIFY_EMAIL | 必須。実宛先/受信者の承認と受信確認が必要。 |
| SLACK_WEBHOOK_DIAGNOSTIC | optional/未設定skip。Secretとして注入、実通知未検証。 |
| ANTHROPIC_API_KEY | optional、`sales-tools-anthropic-api-key`のenv注入想定。未設定でもHuman-only可。実AI GateはBLOCKED。 |
| MIGRATIONS_DIR | migration CLIのみ、default cwd/migrations。runtimeへmigrationを混在させない。 |

## 8. Business Decision Required

**BUSINESS_DECISION_REQUIRED**。数値・ポリシーをこの実装で設定していない。

| 決定事項 | 判断する選択肢 / tradeoff |
|---|---|
| Survey/SourceRecord/Transcript保持 | 一律の期間か、Raw/Transcript/派生snapshotごとに分けるか。追跡性と個人情報保持を比較。 |
| 顧客削除要求 | 削除・匿名化・制限保存の適用条件、immutable snapshot/監査/backupとの整合、受付/承認責任者を決める。 |
| AI入力/出力/失敗原文 | source保存方針と整合した保持・アクセス・外部AI利用の顧客説明を確定。 |
| backup保持/RPO/RTO | 復旧可能範囲と損失許容をProduct Owner/DB運用者が合意する。 |
| pilot運用責任 | 対象会社/担当者/監視/手動通知/incident連絡先を指定。今回pilot範囲を勝手に限定してGoにはしない。 |

## 9. Migration rehearsal

実PGで001〜012を全適用、ledger12件。001〜006適用済みDBへsynthetic legacy rowを入れ、二つのrunnerで007〜012をadditive適用し旧row保持を確認。099故障fixtureでtable作成後division-by-zeroを発生させ、tableとledger両方rollback、再実行成功。旧SQL/API変更なし。production cloneそのものは未取得でありGate B全体はBLOCKED_EXTERNAL。

## 10. Rollback / restore rehearsal

local実PGのcustom pg_dump→別DB pg_restore、marker/ledger12/trigger2の一致、復元先にproduction runtime接続成功。実Cloud SQL backup/PITRとtraffic rollbackはBLOCKED_EXTERNAL。[runbook](it-management-diagnosis-readiness-runbook.md) にdeploy前backup、schema互換、旧revision復帰、別DB restore、再接続・検証を記載。down migrationはない。

## 11. Real AI-01〜04

**BLOCKED_EXTERNAL、各0回成功**。キー未設定。fake Providerによる全4工程、timeout/invalid refs/schema/late result/Human-onlyはlocal回帰で確認。real keyを使った明示opt-in経路を実PG testに用意したが未実行。AI成功でCase State/Theme/Insightを勝手に進める変更はない。AI04の入力は引き続き承認済Contextのみ。

## 12. Google OAuth

**BLOCKED_EXTERNAL**。Google実交換をstubしたlocal contractはPASS（atlib.jp許可、外部domain拒否、state一致、Secure/HttpOnly/SameSite、logout、JWT期限/用途、redirect）。実Google IdPや実redirect登録は検証していない。旧session再ログインの運用影響あり。

## 13. PostgreSQL concurrency

**PASS（local実PG範囲）**。2 Pool/max5で同一executionのclaimは一つ、locked先頭jobをSKIP LOCKED、process type隔離、失効lease→FAILED、late finishで上書きなし。同一versionのHuman draft同時要求は一方成功/一方拒否。report承認/Handoff READY後の直接SQL更新拒否。PGLiteのみの証明ではない。実Cloud Run multi-instanceはGate Fに残る。

## 14. Security / privacy

log header/SDK例外の秘匿、JWT用途分離、token hash/scope/revoke、未認証/顧客token拒否、mutation header/cross-site guard、SQL parameterization、raw/AI outputをtextContentで表示する既存実装を確認。Golden/browserで権限・XSS系入力・意味論を回帰確認。監査INSERT失敗時のtransaction rollbackは既存Goldenで成功。DB ownerからのaudit改変まで防ぐ証明ではない。F2〜4/7が残るため全体PASSにしない。保存したPNGはsynthetic会社データのみ。

## 15. Observability / runbook

安全なstructured logとread-only集計を追加・実行。[runbook](it-management-diagnosis-readiness-runbook.md) にAI outage時Human-only、stuck lease、DB/OAuth/通知障害、誤Report/Handoffの新version、security incidentを記載。外部alert/当番への実通知/Cloud Monitoring設定はBLOCKED_EXTERNAL。health200だけでDB正常とは判定しない。

## 16. WEB E2E

local実PG+fake AI01〜04: Application→Survey v2→Preparation→Workspace→Human Review→Report承認→Delivery→Feedback→Assessment受注→deterministic Handoff→transfer→Human Close、**PASS**。14,000文字TranscriptとUNKNOWNを含めて処理。browserの申込/途中保存/再開/失敗再保存/完了はdesktop/mobile成功。実通知・実OAuth・実AIを含むstaging完走は**BLOCKED_EXTERNAL**。

## 17. SALES_VISIT E2E

staff代理入力/entry_channel SALES_VISIT、同一Survey/Domain、以降同じ4 AI工程とHuman GateでCLOSED、local実PG **PASS**。browser代理入力/一覧/詳細はdesktop/mobile成功。実staging完走は**BLOCKED_EXTERNAL**。

## 18. Full regression / manual verification

Golden **87 PASS / 4 external skip / 0 FAIL**、browser **32 PASS**、新security **3 PASS**、実PG **6 PASS**。build/diff check成功。browser生成の [Report print](evidence/readiness/report-print-synthetic.png) を目視し、会社名`ABC株式会社様`、提供`atLIB株式会社`、SURVEY_STATED/未確認/仮説の区別、print時の操作UI非表示を確認。これは画面画像の確認であり、実担当者による60分pilotや実紙印刷を行った証明ではない。large-scale load testは未実施。

## 19. Canonical deviations

**None.** Business価格/メッセージ/境界/semantic type/AI責任は不変。保持期間を追加せず未決定として記録。Node20要件は動作検証し、EOLを隠さずFAILとした。localで未実行の外部GateをPASSに読み替えていない。

## 20. Recommended next action

Product Owner/Platform/SecurityがF1〜9の担当者と期限を決める。Node/依存/proxy/privacyを解決し、認証済みstagingで実AI/OAuth/worker/通知/Cloud SQL restore/両経路を実証してmatrixを更新する。それまでmainへmerge・顧客提供しない。本branchはレビュー待ちとする。
