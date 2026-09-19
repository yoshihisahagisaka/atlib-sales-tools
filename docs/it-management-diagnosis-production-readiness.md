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
| A Build / Runtime | **PASS**（2026-09-18更新、詳細§21） | E1/E2: clean ci/build、Docker/health/static/admin gate/prod deps/UID1000成功。F1（Node20 EOL）はcommit `0c2bb7c`でNode22移行済みをE9で再証跡化しCLOSED。 |
| B Migration / DB | **BLOCKED_EXTERNAL** | E2/E3: 空DB001〜012、001〜006からadditive更新、ledger12件、rollback/rerun/restore成功。実production clone・Cloud SQL backup/PITR・既存ledgerは未確認。 |
| C Environment / Secrets | **BLOCKED_EXTERNAL** | E4/E7: 必須config fail-fast・AI未設定起動・Secret pattern scan成功。SM/IAM/実注入/本番URLは未確認。 |
| D Real Anthropic | **BLOCKED_EXTERNAL** | 実APIキーなし、実AI成功は0回。E3/E5はfake/invalid/timeout/Human Gateのlocal Evidenceのみ。 |
| E Workspace OAuth | **BLOCKED_EXTERNAL** | E4/E6: 未認証/顧客token拒否・state/secure cookie/domain契約はlocal成功。実Google login/非許可accountは未実施。 |
| F Cloud Run Worker | **BLOCKED_EXTERNAL** | E3: DB claim/lease/late result成功。実CPU allocation/min instances/scale zero/deploy中断のEvidenceなし。 |
| G PostgreSQL concurrency | **PASS** | E3: 実PG・2 Pool、one claim、SKIP LOCKED、type isolation、期限切れlease、late result、同時Human/version、rollback、immutable trigger。 |
| H Security / Privacy | **FAIL**（BUSINESS_DECISION_REQUIREDは解消、詳細§21・§22） | E4/E5/E6/E7: local token/CSRF/XSS/ログ/immutable確認。F2はRisk Accepted（§22、`vulnerabilities=0`ではない点を隠さない）、proxy/rate F3・DB権限F4残存。保持/削除/Transcript方針はdocs/66でDECIDED済み、実装(retentionDeletionWorker等)・テストまで確認済みだが実環境Evidence未取得（F7、§21）。UI Audit/Traceability（F4とは別建て）は今回のセッションで復元・regression test化済み（§21）。 |
| I Observability | **BLOCKED_EXTERNAL** | E8: safe events/read-only SQLは実行成功。外部alert/受信先/通知受信/uptime監視は未確認。F8のRole Model（Diagnosis Owner等6Role）はgit_KAIZEN docs/72§1にてHuman Decision（2026-09-18）でDECIDED済み（§21）。実名Owner割当とalert実設定・受信確認は引き続きOPEN。 |
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
| F1 | High / **CLOSED — FIXED / EVIDENCED**（2026-09-18） | Platform + Maintainer | commit `0c2bb7c`でDockerfile全stage・CI・package.json engines共に`node:22-alpine`/Node22へ移行済みであることを確認。E9（本追記）で使い捨てDocker上のmigration/runtime imageを再buildし、Node v22.23.2・非root(uid1000)・migration冪等性(16件全skip)・pg_dump/restore一致・secret非漏洩を再証跡化。Human Decisionにより2026-09-18付でCLOSEDとして記録。 |
| F2 | Moderate / **CLOSED — RISK ACCEPTED / NOT REACHABLE**（2026-09-18・詳細§22） | Maintainer + Security | qs分（express 4.22.2→4.22.3／qs 6.15.3→6.16.0、`npm audit fix`no `--force`）はFIXEDとして解消。残るuuid由来5件（gaxios/google-gax/retry-request/teeny-request/uuid、GHSA-w5hq-g745-h8pq）はソース追跡＋ローカルPoCにより「脆弱コード自体は存在するが、脆弱API（v3/v5/v6+buf/offset）へ到達する経路が現在の依存グラフ・アプリ利用パターンに存在しない」ことを確認しHuman DecisionによりRisk Accepted。`npm audit`件数（moderate5）は解消したと記録しない。再評価条件は§22参照。 |
| F3 | High / FAIL（構成未確認） | Platform + Security | `trust proxy=true`は任意のX-Forwarded-Forを信頼し得る。in-memory rate limitはinstance別、expired keyの全体掃除なし。local同設定probeでcaller指定X-Forwarded-Forがreq.ipになることを再現済み（本番ingress試験ではない）。実ingressでheader偽装を検証し信頼proxy/edge rate制御を確定。legacy大容量parserはauth前なのでedge/body上限も確認。 |
| F4 | High / BLOCKED_EXTERNAL | DB + Security | report/handoff triggerは実証したがaudit/raw tableはDB ownerなら変更可能。migration identityとruntime/read-only identityの権限分離、監査ログ外部保存/アクセス/改変検知のEvidenceが必要。 |
| F5 | Critical gate / BLOCKED_EXTERNAL | Platform | request外CPU、min/max/scale zero、Cloud SQL接続枠、deploy中断を実環境で検証。pool max5×旧新instance+他appのcapacity budgetを作る。 |
| F6 | Critical gate / BLOCKED_EXTERNAL | Platform + QA + Workspace | 実AI/OAuth/SMTP/Slack/staging E2E/Cloud SQL restoreを実行。偽Providerの成功を転用しない。 |
| F7 | Critical privacy / **Business Decision CLOSED（docs/66）／実装+テスト確認済み／Production Evidence OPEN**（2026-09-18更新、詳細§21） | Product Owner + Security | BD-01〜BD-05はgit_KAIZEN `docs/66`でDECIDED済み（新規Business Decision不要）。F7-A〜Eに分解しDECIDED→IMPLEMENTED→TESTED→EVIDENCEDで再評価、実装・テストまでは到達。実Cloud SQL/GCS/実AIでのEVIDENCED化のみ残る（下記8は削除、§21参照）。F7-EのLegal wordingはBUSINESS_DECISION_REQUIREDではなくLEGAL_REVIEW_PENDING。 |
| F8 | High operations / **Role Model DECIDED（docs/72§1）／Named Owners OPEN／Monitoring&Alert Evidence OPEN**（2026-09-18更新、詳細§21） | Operations + Product Owner | Role構成(Diagnosis Owner等6Role)とguardrailはgit_KAIZEN `docs/72`§1のHuman Decision（2026-09-18）でDECIDED（新規Business Decision不要）。残るのは実名Owner割当・Cloud Monitoring alert実設定・実受信確認・incident/privacy-securityエスカレーション経路の実運用確認。通知SLA数値化はdocs/66 BD-04の通りControlled Pilotでは対象外のまま。 |
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

