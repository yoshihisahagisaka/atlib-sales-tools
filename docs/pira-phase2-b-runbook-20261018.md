# PIRA共同購買 B案 Phase 2 — コード分離・検証・適用前Runbook

状態: 開発ブランチのみ。検証DBを含むmigration、Cloud/DB作成、Secret変更、実通知、Production、main mergeはNo-Go。

## 基準と既存記録

- Production Canonical: atlib-sales-tools/main `d35581cec3dbc7d4ca2938f2a9c664906ccc5316`（今回fresh read）。Productionとの対応は未確認。
- 設計#13: `0d219617ecf23646633ca2764eb83e4420caaf48`。
- Phase 1 #14: `ea8fa9d331276eb8372f270ae2f5d5f402bd04d9`。本branchはこのcommit上のstack。設計/Phase 1を二重適用しない。
- B採用方針・配置/IAM/通信: https://github.com/yoshihisahagisaka/atlib-sales-tools/pull/13#issuecomment-6250391533
- DBリスク受容票・工程: https://github.com/yoshihisahagisaka/atlib-sales-tools/pull/14#issuecomment-6250405794
- Canonical policy、Phase 1 Runbook/status/validation-readiness、036 ACL判断を継承する。旧Runbook/DDL/hashは歴史証跡として変更しない。本書がBの実行境界を具体化する。

## 責務と再利用

| 配置 | 実行入口 | 保持する責務 | 持たせない責務 |
|---|---|---|---|
| 公開portal | dist/pira/portalServer.js | 外部UI、限定BFF、OAuth入口/固定callbackの中継、cookie中継 | DB、staff権限、署名鍵、通知Secret、Sales宛upstream |
| 非公開core | dist/pira/coreServer.js | 外部認証/session検証、毎request権限、Phase 1 service、PIRA writer、audit/outbox | 社内画面/社内OAuth、企業マスター作成、worker自動起動 |
| Sales既存 | dist/server.js | 社内認証/画面、企業作成/照合、見積、PIRA社内adapter、既存業務 | 外部PIRA入口、PIRA直接writer |
| 明示型通知単位 | scripts/pira/processNotifications.cjs | outbox lease/retry、既存Slack/Mailer transport | 公開HTTP配送API、業務変更、他Sales Secret読み込み |

model/service、finalizeOrder、MANUAL、版/数量/条件snapshot、unique application制約、global advisory lock、監査/outboxを再利用。変更はentrypoint・caller認証・限定proxy・Repository参照・Sales command・通知originの分離を中心とする。serviceの変更は監査caller/request IDと見積company参照に限る。

外部assetはexternal.jsとCSSのみ。setup（社内マスター管理）を含むpira.jsはSales用。Dockerfile.piraのportal/core targetは異なる実行コード/assetをコピーし、Sales全体を再起動しない。依存installは既存lockを再利用するためportalのnode_modulesにも未使用依存が残るが、runtime import graphにDB clientはない。依存最小化は別途lock管理を伴う改善候補。今回image buildは未実施。

## APIと信頼境界

- browser → portal: `/pira/`、列挙したasset、`/pira/auth/login|callback`、`/pira/api/*`。
- portal → core: 固定HTTPS origin・audience、Google metadata/ADC由来ID token（Authorization）。鍵ファイルは発行しない。external prefixのみ。
- Sales browser → Sales: 既存staff cookie・admin gate・Origin/custom header。外部cookieでは管理APIを利用不可。
- Sales server → core: 別SAのGoogle ID token + staff gate由来email。internal prefixのみ。coreでatlib_admin membershipを確認。staff cookie/署名鍵を中継しない。
- core `/external/*`はportal SA、`/internal/*`はSales SAを署名・issuer・aud・expiry・subject・verified emailで照合。利用者session/所属/権限は別に毎request確認。未検証caller headerは受理しない。
- proxyはGET/POSTと明示method/path/kind/queryのみ。任意upstream、encoded path、内部kind、社内header、staff cookie、browser Authorizationを転送しない。body32KiB、応答2MiB、upstream timeout15秒、redirectを制限。
- 外部Google/PKCE/state/nonce・専用pira cookieの検証はcore。callbackは固定portal origin。cookieはhost-only、Path=/pira、HttpOnly、production Secure、SameSite=Lax。OAuth state cookieのみcallbackに転送。API writeはOrigin+CSRF検証。
- rate limitは既存部品を再利用。portal120/min、core240/min、インスタンス内カウント。未検証X-Forwarded-Forを信用しないためproxy配下で共通IP集計となり得る。実client IP/分散limitは環境結合で評価し、無断でtrust proxyをtrueにしない。
- coreに匿名health HTTPはない（Cloud Run標準TCP startup probeを候補とする）。portal `/healthz/`はDB/利用者情報を返さない。
- `PIRA_EXTERNAL_ENABLED=true`でもSales内の外部入口を再開しない。Salesの`PIRA_ENABLED`がfalseなら社内PIRAも閉じる。

