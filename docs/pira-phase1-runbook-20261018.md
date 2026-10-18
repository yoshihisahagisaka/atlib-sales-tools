# PIRA共同購買 Phase 1：実装・検証・DB適用前Runbook

状態：開発ブランチのみ。実DB適用・Cloud変更・Production・公開・main mergeなし。
基準：Sales main `d35581cec3dbc7d4ca2938f2a9c664906ccc5316`、設計Draft PR #13 `0d219617ecf23646633ca2764eb83e4420caaf48`。

## 実装した境界

- 組合マスター、連絡先、担当者、MANUAL発注方式、サービス別方式の保持。
- 既存company.idの照合・所属、確認済みidentityでの重複防止、契約連絡先snapshot、外部ID対応。会社名一致だけで自動登録/統合しない。
- 申込番号、一覧/詳細、差戻し/修正/取消、状態/版検証、対応メモ・履歴。
- 組合の明示的発注権限、正式発注番号、条件snapshot、再送/二重発注防止、atLIB受注一覧。
- 監査と永続outboxを業務と同じtransactionへ保存。Slackと組合宛メールは別配送行で再試行。Webhook未設定は未配送のまま保持。
- 社内は既存staff認証＋共同購買roleを照合。外部は既存Google OAuth2Client/PKCE部品を使う専用入口・cookie・secret・audience・事前登録制。外部利用者をstaffへ追加しない。

## PR #13からの具体化・差分

1. Phase 1は契約/請求/配分テーブルをまだ作らず、発注まで。確定発注を契約成立/利用開始/請求成立として扱わない。
2. 外部認証の開発adapterは既存依存のGoogleを採用。新しい認証サーバー/IdPは作らない。Microsoft/メールログインは未実装。Googleだけで実対象者を網羅するかは公開前判断として維持する。
3. 11個の専用論理実体を独立表へ分け、id/version/scope列＋版付きJSONB payloadで保存。FK・一意制約・immutable triggerはSQL側にも持つ。物理DDLは未採番draftでrunner外。業務データを1個の全体JSONへまとめない。
4. 小規模な管理処理のPhase 1では共通advisory transaction lockで、権限/所属/料金と発注を直列化。外部通信をlock中に実行しない。高負荷時の粒度分割は別評価。
5. InfraVisionは既存見積がconfirmedであることとupdated_at版を確認し、その見積参照を条件へ固定。既存見積金額は原価見積を含み得るため販売単価として転用しない。atLIBが共同購買の卸価格・条件を別途承認する。
6. 既存contactは無断更新しない。Phase 1の契約連絡先は所属レコード内snapshotとして保持し、既存診断のcontact一覧を組合に公開しない。共通contactへの明示リンクは後工程。
7. 法人番号は13桁形式と人の確認根拠で同定する。国税庁照会/チェックディジット検証は未実装。番号なしは確認済み参照番号が必須。全Sales入口の企業作成を統合したわけではなく、旧入口は重複を作り得る。
8. AUTOはDBの値域と共通finalizeOrderの構造のみ準備。設定APIと発注APIはAUTOを拒否し、判定workerは存在しない。

これらはPhase 1への具体化であり、価格・契約・配分の既決定を変更しない。GuardはbillingQuantityConfirmed=falseを条件/発注snapshotに残し、請求API自体を実装しない。

## 画面・API

| 対象 | 入口 | 保護 |
| --- | --- | --- |
| atLIB | `/admin/pira.html`、`/api/admin/pira/*` | 既存admin gate＋現在の共同購買社内role |
| 組合・企業 | `/pira/`、`/pira/api/*` | 専用Google入口 `/pira/auth/login`、事前登録principal＋毎request現在membership |
| 共通表示資産 | `/pira-assets/*` | 静的なUI資産のみ。既存partner-leads.cssはbase.cssとして再利用 |