## 21. Update — 2026-09-18（Development Lane正常化 / F1・F7・F8再評価）

検証日: 2026-09-18。Base: `fix/free-diagnosis-development-lane-normalization` @ `0c2bb7c`（`feat/free-diagnosis-sales-launch`から分岐）。mainへのmerge/Production deploy/Cloud SQL migrationは未実施。本章は§1〜20の記録を書き換えず、追記としてEvidenceと再評価結果を記録する。**総合判定は引き続きNO-GO。**

### 21.1 Development Lane正常化（本Gate外の前提作業）

commit `0c2bb7c`時点のHEADに対し、build失敗（TS2345×2）・golden test terminology drift 5件・browser test 24件failをすべて解消。build/golden test 19スクリプト/実PostgreSQL 9件/browser 32件/GitHub Actions（run `35330633766`）いずれもgreenであることを確認済み。**これはLocal/CI PASSの確認であり、単独でProduction Readinessを構成しない。**

修正過程でUI層の情報欠落14件（Category C：実装バグ）を発見・復元した。`#case-status`・`#handoff-future`/`intent_status`・`#assessment-audit`・`handoff-hash`・`handoff-snapshot`・`assessment-items`のstatus・`report-sections` traceのid/version等。バックエンドAPI/DBには該当データが元々保持されたままであること（UI表示のみの欠落、データ損失ではないこと）をPGlite環境で実地検証済み。Progressive Disclosure（通常表示＝翻訳済み日本語、詳細表示＝括弧併記または既存`<details>`展開）で復元し、再発防止のためbrowser testへregression assertionを追加した。これは独立した「UI Audit / Traceability」Readiness補足項目として扱う（§21.4参照、F4そのものではない）。

未assertの画面要素に同種の欠落が残っている可能性、および`#assessment-metadata`・`#assessment-diagnosis-status`・`#feedback-status`の簡略化はUNKNOWNのまま維持し、「問題なし」とは扱わない。将来のReadiness/UX監査対象として記録する。

### 21.2 E9 — F1 Node22移行の再証跡化（CLOSED）

使い捨てのローカルDocker環境（Cloud SQL非接続、synthetic dataのみ）で`docker build --target migration`・`docker build --target runtime`をこのHEADから実行し、`scripts/readiness/rehearse-docker.cjs`でE1/E2相当のEvidenceを再取得した。

```
{"event":"migration_artifact_rerun","skipped":16}
{"event":"local_backup_restore_verified","ledger":16,"triggers":4,"customerData":false}
{"event":"runtime_smoke_pass","node":"v22.23.2","uid":1000,"restoredDatabase":true,"aiKeyConfigured":false}
{"event":"runtime_log_synthetic_secret_check","result":"PASS"}
```

Dockerfile全stage（build/production-deps/migration/runtime）およびCI（`node-version: '22'`）が`node:22-alpine`/Node22を使用していることをソースからも確認済み。**F1（Node20 EOL）はHuman Decisionにより2026-09-18付でCLOSEDとして記録する。** Gate Aの判定をFAILからPASSへ更新した（§4参照）。

### 21.3 F7 再評価 — Business Decision CLOSED（docs/66）／Production Evidence OPEN

前回記録（F7 = BUSINESS_DECISION_REQUIRED）は誤りだった。git_KAIZEN `docs/66-customer-data-ai-continuity-business-policy-v1.md`（Status: CANONICAL — BUSINESS POLICY / DECISION、2026-09-13）がBD-01〜BD-05を既にDECIDED済みであり、**新しいBusiness Decisionは不要**。同文書§8は「**Business Decision completed ≠ Production Ready**」と明記し、Development Laneが実装・Evidenceで再評価すべき残Gate（実AI provider・実OAuth・Cloud Run Worker・Secret/IAM・Monitoring・Cloud SQL backup/restore・staging E2E・privacy/legal実装・consent実装・retention/deletion実装）を明示している。この残Gateに沿い、現在HEADでの実装・テスト状況のみを評価した。

| 分解 | 内容 | DECIDED | IMPLEMENTED | TESTED | EVIDENCED（実環境） |
|---|---|---|---|---|---|
| F7-A Retention | General Raw+1年／Transcript+90日／Raw AI I/O+90日／Approved Evidence+5年 | ✅ docs/66 BD-01 | ✅ `retentionDeletionWorker.ts`の`interval '1 year'/'90 days'/'90 days'/'5 years'`がBD-01数値と一致 | ✅ `test/retentionDeletionWorker.golden.test.ts`で境界値検証、golden test 5/5 pass | ❌ UNKNOWN（PGlite/使い捨てDockerのみ、実Cloud SQL未検証） |
| F7-B Customer Deletion | request／Human approval／execution audit／anonymization・制限保存 | ✅ docs/66 BD-02 | ✅ `diagnosis_deletion_requests`の状態機械、DB CHECK制約でHuman承認必須を強制 | ✅ 同golden testに含まれる（承認済み匿名化・active Hold保護・未承認拒否） | ❌ UNKNOWN |
| F7-C Backup/Restore整合 | 削除済みデータがRestore後に恒久復活しないcontrol | ✅ docs/66 BD-02 | ✅ `deletionReconciliation.ts`（外部永続化・content-addressed・tamper-evident manifest） | ✅ `test/controlledPilotRestoreAiClosure.golden.test.ts`・`test/externalDeletionManifestStore.golden.test.ts`、3/3・2/2 pass | ❌ UNKNOWN（実Cloud SQL restore・実GCS未検証、docs/66§8明記の残Gate） |
| F7-D AI Data Minimization | Context目的限定／Raw AI I/O保持／Human Approved Resultとの分離 | ✅ docs/66 BD-03 | ✅ Transcript default除外、explicit consent + necessity opt-in時のみbounded excerpt | ✅ 同上golden testでpass | ❌ UNKNOWN（実Anthropic AI呼び出しはF6と共通のBLOCKED_EXTERNAL） |
| F7-E Customer Notice/Consent | AI利用事前説明／AIのみで判断しない旨／Transcript別途同意 | ✅ docs/66 BD-05（最低限9項目） | ✅ `DIAGNOSIS_POLICY_NOTICE_VERSION`を`z.literal()`でAPI契約として強制。Transcriptは`recordTranscriptConsent()`で別経路の同意記録 | ✅ `test/controlledPilotPolicyClosure.golden.test.ts`でnotice_version一致検証、Transcript別同意はbrowser testで経路確認 | **LEGAL_REVIEW_PENDING**（BUSINESS_DECISION_REQUIREDではない。文言はBD-05の大半をカバーするが、顧客向けLegal wordingの逐語網羅性チェックは未実施。docs/66自身が「Legal wordingは専門Reviewを経て確定」と明記し別工程として意図的に切り離している） |