## 構成・IAM・Secret（値は保存しない）

| 実行単位 | 設定名 | 注入/権限 |
|---|---|---|
| portal | PIRA_EXTERNAL_ORIGIN、PIRA_CORE_ORIGIN、PORT | 公開設定のみ。専用SAにcore限定run.invoker |
| core | 上記、PIRA_SALES_ORIGIN、PIRA_PORTAL_SA_EMAIL/SUB、PIRA_SALES_SA_EMAIL/SUB | SAはsubject/emailとも異なること。coreに匿名Invokerなし |
| core | PIRA_GOOGLE_CLIENT_ID、PIRA_GOOGLE_CLIENT_SECRET、PIRA_SESSION_SECRET | 専用外部OAuth。secret/keyは個別Secret accessorで注入。社内client/keyを使わない |
| core DB | PIRA_DB_HOST/PORT/NAME/USER/PASSWORD、POOL_MAX | user=pira_core_runtime、pool上限2。DATABASE_URL/Sales設定へfallbackしない |
| notifier | 同じDB設定（user=pira_notifier、pool既定1）、PIRA_EXTERNAL_ORIGIN、PIRA_SALES_ORIGIN | coreと別DB role/SA。通知用の限定権限 |
| notifier | PIRA_NOTIFY_ENABLED、PIRA_EMAIL_ENABLED、PIRA_SLACK_WEBHOOK_URL、PIRA_SMTP_HOST/PORT/USER/PASSWORD/FROM | 未有効ならDB未接続でSKIP。メール/Webhook未設定は未配送保持。個別Secret注入 |
| Sales | 既存設定、PIRA_ENABLED、PIRA_CORE_ORIGIN | 社内SAにcore限定Invoker。外部OAuth/session/通知Secretは不要 |

portal起動設定にDATABASE_URL、PG/DB資格情報、PIRA_DB_*、STAFF_*、署名鍵/OAuth secret/通知/SMTP設定、GOOGLE_APPLICATION_CREDENTIALS等が混入したらfail closed。coreはPIRA専用DB role名とsuperuser/BYPASSRLS/CREATEROLE/CREATEDBでないことを接続時検査する。有効ACL/owner/継承まで安全と自動証明したわけではなく、別途適用前gateを必要とする。Secret値/Token/cookie/リクエスト本文をログに出さない。

TCP DB接続はTLS検証を既定とする。Cloud SQL Unix socketは接続経路を別確認。将来の専用local DBのみ、PIRA_DB_LOCAL_PLAINTEXT=trueをloopback host限定で許可する。この設定は本番に使用しない。実DB接続は今回行っていない。

## 通信経路（未設定）

coreはCloud Run ingress=internal＋IAM必須。portal/Salesから承認VPCへDirect VPC egressし、Private Google Access等の承認済経路を通す案。project/region/VPC/subnet/DNS/egress/NATの実値はread-only確認後に固定する。同一projectのCloud Runであるだけでinternal ingressへ到達できるとは扱わない。

all-traffic egressを採る場合、既存Sales/OAuth/SMTP/Slackへの影響を評価する。必要な既存経路がなければ停止し、public ingressへ緩和しない。IAMのみで外部到達を遮断したと報告しない。portalにSales向けInvoker/Secret権限を付けず、既存Salesの社内管理APIはstaff認証を維持する（Salesの既存公開LPは別）。