主API：GET session、records/:kind、applications/:id、applications/:id/history、orders/:id。
POST applications、applications/:id/revise、applications/:id/transition、applications/:id/order。
社内のみ：POST associations、memberships、companies/resolve、external-links、terms、GET companies?q=。
全POSTでstrict schema。クライアントが単価/金額/承認主体/所属scopeを追加指定しても採用しない。外部のOrigin＋session内CSRF token、社内のOrigin＋custom headerを検証する。

| 権限 | 申込 | 差戻し | 正式発注 | マスター/照合/価格承認 |
| --- | --- | --- | --- | --- |
| atLIB管理者 | 全体、代理受付/対応記録 | 可 | 不可（組合承認を代行しない） | 可 |
| 組合管理者 | 自組合 | 可 | 自組合のみ | 不可 |
| 組合担当者 | 自組合 | 可 | canOrder=trueの明示委任時のみ | 不可 |
| 企業管理者 | 自社、確認済み所属組合へ提出 | 修正・取消 | 不可 | 不可 |

組合所属を理由に同一企業の他組合契約を見せない。請求・配分、診断回答、他サービスの技術情報はPhase 1画面/APIにない。申込/監査メモは許可範囲の関係者に表示されるため秘密情報を入力しない。

## フラグと認証の準備

デフォルトではPIRA_ENABLEDもPIRA_EXTERNAL_ENABLEDも無効。既存管理への公開差分を自動有効化しない。

- 社内を有効にする候補：PIRA_ENABLED=true。実際の設定変更は別承認。
- 外部を有効にする候補：PIRA_EXTERNAL_ENABLED=true、PIRA_EXTERNAL_ORIGIN、PIRA_GOOGLE_CLIENT_ID、PIRA_GOOGLE_CLIENT_SECRET、PIRA_SESSION_SECRET（32文字以上、staff secretとは別）。値はGit/PR/ログに保存しない。
- Googleの固定callback：承認済みorigin＋`/pira/auth/callback`。既存clientの許可URI追加が可能かを確認し、既存社内callbackを置き換えない。
- PIRA_SESSION_SECRETは専用Secretとして安全に注入する。今回Secret/Cloud resourceを作成していない。
- 企業/組合のメールを事前登録し、Googleのverified emailとissuer/subを初回だけbinding。その後の別subへ再bindingは拒否。メールドメインだけの自動所属はない。
- 初期atLIB管理者は、別承認したbootstrap SQL/データ計画でpira_principal（id=staff:正規化メール、internal=true、active=true）とpira_membership（role=atlib_admin、scopeなし）を投入し、監査を残す。環境変数による自動admin作成や公開bootstrap APIは用意しない。投入する実アカウントは未確定。
- 組合管理者自身の担当者招待/委任UIは未実装。Phase 1はatLIB管理者が登録/停止する。停止したmembershipは次requestから不許可。IdP上の停止だけによる既発行cookieの即時失効は保証せず、membership停止と組み合わせる。

## 通知の接続手順（今回は実施しない）

既存sendSlackNotificationのtransportをdeliverSlackNotificationとして結果付きで共用し、従来のvoid/best-effort wrapperは維持する。Mailerも既存transportへ最小メソッド追加のみ。

1. Slack AppのIncoming Webhooksで、ユーザーが対象ワークスペースのチャンネル `C0C9YB6F49H` を選んで専用Webhookを作成/確認する。
2. URLはチャット/PRへ貼らず、承認済みSecret保管/注入経路でPIRA_SLACK_WEBHOOK_URLへ設定する。既存診断Webhookを書き換えない。Webhookのchannel固定を確認し、本文のchannel指定で変更しない。
3. 隔離環境で投稿先と配送結果を確認する計画を承認する。組合通知メールの宛先/同意も確認する。
4. 実送信を承認後にのみPIRA_NOTIFY_ENABLED=trueで `node scripts/pira/processNotifications.cjs` を実行する。今回は未実行。web processはworkerを自動起動しない。
5. 未設定・失敗はoutbox保持。8回でdead、再配送方針を運用担当が確認する。deadの自動リセットUIはない。配信成功直後のresponse喪失では重複可能なat-least-once方式であり、eventIdを表示する。