**F7総括**: Business Decision CLOSED（docs/66）。IMPLEMENTED・TESTEDまで到達。**残るのは全項目共通で実環境（Cloud SQL/GCS/実AI）でのEVIDENCED化のみ**であり、Production Readiness Gapとして記録する。F7-EのみLEGAL_REVIEW_PENDINGという別カテゴリを持つ。

### 21.4 F8 再評価 — Role Model DECIDED（docs/72§1）／Named Owners OPEN／Monitoring & Alert Evidence OPEN

git_KAIZEN `docs/72-controlled-pilot-business-operations-pack-v1.md`はStatus: PROPOSAL FOR VALIDATIONのままであり、当初§11でも「Role model」はPROPOSAL FOR PILOT VALIDATION扱いだった。**したがって「既存CanonicalによりRole ModelがBusiness Decision済み」ではなかった。**

これを受け、Human Decision（2026-09-18）により、docs/72§1 Operating Roles — Pilot Minimumを**Controlled Pilotの運用Role Modelとして新たに採用**した（commit `280975f`、docs/72側を更新）。採用したRole: Diagnosis Owner／Human Reviewer／Management Feedback Facilitator／Customer Follow-up Owner／Technical Incident Escalation／Privacy / Security Escalation。「一人が複数Roleを兼務可能。ただし責任の所在を曖昧にしない」というGuardrailも採用。Human Review Sheet・45-minute facilitation・Decision Record・Pilot Observation等、他のProposal内容は今回のDecisionに含まれず、引き続きPROPOSAL FOR PILOT VALIDATIONのまま。

通知SLAの数値化はdocs/66 BD-04の通り、Controlled Pilotでは意図的に対象外（GA前に再評価）。

**F8残課題**: (1) Pilot開始前の実名Owner割当（軽量なHuman Decision、Business Decisionではない）、(2) Cloud Monitoring alertの実設定、(3) 実際のalert受信確認、(4) technical incident / privacy-security escalation routeの実運用確認。いずれもInfrastructure/External Evidence待ちであり、新しいBusiness Decisionは不要。

### 21.5 UI Audit / Traceability — 独立したReadiness補足項目（F4とは別建て）

F4（DB owner権限分離・監査ログ外部保存・改ざん検知）はインフラ/DB層の論点であり、今回の修正では変わらずBLOCKED_EXTERNALのまま。

今回のセッションで発見・解消したのは、F4とは別の論点：バックエンドには監査データ（`audit.command`・`actor_user_id`・`diagnosis_status`・`intent_status`・`version`・`snapshot_hash`・`snapshot_json`・`approved_by_user_id`等）が保持されているにもかかわらず、admin UIがそれを表示できず担当者が画面上で監査証跡を確認できない、というUI層のAudit/Traceability欠落（`docs/23`「Audit / Decision traceability」要求）。commit `0c2bb7c`で復元し、browser test 32件（regression assertion含む）で再発防止を確認済み。**この項目単体は解消済みであり、Production GOを阻害しない。** F4（インフラ層）は引き続き別問題としてBLOCKED_EXTERNALのまま残る。

### 21.6 Readiness状態サマリ（2026-09-18時点）

- **F1**: CLOSED
- **F7**: Business Decision CLOSED（docs/66）／Implementation + Test確認済み／**Production Evidence OPEN**
- **F8**: Role Model DECIDED（docs/72§1、Human Decision 2026-09-18）／**Named Owners OPEN**／**Monitoring & Alert Evidence OPEN**
- **UI Audit / Traceability**（F4と別建て）: CLOSED（今回解消、regression test化済み）
- F2〜F6・F9・F4（インフラ層）: 変化なし、引き続きOPEN

### 21.7 総合判定

F1解消・F7/F8のBusiness Decision面の整理・UI Audit/Traceability解消にもかかわらず、F2・F3・F4（インフラ層）・F5・F6・F8（Evidence面）・F9が未解決のため、**Production Readinessは引き続きNO-GO**。mainへのmerge可否・Production deploy可否・実顧客データ利用可否は別Gateとして扱い、本追記時点ではいずれも承認していない。

## 22. Update — 2026-09-19（F2: npm audit fix実行結果 / uuid Risk Acceptance）

検証日: 2026-09-19。Base: `fix/free-diagnosis-development-lane-normalization` @ `122a72c`（commit `d1e952c`の次）。mainへのmerge/Production deploy/Cloud SQL migrationは未実施。本章は§1〜21の記録を書き換えず追記する。

### 22.1 npm audit fix（`--force`なし）実行結果

Human Decisionにより承認された範囲（`npm audit fix`のみ、`--force`不使用、package.json直接依存の手動メジャー更新なし）で実行した。

- **package.json**: 変更なし（byte-for-byte一致を確認）
- **package-lock.json**: resolved versionの変更は以下3件のみ
  - `express`: 4.22.2 → 4.22.3
  - `qs`（直下）: 6.15.3 → 6.16.0
  - `body-parser/node_modules/qs`: 6.16.0 → 削除（dedup）
- **意図しない依存変更なし**: `uuid`/`gaxios`/`google-gax`/`teeny-request`/`retry-request`/`google-auth-library`/`@google-cloud/secret-manager`は変更なし
- `npm audit --omit=dev`: **moderate 7 → 5**（qs由来2件解消、uuid由来5件は`--force`なしでは解消不可）

再検証（すべてgreen）: `npm run build`、golden test 18スクリプト全件（0 fail）、`test:readiness:postgres`（disposable Docker、実PostgreSQL、9/9 pass）、browser test 32/32 pass、Customer Fit Check golden test 2/2 pass（`feat/customer-fit-check`ブランチ上、影響なし）、GitHub Actions CI（HEAD `122a72c`、`workflow_dispatch`実行、success）。`google-auth-library`/`gaxios`/`google-gax`のresolved versionは変更されていないため、staff auth/OAuth callback/allowed-denied domain/session-auth gateの既存契約（`test:readiness`3テスト）に影響なし。