## DB限定共有・参照の所有者

coreのPgPiraStoreはLimitedSalesReferencesを注入し、company/見積base tableへの直接writeをしない。companyはpira_company_reference、見積はpira_estimate_referenceの限定投影を参照。将来別DBへ移行する場合の差替え境界であり、cross-DB FK/整合性が自動解決されるものではない。

企業作成はSales staff認証とcore sessionによるatlib_admin確認後に実施する。法人番号または人が確認した参照番号から安定IDを導出し、同じ入力の再送を再開する。法人番号重複候補は自動採用せず、既存IDの人による選択を要求する。企業名だけで同一判定しない。全Sales入口の重複対策を統一したわけではない。

企業作成とcore所属登録は別transaction。所属登録失敗時は企業を消さず、同じ根拠/IDで再開・人が照合する。孤立候補の確認は社内責任。外部入力から企業を作成/更新しない。

Sales見積にcompany FKがないため、pira_estimate_company_bindingへ人の照合根拠・操作者・見積版をappend-onlyで保存する案を追加。InfraVision価格条件の社内登録ではestimateEvidenceが必要。coreはcompany一致・confirmed・updated_at版一致を参照viewで検証。企業名/customer_nameで自動照合しない。販売価格はPIRA termsの別承認値を使い、原価見積を外部へ公開しない。

見積照合の保存とterms承認は別transaction。失敗後は同じ版/企業で再開でき、別企業への上書きは拒否。全Sales見積更新と発注の一括直列化は行っておらず、確定点の競合要件は実PG試験で検証する。

docs/pira-phase2-reference-acl.draft.sqlは未採番・runner外・未適用。Phase 1 DDLの後に参照/ACL差分が必要であり、現行DDLだけではBを起動できない。rolesはこのSQLで作らない。歴史018のdefault ACLを再現し、広いSales role/PUBLIC権限を明示REVOKEする。036の判断を継承し、狭いGRANTだけで安全と判断しない。append-only表はSELECT/INSERTのみ。notifierはoutbox UPDATE、必要投影/組合SELECT、audit INSERTのみ。runtimeがowner/広い継承/危険な関数権限を持たないことを実効ACLで確認する。

DB物理共有によるCPU/I/O/接続/lock・maintenance・復元の社内影響は残る。初期接続候補はcore2×最大2instances＋worker1=5、rolling revision同時稼働は別加算。既存Sales/他client/管理用reserveと合算して実max_connectionsの予算を確定する。max instances候補値はコードだけで強制できず、Cloud設定を別承認する。

## ローカル検証コマンド

通常のレビュー済checkoutで実行する（必要な依存は既存lockから用意）。実DB接続/通知の環境変数は設定しない。

```powershell
npm.cmd run build
node --test --test-reporter=tap test/piraPhase2.test.cjs
node -r ts-node/register --test --test-reporter=tap test/assessmentStructureRule.golden.test.ts test/businessWebConsultation.golden.test.ts test/currentDesignV1.golden.test.ts test/freeDiagnosisDesignV2.golden.test.ts test/kaizenAssessment.golden.test.ts test/ruleAnalysisEngine.golden.test.ts test/webDevelopmentPartnerLeadRepo.test.ts
node test/piraPhase2.browser.cjs
node scripts/pira/processNotifications.cjs
```

最後のworkerコマンドはPIRA_NOTIFY_ENABLED未設定ならSKIPとなり、DB/通知に接続しない。ブラウザは既存インストール済Playwrightを使用し、mock APIで社内/企業×PC/モバイル4ケース。必要なら既存browser cacheのPLAYWRIGHT_BROWSERS_PATHを指定する。認証・実backendのE2E試験ではない。

この作業環境では直接git cloneのDNS解決/既存C:/atlib worktreeのshell読取に制約があったため、固定SHAの既存スナップショットとGitHub connectorを使用した。既存依存を検証領域へコピーし、既存worktree・依存版を変更していない。GitHub commitは#14の実SHAをparentにして差分のみ登録する。ローカルのスナップショット用root commitをGitHubへpushしない。

## 実環境結合の適用前gate