申込→Slack＋組合メール、正式発注→Slackを実装。診断回答完了は対象source/同意/完了条件が未特定のため**producer未実装**。既存IT経営診断の完了通知へPIRAイベントを無断接続していない。後工程で認証された診断adapterとevent一意キーを追加する。

## サービス接続

- Guard：Organization ID参照のみ。DNSFilter API呼出し・契約/数量設定・請求処理なし。既存PoCを繰り返さない。
- Send：Tenant UUID参照のみ。Draft #5/#6/#8を確認し、未完成APIへの依存なし。Send商用tenant/SSO/exportを複製しない。
- InfraVision：顧客UUID＋customer_codeを根拠付きで保持。同じservice/environment/externalIdは別companyへ二重割当できない。既存顧客のonboardingを呼ぶコードはない。新規顧客登録や停止は既存運用の後工程。
- 外部IDの変更/解除は自動上書きしない。誤紐付けの修正フローは追加審査。現状は同じIDへの証拠更新だけ可。

## 実環境の事前確認結果

| 確認 | 今回の結果 |
| --- | --- |
| GitHub main/PR13 | fresh read、上記SHA |
| Send #8 | `465802eb44bca1bbf7f7494bd05742a5f248ab66`、監査CSV、未マージ。接続なし |
| ローカル既存git | C:/atlib/atlib-sales-toolsはPermission denied。既存worktreeを変更せず、connector固定SHAから別の検証領域へ取得 |
| 直接clone | github.com名前解決失敗。connector読取で代替 |
| Cloud Run revision/image | gcloudが既存logs/credentials.dbへPermission denied。設定/認証情報をコピーせず未確認 |
| 実DB ledger/schema/ACL/重複件数 | 専用read-only接続未設定、preflight SKIP。Git SQLと実適用を混同しない |
| migration採番 | 未確定。Sales mainには001〜036、018/019は各2ファイル。番号でなくfilename単位。037以降の他レーン調整が必要 |

ユーザー端末での最小read-only確認：

```powershell
gcloud.cmd run services describe sales-tools --project=msp-zabbix --region=asia-northeast1 --format='value(status.latestReadyRevisionName,status.traffic)'
```

返った実traffic対象revisionごとに（`<revision>`を実値へ置換）：

```powershell
gcloud.cmd run revisions describe <revision> --project=msp-zabbix --region=asia-northeast1 --format='value(spec.containers[0].image,status.imageDigest)'
```

env/secret全量は表示しない。digestとGit SHAは既存release記録で照合する。latestReadyだけをProductionと見なさない。

DBは承認済みread-only接続をPIRA_READONLY_DB_URL、期待DB名をPIRA_EXPECTED_DATABASEへ安全に設定したセッションで：

```powershell
node scripts/pira/preflight.cjs
```

スクリプトは.env/general DATABASE_URLを読まず、BEGIN READ ONLY内でledger・定義・制約・ACL・company件数/法人番号重複グループ件数のみ取得する。顧客の番号/名称/連絡先の全件は出力しない。接続値を画面へ出さない。取得ACLは可視範囲に限られ、owner/default ACL/実効権限の管理者照合が追加で必要。

## DDL適用計画・停止点

`docs/pira-phase1-schema.draft.sql` はrunner外・未採番・未適用。新規11表とそのindex/FK/immutable trigger/runtime ACLのみ。company/estimatesの既存DDLや既存migrationは変更しない。新規企業を作るruntime処理は既存companyへINSERTするが、今回実DBでは実行しない。

適用前に必要なもの：