### 22.2 uuid残存advisory（GHSA-w5hq-g745-h8pq / CVE-2026-41907）の実到達性調査

**advisory概要**: 対象APIは`v3()`/`v5()`/`v6()`のみ。呼び出し時に`buf`（出力先バッファ）と`offset`を渡した場合、サイズ／offsetの境界チェックが欠落し部分的な書き込みが起こり得る（CWE-787/CWE-1285、CVSS 6.3 Moderate、Integrity Lowのみ）。`v4()`/`v1()`/`v7()`は対象外。修正版は11.1.1/12.0.1/13.0.1。installed `uuid@9.0.1`には`v6`自体が存在しない。

**installed dependency sourceの追跡結果**（`node_modules`実ファイルをgrep・読解、`npm ls uuid --all`で単一install `uuid@9.0.1`のdedup先を確認）:

| Chain | uuid参照箇所 | 呼び出し関数 | buf/offset | 到達性判定 |
|---|---|---|---|---|
| `@google-cloud/secret-manager`→`google-gax`→`uuid` | `google-gax/build/src/util.js:108`（`makeUUID()`） | `v4()`のみ | 渡していない | **NOT REACHABLE**（`makeUUID()`はgoogle-gax内部からもsecret-managerからも一度も呼ばれていない） |
| `google-gax`→`retry-request`→`teeny-request`→`uuid` | `teeny-request/build/src/index.js:135`（`retry-request`自体はuuidを一切参照しない） | `v4()`のみ | 渡していない | **NOT REACHABLE**（multipart upload branch限定、かつ本アプリはmultipart upload自体を行わない） |
| `google-auth-library`→`gaxios`→`uuid` | `gaxios/build/src/gaxios.js:417` | `v4()`のみ | 渡していない | **NOT REACHABLE**（同上） |

補強確認:
- この3ファイル以外に4パッケージ内で`uuid`をrequireする箇所はない（網羅的grep）。
- `atlib-sales-tools`自身のソース（`src/**`）は`uuid`を直接importしていない。
- アプリの実利用経路（`src/lib/secrets.ts`の`accessSecretVersion`＝単純取得、`src/services/externalDeletionManifestStore.ts`のGCS入出力＝素の`fetch()`直接使用でgaxios/teeny-requestを経由しない、`src/routes/staffAuth.ts`のOAuth token交換＝単純POST）はいずれもmultipart uploadを伴わない。

**ローカルPoC再現**（installed `uuid@9.0.1`、`node -e`で実行）: `v3(name, NS, buf[8], offset=4)`・`v5(name, NS, buf[8], offset=4)`はいずれも例外を投げず境界外へ書き込む（advisory記述と一致、脆弱コード自体の存在を確認）。ただし、この`buf`/`offset`付き呼び出し自体が3パッケージのどこからも行われていないことを上記ソース追跡で確認済み。

### 22.3 F2 Human Decision — CLOSED — RISK ACCEPTED / NOT REACHABLE

**記録する内容**: Finding exists / vulnerable package installed（`uuid@9.0.1`、GHSA-w5hq-g745-h8pq対象範囲内） / vulnerable code path（`v3`/`v5`/`v6`+`buf`/`offset`）NOT REACHABLE under current dependency graph and application usage。

**明記しないこと**: 「脆弱性が存在しない」「修正済みである」とは記録しない。`npm audit --omit=dev`はmoderate 5件を報告し続ける（qs分2件解消、uuid分5件はRisk Acceptedであり解消ではない）。

**再評価（再OPEN）条件**（いずれか発生時にF2を再OPENする）:
1. `uuid`のresolved versionまたはdependency chainの変更
2. `google-gax`/`gaxios`/`teeny-request`/`retry-request`のversion変更
3. `@google-cloud/secret-manager`/`google-auth-library`のversion変更
4. `uuid`の`v3`/`v5`/`v6`の新規利用（このリポジトリまたは依存先での追加）
5. multipart upload等、現在このアプリが使用していないGoogle client library code pathの利用開始
6. advisory内容・severity・exploit条件のGitHub Advisory Database上の更新
7. dependency security scanで新しい関連findingが検出された場合

**終了条件**: 将来の通常dependency maintenanceで`uuid`がpatched version（11.1.1以降）へ自然に解消された場合、本Risk Acceptanceは終了し、F2を**CLOSED — FIXED**へ更新する。

**今回のRisk Acceptanceのために実施しなかったこと**（ガードレールとして維持）: `npm audit fix --force`、Google関連library（`@google-cloud/secret-manager`/`google-auth-library`等）のメジャーバージョン更新。

### 22.4 Readiness状態サマリ（2026-09-19時点、最新）

- **F1**: CLOSED — FIXED / EVIDENCED
- **F2**: CLOSED — RISK ACCEPTED / NOT REACHABLE（§22.3。再評価条件あり）
- **F3**: OPEN
- **F4**: OPEN
- **F5**: OPEN
- **F6**: OPEN
- **F7**: Business Decision CLOSED（docs/66）／Implementation + Test確認済み／**Production Evidence OPEN**
- **F8**: Role Model DECIDED（docs/72§1）／**Named Owners OPEN**／**Monitoring & Alert Evidence OPEN**
- **F9**: OPEN
- **UI Audit / Traceability**（F4とは別建て）: CLOSED

### 22.5 総合判定

F1・F2（Risk Accepted）・UI Audit/Traceabilityが解消し、F7/F8のBusiness Decision面も整理済みだが、F3・F4（インフラ層）・F5・F6・F7（Production Evidence）・F8（Named Owners/Monitoring Evidence）・F9が未解決のため、**Production Readinessは引き続きNO-GO**。mainへのmerge可否・Production deploy可否・実顧客データ利用可否は別Gateとして扱い、本追記時点ではいずれも承認していない。次のReadiness解消フェーズはF3〜F9を対象としたstaging readiness session（別途計画）とする。

## 23. Staging Readiness Session 実施計画 v2（F3〜F9、Human Decision 2026-09-19で条件付き承認・未実行）

**本章は計画のみを記録する。staging infrastructure作成・Cloud Run deploy・Cloud SQL migration・Secret設定・外部API疎通・実テストはいずれも未実施。** v1（前回提示、文書未記録）に対し、Human Decision（2026-09-19）により4点を修正しv2として確定した。

### 23.1 v1からの修正点（Human Decision 2026-09-19）