今回の検証証跡は `docs/evidence/pira-phase2-20261018/` に保存する。

| 検証 | 結果・限界 |
|---|---|
| strict TypeScript build | PASS |
| Phase 1継承＋B境界 | 23 PASS / 0 FAIL / 8 SKIP。PGlite・socket-free Express・機械token検証を注入するmock |
| 最終参照/通知差分の追加確認 | 3 PASS。ポータル設定の最終追加チェックも別途確認 |
| browser | 4 PASS。route mock、社内/企業×PC/モバイル |
| 従来と同じ7ファイル回帰 | 78 PASS / 2 FAIL / 1 SKIP。2件はmain再現済みCurrent Design v1の同じ失敗 |
| 既存検証準備 | 4 PASS。実DB接続なし |
| 補助的な広い回帰の試行 | 31 PASS / 16 FAIL / 1 SKIP。既知2件、local HTTP fetch failed 13件、取得スナップショットで参照文書欠落1件。文書をCanonicalから復元し該当1件は再試験PASS。HTTP13件はPASSとせず、ネットワークE2E未確認として保持 |
| 実IAM/ingress/VPC、実Google、実PG/ACL、実通知、image build | 未検証/未実施 |

Phase 1の既知失敗・main再現証跡は親PR内に保持。本結果を実環境の認証/排他/ACL検証に読み替えない。

1. 実Production revision/image/trafficとGit SHA、実ledger・owners/default ACL/実効ACL・既存重複件数を既存read-only collectorで確認。顧客名/メール/Secret値を出力しない。既存権限制約を回避しない。
2. DB共有リスク受容、専用検証環境（Send/FACTACTを流用しない）、VPC/IAM/SAs/OAuth対象者、接続予算・SLO/RPO/RTO・運用担当を統括が承認。
3. Phase 1 DDLと本差分の適用前提・採番/filename ledgerを調整し、新hash/manifestを固定。既存037以降を無断予約/再適用しない。実PGで歴史default ACLを再現した否定試験・backup/restore rehearsalの実施を別承認。
4. Cloud ingress/IAMの外部拒否、caller別許可、実Google PKCE/失効、他組合/他企業拒否を実証。ローカルmockをPASS証拠の代用にしない。
5. 実PG並行発注/timeout後再送・snapshot不変・audit/outbox全rollback・ACL・DB障害/負荷・社内回帰・復旧を試験。
6. 別途通知承認後、ユーザーがC0C9YB6F49H専用Webhookを確認/設定する。URLはGit/チャット/ログへ出さず、専用Secretへ投入。既存診断Webhookを変更しない。メールは承認済テスト宛先だけで検証。配信はat-least-onceで応答喪失による重複可能性を残す。

Googleを利用できない担当者への認証方式は未決定。追加IdP/メール認証を無断実装しない。診断完了producerも後工程。InfraVision既存顧客UUID/code/portal/onboarding、Guard数量未確定、Send未完成APIとの境界を変えない。

## デプロイ計画・切戻し（今回は実行禁止）

1. 承認後に専用検証環境で実証→レビュー済source SHA・各target image digest・設定version・DDL hash・IAM/VPC計画を固定。Dockerfileのbase digestもrelease時に固定する。
2. 専用role/参照/ACL適用→coreを非公開で候補起動→Sales社内adapterを候補revisionで検証→portalを最後に有効化。旧Sales内PIRA writer/外部入口を復活させない。Productionのmain統合・Cloud作成・traffic変更は個別承認。
3. coreへ匿名/未知SA/外部ネットワーク/portalのinternal操作を拒否するsmoke。Salesの社内認証/既存LP/見積が継続することを確認。
4. 異常時はportal受付停止→新規業務停止/worker停止→transaction drain→互換性を確認して各アプリ版を戻す。新DB roleで動かない旧Phase 1 writerを安易に再有効化しない。
5. 発注/audit/outboxを自動DROPしない。DB全体復元はSalesへの影響と発注/配送差分損失を評価して別承認。将来別DB切替後に書込を再開したら、接続先を戻すだけのrollbackは禁止。

完了判定は「コード・実行入口とローカル検証の分離」。DB共有の本番受容・環境適用のGoではない。
