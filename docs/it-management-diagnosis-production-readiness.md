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