1. **F5 PASS条件の修正**: 「request外CPU割当なしでのjob処理保証」を前提としない。採用するCloud Run構成において、request lifecycle／instance termination／scale-to-zero／multi-instance条件下でも、lease expiry/reclaimを含めjobが恒久的に失われず最終的に処理されることをEvidenceで確認する方式へ変更。現Architectureで保証できない場合はPASSにせず、execution modelの再設計GapとしてHuman Decisionへ戻す。
2. **F9の前提条件追加**: Load Test実施前にPilot Capacity AssumptionとInternal Acceptance ThresholdをHuman Decisionする。外部SLAは現時点で設定しない。数値を推測で設定しない。
3. **F7-Eの分離**: Technical EvidenceとLegal Reviewを分離する。Legal ReviewはInfrastructure/Staging Evidenceとは別Gateとして管理する。
4. **F8の実施順序変更**: 6Roleの実名Owner AssignmentをSession Preparationフェーズへ移動し、Monitoring/Alert/Escalation Drillより前に完了させる。

### 23.2 前提として必要なStaging Infrastructure

| 項目 | 内容 | 対応するF |
|---|---|---|
| Cloud Run staging service | production構成を模した専用service（別revision/別URL、production trafficと分離） | F5, F6 |
| Cloud SQL staging instance | production cloneまたは同等schema、synthetic/匿名化dataのみ投入 | F4, F6, F7 |
| GCS staging bucket | `externalDeletionManifestStore`用、production bucketとは別 | F7 |
| Secret Manager staging project/secrets | 本番と分離したsecret set（OAuth client/JWT/SMTP/Slack/Anthropic） | 全般 |
| ロードバランサ/ingress | Cloud Run標準ingressで実X-Forwarded-For付与経路を再現 | F3 |
| 監視対象outbound | 実SMTP送信先・実Slack webhook・実Anthropic API疎通経路 | F6 |

### 23.3 外部依存（Secret / OAuth / AI / SMTP / Slack）

- **OAuth**: 実Google Workspace OAuth client（staging用redirect URI登録）、許可domain（`atlib.jp`）アカウント1件＋非許可domainアカウント1件で許可/拒否を実確認
- **AI (Anthropic)**: 実APIキーをSecret Manager経由で注入、AI-01〜04を実際に1回ずつ成功させる（fake Providerの代替をやめる）
- **SMTP**: 実送信先アドレスへの到達確認（受信ボックス目視）
- **Slack**: 実webhook URLでの通知受信確認
- 全SecretはSecret Manager経由で注入し、チャット/Gitへ値を出さない（既存ガードライン継続）

### 23.4 Cloud SQL role / IAM（F4, F7関連）

- runtime用DBロールとmigration用DBロールを分離（runtimeはaudit/rawテーブルへの書込み権限を持たない構成を検証）
- IAM authentication or password rotation経路の実確認
- 監査ログ（`audit`テーブル）の外部保存（Cloud Logging export等）とアクセス制御、改ざん検知の実設定確認

### 23.5 Cloud Run構成（F5関連、23.1-1の修正を前提とする）

- 採用するexecution model（例: always-on CPU allocation、Cloud Tasks/Pub Sub経由のwork queue、外部scheduler、min-instances≥1固定等の選択肢）を先に決定し、それがrequest外でのjob処理をどう保証するかを明示する
- min instances / max instances / concurrency設定の実反映確認
- scale-to-zero時のcold start・DB接続pool再確立の確認、およびscale-to-zero中にjobが失われないことの確認（既存lease機構がinstance再起動をまたいで機能するか）
- deploy中断（新旧revision混在）時の既存in-flight job/requestへの影響確認
- DB接続pool上限（既存`max5`前提）× 複数instance × 他アプリのcapacity budget再計算
- 上記で「恒久的なjob処理保証」が実証できない場合、execution model再設計のGapとしてHuman Decisionへ戻し、PASSにしない

### 23.6 Monitoring / Alert / Escalation（F8関連）

- Cloud Monitoring alert policyの実設定（AI失敗率、queue滞留、5xx率等）
- 実alert発火→実受信確認（Slack/email等、実名Owner宛）
- incident escalation経路（Technical Incident Escalation Role、Privacy/Security Escalation Role）の実運用確認
- 前提: 6Roleへの実名Owner割当はSession Preparationフェーズで完了済みであること（23.1-4）

### 23.7 Backup / Restore（F4, F6, F7関連）

- 実Cloud SQL自動backup + PITR (Point-in-Time Recovery) の実施・復元検証
- 復元後のapp接続・データ整合性確認（既存local pg_dump/restore rehearsalの実Cloud SQL版）

### 23.8 Deletion Reconciliation（F7関連、Technical Evidenceのみ）

- 実GCSへの`externalDeletionManifestStore`書込み・読出し確認
- 実Cloud SQL backup/restore後に削除済みデータが復活しないことの実証（現状はlocal Dockerのみで確認済み、実Cloud SQL版が必要）
- F7-EのLegal Review（顧客向けNotice/Consent文言の逐語チェック）は本フェーズに含めない（23.9参照）

### 23.9 F7-E Legal Review（Infrastructure/Staging Evidenceとは別Gate）

- F7-A〜D（Retention/Deletion/Backup整合/AI Data Minimization）のTechnical EvidenceはStaging Sessionで取得する
- F7-E（Customer Notice/Consent文言）はLEGAL_REVIEW_PENDINGのまま、Staging Session実施順序（23.11）には含めず、Legal担当者による独立したReview Gateとして並行管理する。Staging SessionのGO判定はF7-EのLegal Review完了を待たない（別Gateであるため）が、Production最終GOにはF7-E完了が別途必要。

### 23.10 Worker / Lease Recovery（F5関連）

- 実Cloud Run multi-instance環境でのjob claim/lease排他の実証（現状はlocal 2 Poolのみ）
- instance再起動・scale-in時のlease失効・再claimの実確認（23.5のexecution model決定に依存）

### 23.11 Ingress / Forwarded Header（F3関連）

- 実Cloud Run ingressが付与する`X-Forwarded-For`の実際の形式を確認
- `trust proxy=true`設定を、Cloud Run前段の信頼できるproxy段数に限定する設定へ変更し、外部から任意ヘッダーでの`req.ip`偽装が不可能であることを実ingressで確認
- rate limiterのinstance分散問題（in-memory実装の限界）への対応要否を判断

### 23.12 F9 Capacity Assumption / Threshold（Load Test前提、Human Decision必須）