1. 実ledger/owner/default ACLとschema整合。037以降を含め全filenameと他レーンの採番を確認し、レビュー済みdraft hashを固定。
2. 既存companyとestimatesの依存確認、既存法人番号重複の件数/担当者確認。重複を勝手にmergeしない。
3. **対象の専用検証DB/role/schema、バックアップ保存先、復元先、保持期間、bootstrap実アカウント**の具体化。未指定のまま実行不可。
4. ownerとruntimeを分離し、歴史的018 default CRUD ACLを隔離リハーサルで再現。audit/order/termsのUPDATE/DELETE/TRUNCATEが実効権限としてないことを確認。runtimeがownerでないことも確認する。
5. table/FK参照lock時間、lock_timeout/statement_timeout上限、失敗時rollback、immutable SQL artifact/allowlist/ledger方式を既存Runbookに沿って準備。今回は番号付きSQLをmigrationsへ置かない。
6. バックアップ取得だけでなく別の空の検証先へのrestore→ledger/schema/件数比較を実証。実データの持出先/暗号化を決めずにdumpしない。
7. 上記結果を統括へ提出し、**専用検証DB適用の別承認まで停止**。実Production適用はさらに別段階。

適用時の期待順序：既存company/estimates確認→association/principal→membership/affiliation/identity/link/terms→application→order/audit/outbox→制約/index/ACL→ledger記録→bootstrap→post-verifier。1つの確定SQLは既存runnerの1-file transactionで適用し、失敗時は全rollback。未確認の既存migrationを再実行しない。

切戻し候補：公開/workerを停止し、未送信outbox・確定発注・監査を保全。PIRAフラグOFFで既存Salesを維持し、専用のtenant/scope認可を緩めない。データ発生後にcompanyや発注をDELETEして巻き戻さず、前進修正を優先。DROP/restoreは承認された隔離検証先だけで個別計画。Production rollbackコマンドは本Runbookで承認していない。

## 再現コマンド・検証上の制約

通常の開発環境：

```powershell
npm.cmd ci
npm.cmd run test:pira
npm.cmd run test:pira:browser
```

今回npm offline ciはzod cache不足（ENOTCACHED）で失敗。依存版は変更せず、既存インストール済み依存を読み取り専用で参照し検証した。Node 24.18.0 / TypeScript 5.9.3。既存node_modulesを書き換えていない。

```powershell
node C:\atlib\atlib-sales-tools\node_modules\typescript\lib\tsc.js -p tsconfig.json --baseUrl C:/atlib/atlib-sales-tools/node_modules --typeRoots C:/atlib/atlib-sales-tools/node_modules/@types
$env:NODE_PATH='C:\atlib\atlib-sales-tools\node_modules'
node --test --test-reporter=tap test/piraPhase1.test.cjs
$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\YoshihisaHagisaka\AppData\Local\ms-playwright'
node test/piraPhase1.browser.cjs
```

自動テストはin-memory PGliteへfixture DDLを適用するもので、実DBへのmigrationではない。PostgreSQL互換のSQL/FK/trigger/transactionを検証するが、advisory lockはquery検査＋単一接続queueで代用し、実サーバーの複数接続/プロセス競合は未検証。HTTPはloopback接続EACCESのためNode IncomingMessage/ServerResponse＋Expressをsocketなしで実行し、JSON stream parseはfixture bodyへ置換している。ブラウザはルート模擬APIのみ、実backend/SSO E2Eではない。

## 残課題

- 実ledger/ACL/Production来歴、採番、専用検証DB・backup/restore・bootstrap計画の具体化。
- 実PostgreSQLでの20並列/timeout/権限変更競合、実効ACL、DDL時間/実行計画。
- Google実ログイン/専用URI/秘密注入と外部入口ネットワーク境界。対象者のGoogle利用可否、必要なら別IdPの再利用評価。
- 実Slack/SMTP、worker運用/監視、dead再配送UI、通知outboxの長期ページング。Phase 1一覧は1000件で明示エラー、無断切詰めなし。
- 診断完了adapter、正式発注以降の契約/提供状態/数量変更/請求/配分、サービス側APIは後工程。
- 確認済み企業の代表ID/旧重複company対応表、全Sales入口の同定統一、共通contactリンク、所属移籍の期間管理は後工程。今回既存FK付替えなし。
- 初期企業画面は最初のcompany_admin所属の申込フォームを提供。複数企業を兼任する利用者向けのフォーム切替は後工程（APIはmembershipで個別検証）。

この実装は実環境へ適用可能との認定ではなく、コードレビューと専用検証DB適用前レビューの対象である。