- Load Test実施前に、Pilot Capacity Assumption（想定Case数・同時ユーザー数・想定Context長等）とInternal Acceptance Threshold（許容レイテンシ・エラー率等の内部目安）をHuman Decisionとして確定する
- 外部顧客向けSLAとしては設定しない（Controlled Pilot段階のため）
- 数値は推測で設定せず、実際の営業規模・pilot対象数等のFACTに基づいて決定する
- このHuman Decisionが完了するまでLoad Testフェーズは開始しない

### 23.13 Load Test（F9関連、23.12完了後）

- 23.12で確定したCapacity Assumptionに基づき、大量Case・長期履歴・AI-04大Context・同時admin操作の性能測定を実施
- 結果をInternal Acceptance Thresholdと比較し、超過項目があればGap/Owner/対応方針を記録

### 23.14 実名Owner（Session Preparationフェーズ、23.1-4により最優先で実施）

- docs/72§1で採用した6Role（Diagnosis Owner／Human Reviewer／Management Feedback Facilitator／Customer Follow-up Owner／Technical Incident Escalation／Privacy・Security Escalation）それぞれへの実名割当をSession開始前に完了させる
- 兼務時の責任所在明確化（Guardrail通り）
- この割当が完了するまで、23.6（Monitoring/Alert/Escalation Drill）は開始しない

### 23.15 実施順序（v2、Human Decision確定）

各フェーズ完了ごとにHuman Decisionへ結果を戻し、次フェーズへの進行可否を確認する（一括承認は求めない）。

1. Session Preparation / Owner Assignment（23.14）
2. Staging Infrastructure（23.2）
3. IAM / DB Role / Audit（23.4）
4. Ingress / Proxy（23.11）
5. External Integration（23.3）
6. Backup / Restore / Deletion Reconciliation（23.7, 23.8。F7-E Legal Reviewは別Gate、23.9）
7. Worker / Cloud Run Lifecycle / Capacity（23.5, 23.10）
8. Monitoring / Alert / Escalation Drill（23.6）
9. Integrated E2E（F6: 実AI+実OAuth+実通知を組み合わせたWEB/SALES_VISIT両経路の完走）
10. F9 Threshold Human Decision（23.12）
11. Load Test（23.13）
12. Evidence Consolidation / GO-NO-GO Human Decision（全Fの結果をmatrixへ反映、GO/NO-GO再判定。F7-E Legal ReviewはStaging Session GOとは別Gateのため、Production最終GOの前提として別途確認）

### 23.16 各F項目のPASS条件とEvidence（v2、修正反映済み）

| F | PASS条件（v2） | 取得Evidence |
|---|---|---|
| F3 | 実ingress経由でX-Forwarded-For偽装によるreq.ip操作が不可能であることを実証。rate limitが複数instance環境でも有効に機能する（またはinstance分散を許容する運用判断が記録される） | 実ingressでのheader偽装試験ログ、rate limit動作ログ |
| F4 | runtimeロールがaudit/rawテーブルを変更できないことをDB権限設定で実証。監査ログの外部保存・改ざん検知が実際に機能する | IAM/ロール設定のスクリーンショットまたはSQL、改ざん試行→検知ログ |
| F5 | **（修正）** request外CPU割当なしでの処理保証を前提としない。採用したexecution modelにおいて、request lifecycle/instance termination/scale-to-zero/multi-instance条件下でもjobが恒久的に失われず、lease expiry/reclaimを含め最終的に処理されることを実証。保証できない場合はPASSにせずexecution model再設計GapとしてHuman Decisionへ戻す | Cloud Run設定export、execution model決定記録、instance再起動/scale-to-zeroを跨いだjob完走ログ、deploy中断リハーサル記録 |
| F6 | 実AI-01〜04・実OAuth（許可/拒否双方）・実SMTP送達・実Slack受信・実Cloud SQL restoreを組み合わせたWEB/SALES_VISIT両経路が完走 | 実行ログ、受信確認スクリーンショット、restore後データ整合性確認記録 |
| F7-A〜D | Retention/Deletion/Backup整合/AI Data Minimizationが実Cloud SQL・実GCS・実AI環境でEVIDENCEDとなる（Technical Evidenceのみ） | 実環境でのretention worker実行ログ、削除→backup restore→非復活の実証ログ |
| F7-E | **（分離）** Legal Reviewが独立Gateとして完了する。Staging Session GO判定の前提条件にはしない | Legal担当者によるReviewサインオフ（Staging Evidenceとは別文書） |
| F8 | **（修正）** 6Roleへの実名Owner割当がSession Preparation時点で完了していることを前提に、Cloud Monitoring alertが実際に発火し担当者が実際に受信したことを確認。escalation経路を実際にたどって確認 | Owner一覧（実名、Session Preparation時点で取得）、alert発火→受信のタイムスタンプ付き記録 |
| F9 | **（修正）** Load Test実施前にPilot Capacity Assumption/Internal Acceptance ThresholdがHuman Decisionとして確定していること（外部SLAではなく、推測値でもない）。その上で実測値がThreshold内に収まる、または超過項目にGap/Owner/対応方針が記録される | Human Decision記録（Capacity Assumption/Threshold）、負荷試験結果（レイテンシ/エラー率）、ボトルネック分析 |

### 23.17 現時点の状態

v2計画はHuman Decision（2026-09-19）により条件付き承認された。**staging infrastructure作成・Cloud Run deploy・Cloud SQL migration・Secret設定・外部API疎通・実テストはいずれも未着手**。次のステップはフェーズ1（Session Preparation / Owner Assignment）の実施可否について、あらためてHuman Decisionを得ることである。

## 24. Update — 2026-09-19（Phase 1 / 1.5 / 1.6 — Session Preparation・Environment Architecture Assessment・Cloud Reality & Cost Check）

検証日: 2026-09-19。本章もplanning/investigationのみを記録する。**resource作成・IAM変更・Secret変更・OAuth変更・deploy・migration・外部API実行・Production変更・実顧客データ投入はいずれも未実施。**

### 24.1 Phase 1 — Session Preparation / Owner Assignment（Human Decision承認済み）

docs/72§1でDECIDEDの6Role（Diagnosis Owner／Human Reviewer／Management Feedback Facilitator／Customer Follow-up Owner／Technical Incident Escalation／Privacy・Security Escalation）について、既存Canonical/repositoryを調査した結果、**全6Roleで実名Owner割当のFACTは存在しない**（docs/72§11が「named owners...are NOT DECIDED by this document」と明記）。全RoleをHUMAN ASSIGNMENT REQUIREDとして分類し、Technical Incident EscalationとPrivacy/Security EscalationについてはOwner（一次受付・調整）と専門判断先（技術/Legal・Security）を分離した構造を提示した。実名は推定・設定していない。実名Owner割当はHuman側で別途決定する。

### 24.2 Phase 1.5 — Environment Architecture Assessment（Human Decision承認済み）

現Production環境（GCP project `msp-zabbix`）の構成を調査した結果、以下のFACTが判明した:

- **GCP Project**: `msp-zabbix`をmsp-customer-portal・Zabbix監視系・sales-toolsが共有（SHARED）
- **Cloud SQL instance**: `msp-customer-portal-db`という単一instanceを共有。`sales_tools`はそのinstance内の別database（instance自体はSHARED、database/DBユーザーは分離）
- **OAuth client**: msp-customer-portal用の既存clientをredirect URI追加登録で共用（SHARED）
- **SMTP secret**: `portal-*`の値をそのまま共有（SHARED）
- **Anthropic API key**: repository記載に矛盾があり専用/共有はUNKNOWN（要Console確認）
- **GCS**: sales-tools用バケットは本番含め未作成（NOT EXISTS）
- **Monitoring**: sales-tools向けのUptime Check/Alertは未設定（NOT EXISTS）

Data/Failure Boundary調査により、共有Cloud SQL instanceはbackup/restoreがinstance単位であること、DB接続枠を共有すること、既存`controlled-pilot-external-evidence-execution-pack-v1.md`が「共有本番instanceへの直接restoreリハーサル」を既に禁止していることを確認した。Staging Architecture 3案（Option A Fully Isolated／Option B Project Shared・Resources Isolated／Option C Minimum）を比較し、Production Shared Architectureの扱い（Blocker/Risk Accepted/GA分離候補）は未確定のまま候補提示にとどめた。

### 24.3 Phase 1.6 — Cloud Reality & Cost Check（Human Decision承認済み）

**gcloud CLIは引き続き動作不能**（`gcloud config list`、exit code 49）。修復は目的化せず、Claude Code側からのGCP実態確認は不可能なため、Human確認用の**13項目Consoleチェックリスト**を提示した（sales-tools Cloud Run/SA/Cloud SQL instance・database・backup・PITR・tier/region/DB user/関連Secret存在/Anthropic key専用性/SMTP secret共有確認/IAM binding/GCSバケット/Monitoring、および staging専用OAuth client作成可否）。**この確認結果を受け取るまで、repository記載と実Cloud状態が一致しているとは扱わない**。

費用確認では、公式GCP pricing page（JS動的描画）を直接取得できなかったため、第三者集計サイト（bytebase.com、2026-09-14更新、US Central/Iowa基準・compute単体）からCloud SQL tier間の相対的な費用差（参考値）のみ確認できた: db-f1-micro約$8/月 < db-g1-small約$26/月 < db-standard-1（1vCPU/3.75GB）約$49/月。**Tokyo（asia-northeast1）実額、storage/backup/HA/egress、Cloud Run/GCS/Secret Manager/Monitoringの正確な単価は取得できていない**。架空のusageを置いた月額断定はしていない。

### 24.4 Architecture Decision（Human Decision 2026-09-19）

**Staging Architecture**: **Option B — Project Shared / Resources Isolated** をStaging Architectureとして確定した。**これはProduction Architectureを同一構成にするDecisionではない。** Stagingでは少なくとも次のresourceをProductionからresource単位で分離する方針とする: Cloud Run service／Cloud SQL instance／database・DB roles／GCS bucket／Service Account／Secrets／OAuth client／Monitoring・Alert。**Cloud SQL instanceはProduction共有instance（`msp-customer-portal-db`）から必ず分離する**（§24.2のBackup/Restore/接続枠/blast radius理由を維持）。

**Temporary Staging**: Phase 2で構築する環境は当面「**Temporary Staging for Production Readiness Evidence**」と位置付ける。恒久Staging環境として最初から扱わない。Readiness Session終了後、継続利用するか削除するかは別途Human Decisionする。

**Phase 2 Resource Plan**: §23.16/前回提示のResource Planを基本承認。原則すべて**CREATE**とし、Production resourceを再利用しない構成を第一候補とする。**staging OAuth clientも専用client作成を第一候補**とする。Production OAuth clientへのredirect URI追加は、専用client作成が不可能と判明した場合のみ、あらためてHuman Decisionへ戻す（現時点では採用しない）。

**Cloud Reality Check**: Phase 2のresource作成前に、Human によるGoogle Cloud Console確認（§24.3の13項目）を実施する。確認結果を受け取るまでrepository記載と実Cloud状態の一致を前提としない。差異があった場合はCloud実態を**Current FACT**として扱い、repository/documentationとの差異を記録する。Secret値そのものの確認・記録は不要。

**Cost**: Phase 2開始前に必要なのは精密な月額見積ではなく、**Cloud SQL staging instanceのtier選定と、その構成で許容可能な費用であることの確認**。Google Cloud Pricing CalculatorをHumanが直接利用して確認する。Cloud Run/GCS/Secret Manager/Monitoringについて、現時点で架空usageを設定した月額確定は行わない。

**Production Shared Architecture**: 引き続き確定Decisionにしない（Production Cloud SQL共有のBlocker認定／Production OAuth・SMTP共有のRisk Accepted可否／GAまでのProject分離要否は、Staging Evidence取得後のProduction GO判定で判断する）。「Production共有Cloud SQL上でrestore rehearsalを行わない」は既存方針どおり維持する。

### 24.5 Phase 2ゲート — 次のHuman入力待ち

Phase 2（Staging Infrastructure構築）は開始しない。以下4点のHuman入力を待つ:

1. Console 13項目の確認結果（§24.3）
2. Cloud SQL staging instanceの候補tier／許容費用の確認結果
3. staging専用OAuth client作成可否の確認結果
4. GCP resource作成権限の確認結果

これらが揃うまで、resource作成・IAM変更・Secret作成/変更・OAuth作成/変更・Cloud Run deploy・Cloud SQL migration・外部API実行・Production変更・実顧客データ投入のいずれも行わない。

## 25. Update — 2026-09-19（Human Cloud Reality Check — Console確認結果、Current Production FACT）

検証日: 2026-09-19。HumanがGoogle Cloud Consoleを直接確認した結果を、repository推定ではなく**Current Production Cloud FACT**として記録する。commit `6837150`（Phase 1/1.5/1.6・Architecture Decision）は維持し、書き換えない。**Production resourceは今回も一切変更していない。**

### 25.1 Cloud Run — sales-tools（Console確認済みFACT）

| 項目 | 値 |
|---|---|
| Region | asia-northeast1 |
| Runtime Service Account | `sales-tools-sa@msp-zabbix.iam.gserviceaccount.com` |
| CPU | 1 vCPU |
| Memory | 512 MiB |
| Auto Scaling | あり |
| Min instances | 0 |
| Max instances | 20 |
| CPU allocation / billing | Request-based |
| Request timeout | 300秒 |
| Concurrency | 80 / instance |
| Container port | 8080 |
| Cloud SQL connection | `msp-customer-portal-db` |

### 25.2 Cloud SQL — msp-customer-portal-db（Console確認済みFACT）

| 項目 | 値 |
|---|---|
| Engine | PostgreSQL 16.14 |
| Edition | Cloud SQL Enterprise |
| Machine | 1 vCPU / 628.74 MB |
| Region | asia-northeast1 |
| Availability | Single zone |
| Automatic backup | enabled |
| Retained automatic backups | 7 |
| PITR | **disabled** |

**Production共有Cloud SQL上ではrestore rehearsalを行わない既存Decision（§7・§23の方針）を維持する。Production設定は今回変更していない。**

### 25.3 docs/66 BD-04とのGAP（記録のみ、Production変更なし）

git_KAIZEN `docs/66` BD-04は「Backup retention target: 30 days」、Pilot internal RPO 24h / RTO 24hを定めている。Console確認済みFACTと比較すると:

- **Backup retention GAP**: 現在保持されている自動バックアップは7世代。BD-04目標の30日（バックアップ頻度が日次である場合は約30世代相当）に対し、明確な差がある。実際のバックアップ頻度（日次かどうか）は今回未確認のため、7世代が何日分に相当するかはUNKNOWNのまま記録する。
- **PITR GAP**: PITRが無効のため、任意時点への復元ができない。既存`controlled-pilot-external-evidence-execution-pack-v1.md`§4（Cloud SQL isolated restore rehearsal）は「source backup/PITR timestamp」を復元起点として想定しており、**現在のProduction設定ではPITRに基づく復元Evidence取得はそもそも技術的に不可能**というGAPが新たに判明した。F7-C（Backup/Restore整合のEVIDENCED化）のEvidence取得は、Production自体のPITR設定変更ではなく、Temporary Staging Cloud SQL側でPITRを有効にして代替検証する方針とする（Production非変更の原則を維持するため）。

このGAPはProduction Readiness Gap（F7関連）として記録するのみであり、**Production側のPITR有効化・backup retention変更は行っていない。**

### 25.4 Secret Boundary（UNKNOWN解消）

| Secret用途 | 参照Secret名 | 分類 |
|---|---|---|
| DB password | `sales-tools-db-password` | DEDICATED |
| Staff JWT | `sales-tools-staff-jwt-secret` | DEDICATED |
| Google OAuth Client Secret | `sales-tools-google-oauth-client-secret` | DEDICATED |
| Anthropic API Key | `portal-anthropic-api-key` | **SHARED**（§24.2のUNKNOWNを解消。`sales-tools-anthropic-api-key`という名前のsecretはSecret Manager全27件の一覧に存在せず、実Cloud Runは`portal-anthropic-api-key`を参照していることをConsoleで確認） |
| SMTP password | `portal-smtp-password` | SHARED（§24.2のFACTを再確認） |

`docs/運用手順書_デプロイ.md`手順4が記載する「`sales-tools-anthropic-api-key`ローテーション手順」は、**現在の実Cloud Run参照とは一致しない（手順書が実態を反映していない）**。この差異を記録する。運用手順書の修正はこのHuman Decisionの範囲外のため、本Update内では現状のまま記録に留める。

### 25.5 Slack Webhook — Production Security GAP

`SLACK_WEBHOOK_DIAGNOSTIC`はSecret Manager参照ではなく、**Cloud Runの通常環境変数として平文設定されていることをConsoleで確認した**（Secret値そのものは記録しない）。これをProduction Security GAPとして記録する。

**Production GO前の対応候補**（今回は未実施・未決定）:
- Secret Manager化（環境変数からSecret参照への切替）
- webhook rotation（環境変数として存在していた期間のExposure面を考慮したローテーション）

現時点ではProduction設定を変更していない。対応要否は別途Human Decision。

### 25.6 IAM（確認できた範囲のみ、推測なし）

- `sales-tools-sa@msp-zabbix.iam.gserviceaccount.com`の実在をConsoleで確認
- Project IAM上で当該SAへの`Cloud SQL Client`ロール付与を確認
- **他のresource-level IAM（Secret単位のaccessor付与範囲等）は今回確認できておらず、推測しない。** UNKNOWNのまま維持する。

### 25.7 GCS

sales-tools専用のGCSバケットは現在のバケット一覧に存在しないことをConsoleで確認した（§24.2のNOT EXISTS判定を確定FACT化）。Phase 2ではdeletion reconciliation Evidence用のstaging GCSをCREATEする既存方針（§23.16・§24.4）を維持する。

### 25.8 Monitoring

現在のAlert Policyは「Portal and Topology Uptime Failure」の1件のみで、sales-tools専用のMonitoring/Alert Policyは存在しないことをConsoleで確認した（§24.2のNOT EXISTS判定を確定FACT化）。Phase 2ではstaging専用Monitoring/AlertをCREATEする既存方針を維持する。

### 25.9 OAuth

Google Cloud Console上でOAuth 2.0 Client IDの管理画面・新規認証情報作成導線が利用可能であることを確認した（作成そのものはまだ実施していない）。現在3つのOAuth Clientが存在するが、**どれがProduction sales-toolsの実Client IDに対応するかは未確定のまま**である。Phase 2ではstaging専用OAuth clientをCREATEする第一候補方針（§24.4）を維持する。

### 25.10 Phase 2ゲートの現在状態（更新）

| 項目 | 状態 |
|---|---|
| Console Reality Check | **主要項目確認済み**（§25.1〜25.9） |
| Cloud SQL staging tier / 許容費用 | **OPEN** |
| staging専用OAuth client | 作成導線確認済み／実作成は未実施 |
| GCP resource作成権限 | **OPEN**（閲覧可能であることと作成権限があることは別、未確認） |

resource作成・IAM変更・Secret変更・OAuth変更・deploy・migration・外部API実行・Production変更・実顧客データ投入はいずれも未実施。
