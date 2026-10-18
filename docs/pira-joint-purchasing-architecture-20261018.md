# PIRA共同購買管理：実装前アーキテクチャ案 v1
日付：2026-10-18 JST
状態：統括レビュー待ち／調査・設計のみ。実装・DB適用・Production変更の承認ではない。

## 1. 推奨と承認単位

**atlib-sales-tools/main内へ独立した共同購買業務モジュールを追加する。** 既存company.idを企業参照の基準に採用し、共同購買の所属・契約・請求は専用テーブルに保持する。InfraVision・Guard・SendのDB、認証、技術顧客は統合しない。外部向けには組合・企業の専用画面/API/認証スコープを設け、既存/adminや/api/adminを開放しない。初期はatLIB管理→組合承認→既存サービス側で手動提供・結果照合の順に段階実装する。

これは「企業同定をcompanyへ寄せる」という設計判断であり、全既存company行が重複のない法人台帳であるとの認定ではない。重複を解消するまで既存IDは保持し、共同購買で採用する代表companyをatLIBが確認する。既存診断・営業のFKは付け替えない。

| 比較 | Sales Toolsへ追加（推奨） | 独立管理アプリ |
| --- | --- | --- |
| 再利用 | company/contact、社内Google認証、見積、管理UI、Mailer、Slack transport、migration配布 | 同じ資産へのAPI整備・認証/ナビ/運用の追加が必要 |
| 企業ID | 同一DB内で既存company FKを利用 | company参照API・同期・障害時照合が先行 |
| 外部権限 | 専用membership/認可/外部ログインを新規追加。既存社内gateを使わない | 同じ外部認可が必要。独立配置だけでは解決しない |
| 影響 | 共通server/config/DBに差分。既存領域の回帰と直列releaseが必要 | デプロイ分離は容易だが、サービス数・運用・分散整合が増加 |
| 判断 | 最小差分。専用route/repository/workerとfeature flagで分離 | 外部公開のネットワーク境界を共有サービスで守れない場合の再評価案 |

現行Productionのrevision・アクセス制御は未確認。外部画面の公開に既存社内管理IP制限の解除が必要なら解除せず、同一repoの外部entrypointを別Cloud Runへ配置する案を追加審査する。独立CRM・顧客マスターの新設とは区別する。

## 2. 確認済み証拠と未確認

GitHub接続で指定repoのmain tree、以下のコード/設計文書、Corporate Issue #16・#27〜#41本文・コメント一覧、#41の調査コメントをfresh readした。ローカル C:/atlib のgit読取はPermission denied、gh APIは接続失敗。GitHub connectorへ切替え、権限回避は行っていない。

| 資産 | 固定SHA／状態 | 確認結果 |
| --- | --- | --- |
| Sales Tools main | d35581cec3dbc7d4ca2938f2a9c664906ccc5316 | Production Canonicalのrepo。mainが現在稼働中とまでは未確認 |
| InfraVision portal main | 54124300f2b246aab5e8d0c355a7c899b11aa19e | customers UUID/code、独自顧客認証、onboarding、運用機能あり |
| Send main | 9c1b00230f5efe6ddbae2b8c3ef5e7d0f87787b7 | Draftの商用機能とは区別 |
| Send Draft PR #5 | e87727a48dcf3ec99cb524a2dc356965e373d4de | 契約人数snapshot、共有容量、outbox等backend。未マージ |
| Send Draft PR #6 | 287c4a94c1b74b7a22a077927a4544a685cd3dd1 | PR5をbase。tenant/SSO/送信接続。未マージ、実DB等7項目SKIP |
| Corporate main | 1caa2eb1fec2d887a41130b0aa0fdf102493562b | Guard API調査文書と事業Issue |
| Sensor Edge main | 40548eafc0eaf01db02426c96312c7530739230b | Sheetsのatlse+6桁予約採番、GAS手動貼付、portal自動同期なし |

主要一次証拠（上記repo/SHAのpath）：
- Sales：docs/sales-tools-production-canonical-policy-20261003.md、docs/sales-tools-cross-service-dashboard-decision-20261013.md、docs/production-release-test-case-audit-acl-036.md。
- Sales：migrations/027_free_diagnosis_rule_based_v1.sql、src/services/freeDiagnosisSalesLauncherRepo.ts、src/services/staffAuthService.ts、src/middleware/staffAuth.ts、src/server.ts、src/db/migrate.ts、migrations/runner.ts、src/services/slackNotifier.ts。
- Portal：migrations/001_init.sql、src/services/customerRepo.ts、src/services/onboardingService.ts、src/middleware/auth.ts。
- Sensor：tools/device-management/README.md、運用手順書_機器管理システム.md。
- Send PR6：src/commercialUpload.ts、src/services/commercialUsageService.ts、docs/secure-send-stage2-runbook-20261018.md、PR本文・diff。PR5本文・diff。
- Corporate：docs/secure-guard-dnsfilter-msp-api-assessment-20261017.md、Issue36の後続PoC記録を優先。

### migration ledger確認の限界

Sales mainのSQLは001〜036（018/019は各2ファイル）。runnerは番号でなく**filename**単位のledgerとadvisory lockを使う。036文書はProductionの過去default ACLが現行018と異なることを明記し、append-onlyへのUPDATE/DELETE明示REVOKEを要求する。Portal repoには001〜010、Send mainには001〜004・006がある。Send draft DDLはrunner外・未採番・未適用。005欠番は詰めない。

**今回、実DBのschema_migrations・ACL・実顧客重複件数・Cloud Run revisionは読めていない。GitにあるSQLと実適用を同一視しない。** 過去の「Sales ledger38件・最新036」は引継ぎ情報であり今回のfresh実測ではない。037以降を予約せず、他レーンの匿名KPI等との採番調整を実装直前に行う。実ledger照合は実装開始ゲートであり、この設計を「実環境まで確定済み」として承認しない。

## 3. 既決定事項の優先関係

最新ユーザー指示とIssue28訂正・33追記・34〜41を優先する。Issue16の旧「Guard50%」「初回決済後provisioning」やIssue27/37の旧未決文言を今回へ混入しない。
- 対象：Guard/Send/InfraVision。業務KAIZENは実装対象外。
- 正式申込は組合、組合がatLIBへ正式発注・一括支払。無料相談だけで契約顧客/提供開始にしない。
- Guard/Send基本料金40%、InfraVision月額40%を関係者配分原資。InfraVision初期費用100%atLIB。組合上乗せ額と別建て、卸請求から控除しない。
- 減少/解約：日本時間20日中のatLIB正式受付→当月末反映、21日以降→翌月末。休日補正なし。翌月初に対象月を請求。月途中返金なしを基準。
- Guard課金数量はDNSFilter回答待ち。未確定を0や現在台数で補完して本番請求しない。
- Slack C0C9YB6F49H：診断完了・サービス申込・正式発注。専用Webhookの接続は別工程。

## 4. 画面と業務フロー

1. 実態調査/診断→結果。診断のみ終了可。調査情報は営業・契約から目的分離。
2. 希望企業だけatLIB無料相談→必要な提案/見積。直接申込導線も用意。
3. 組合選択→企業の正式申込（新規/追加/減少/解約）。法人同定未確定は候補として保留。
4. 組合担当者が自組合の申込・数量・確定条件を確認し承認/差戻し。
5. 共通confirmOrderが正式発注番号・時刻・条件版を確定。初期MANUALのみ。
6. atLIB受注確認→契約予定/変更予定→サービス側提供依頼。既存顧客照合と新規登録を区別。
7. 実施結果確認後に利用開始/変更完了表示。契約状態・技術状態・請求状態は別々。
8. 月末に契約履歴・実利用・課金根拠を照合→企業明細→組合請求snapshot→外部請求反映/結果照合。
9. 別精算で配分原資・関係者内訳・支払実績を記録。振込は人手。

| 利用者 | 最小画面 | 操作 |
| --- | --- | --- |
| 未ログイン企業 | 組合検索、診断、相談、申込入口 | 公開可能項目のみ。組合ID指定を所属権限と扱わない |
| 企業担当者 | 自社申込/状況、契約、変更依頼、利用サービスリンク | 自社に限定。外部認証/招待が整うまで履歴画面は非公開 |
| 組合担当者 | ダッシュボード、申込一覧/詳細、発注確認、企業契約一覧、数量照合 | 自組合のみ。差戻し・正式発注 |
| 組合請求担当 | 月次卸請求・企業別明細・支払状況、上乗せ価格設定 | 自組合のみ。卸金額の変更不可 |
| atLIB運用 | 組合受注キュー、企業照合、サービス対応、保留/失敗/再試行 | 実施証拠を確認して完了 |
| atLIB経理 | 料金条件版、請求照合/締め/訂正、配分/精算 | 締めsnapshotは編集せず訂正記録 |
| atLIB管理者 | 所属/権限、企業対応、設定、監査、将来の発注ルール | 権限変更・ID付替えは理由必須 |

InfraVision利用画面は既存/login.htmlへ案内する。パスワード/JWT共有や自動ログインURLは作らない。Guard/Sendも既存/開発中のサービス画面へ接続し、共同購買側へ技術管理機能を複製しない。

## 5. company再利用・重複防止・責任

027のcompanyはid UUID、name、corporate_number、created_by/owner等。法人番号UNIQUEなし、組合IDなし。contactはcompany FK。現行createSalesActivityは毎回randomUUIDでINSERTし、会社/担当/活動の処理全体も一つのtransactionではない。owner_user_idがあるだけで外部テナント認可は実装済みと扱えない。既存一覧はcompany/contact/診断情報をJOINし、組合スコープはない。

**共同購買では既存sales-activities作成APIを企業upsertに転用しない。**
- company.idを共通企業参照IDに採用。共同購買専用の企業名マスターは重複新設しない。
- 申込受信時は申告snapshotを保存し、確定までcompany FKを未設定にできる。診断だけでcompanyへ登録しない。
- atLIBの企業照合操作で既存候補を選ぶ。会社名・メール・ドメインは候補検索用、同一企業の確定キーではない。
- 法人番号は13桁正規化・検証、確認済み番号のidentity対応を別台帳で一意管理。法人番号なしは確認済み外部ID/証拠による手動確定。
- 新規確定は企業照合キーの排他＋一意制約＋transactionでcompany/contact/所属/監査を作る。同時申込・再送で同じ企業を二重作成しない。
- 既存重複companyは代表IDへの対応表で参照解決。旧FKを変更せず、自動merge/削除しない。不一致は保留。
- この保証は共同購買の企業確定処理に限る。既存営業登録は重複を作り得るので候補検知/照合を継続し、全Sales入口の統合修正は別スコープ。
- company.name/確認済み法人番号の変更責任はatLIB企業管理担当。組合/企業は修正依頼し、共有companyを直接PATCHしない。owner_user_idを外部認可に流用しない。
- contactは再利用可能だが外部には契約連絡先として明示指定された最小項目だけを投影。診断案件の担当者や全contactを自動公開しない。
- 組合所属は期間付き別表。同一企業の複数組合所属を禁止せず、申込・発注・契約ごとに請求組合を固定。移籍で過去請求や他組合契約を移動しない。
- InfraVision UUID/code・ログイン情報・ZabbixはInfraVision責任。SensorコードはSheets予約運用を維持。企業名の双方向自動上書きはしない。

## 6. 論理データモデル（DDL未作成）

既存company/contactを参照する以外は共同購買namespaceの論理名。物理表名・採番は実装時に固定する。

| 実体 | 主な属性・関連・制約 |
| --- | --- |
| association（組合） | UUID、表示名、channel、状態。PIRA表示は設定 |
| company_identity / company_resolution | 確認済み法人番号等→company、照合証拠/担当/時刻、旧company→代表company。確定キー一意、循環禁止 |
| association_company | association+company、所属開始/終了、確認状態。履歴保持 |
| principal / scope_membership | issuer+subject一意、組合/企業scope、role、有効期間/停止。サービスのuserとは別 |
| application / application_line | 組合、申告snapshot、確定company、申込種別、サービス、数量、見積版、条件同意、提出版/時刻、状態。申込再送キー一意 |
| approval_policy / approval_decision | 組合+サービス、MANUAL/AUTO、版、有効期間、承認主体/時刻/条件hash。初期AUTO無効、InfraVision手動 |
| order / order_line | 発注番号一意、申込版、組合/company、承認結果、条件/金額snapshot、atLIB正式受付時刻。申込版の発注一意 |
| contract / contract_revision | company、組合、サービス、発注行、料金/数量/条件版、開始/終了、変更有効時刻。変更は追記、過去版保持 |
| service_customer_link | company、service、environment、外部UUID/Organization ID、code参照、照合証拠、状態/版。service+env+外部IDの企業二重割当禁止 |
| contract_service_link | contract→service_customer_link。顧客と契約を分離し複数契約を許す |
| fulfillment_operation / result | order/contract、操作種別、冪等キー、予定日、試行、外部結果/観測版、保留理由。timeoutは未確定扱い |
| usage_observation | サービス/外部ID、期間、metric、数量/単位、source、observed_at、完全性。契約数と分離 |
| billing_basis | contract版、対象期間、課金数量、根拠版、確定状態/証拠。未確定はNULL/保留 |
| price_version / reseller_price | 卸基本/従量/初期/パック条件と組合販売価格を分離、期間/通貨/税区分/版 |
| invoice_batch / invoice_line | 組合+対象月+版、企業/契約/料金内訳、計算根拠/丸め/税、外部請求ID、状態/hash。締め後不変 |
| invoice_adjustment / payment_reconciliation | 元明細への増減訂正、外部反映/入金照合、証拠。請求と入金を分離 |
| share_rule / accrual / settlement | サービス/期間/版、配分対象成分、40%原資、関係者内訳、支払条件/実績。卸請求から控除しない |
| audit_event / outbox / inbox | actor/scope/対象/変更前後/理由/時刻/trace、event一意、再試行/lease/配送結果。監査は追記専用 |

診断回答・無料相談は契約台帳と別domain/目的。診断システムのID/完了イベント、相談/見積の参照を保持する。既存IT経営診断の質問・採点・case lifecycleをPIRAへ流用しない。診断実装の正本は今回の指定資産だけでは確定できず、接続開始前にsource owner/完了条件を指定する。

## 7. 権限仕様

「自組合所属企業」だけを理由に、その企業が別組合で持つ契約を表示しない。全件API→ブラウザ絞込みは禁止。URL/bodyのcompanyId/associationIdは認可根拠にしない。

| データ/操作 | 企業 | 組合承認担当 | 組合請求担当 | atLIB運用 | atLIB経理/管理 |
| --- | --- | --- | --- | --- | --- |
| 申込提出/訂正 | 自社の未発注版 | 自組合確認/差戻し | 必要最小参照 | 照合/対応 | 管理者監査 |
| 正式発注 | 不可 | 自組合・委任範囲のみ | 不可 | 受注確認のみ | 権限設定/監査 |
| 契約/数量 | 自社の許可契約 | 自組合契約のみ | 同左 | 運用範囲 | 経理範囲 |
| 卸請求/入金 | 原則非表示（企業販売明細は別） | 自組合参照 | 自組合参照/回収記録 | 原則不可 | 計算/締め/照合 |
| 組合上乗せ価格 | 公開済み自社条件 | 自組合の権限者 | 自組合設定 | 原則不可 | 必要最小参照 |
| 関係者配分/仕入原価 | 不可 | 不可 | 不可 | 不可 | 専用権限 |
| 外部ID紐付け/提供処理 | 不可 | 不可 | 不可 | 専用権限 | 管理者承認/監査 |
| 個別診断回答 | 本人同意範囲 | 原則不可 | 不可 | 診断担当の専用目的権限 | 管理者でも目的制限 |
| 監査/出力 | 自社の許可範囲 | 自組合業務範囲 | 自組合請求範囲 | 担当範囲 | 全体専用権限 |

Sales現行staff_sessionはemailのみ・社内同権限。既存ログインをatLIB本人確認として再利用し、共同購買専用roleを追加照合する。外部は招待・確認済みissuer/subjectとmembershipを持つ専用入口。Send PR6のOIDC/所属認可パターンは候補だが、未マージコードを稼働中共通認証と扱わない。組合をatlib.jp許可や既存staffに追加しない。

外部のIdP/メール認証方式は未選定。Google/Microsoftだけで対象者を網羅できるか確認し、本人確認・招待・失効を含めて固定するまで外部公開不可。毎requestで現在所属/停止を確認、CSRF・Origin・安全cookie・rate limit、API/HTML/exportの同一scope、変更時の権限再確認を必須とする。サービス間は専用機械主体・audience・最小scope・鍵ローテーションを用い、社内cookieを転送しない。

## 8. 発注確定・サービスAPI境界

confirmOrder(applicationId, submittedVersion, approvalDecision, idempotencyKey)は新規仕様。手動/将来自動から同じ処理を呼ぶ。
- transaction内で申込版をlockし、現在の所属/委任/権限・サービス・料金/見積版・同意を検証。古い画面は409、越境は拒否。
- 同一key同一payloadは元結果、異なるpayloadは409。同一申込版への別keyでも二重発注不可。
- 発注行、承認モード/主体/ルール版、サーバー正式受付時刻、audit、outboxを一括commit。
- response喪失後は同keyで照会/再送。外部サービスの作成/メール送信はtransaction内で行わない。
- AUTOは将来の明示Go時のみ。条件外/未確定/見積変更は手動へ。ルール変更は将来の未確定申込だけに適用。

共通の連携envelope案：eventId、operationId、service/environment、companyId、contractId/revision、orderId、externalCustomerId、effectiveAt、schemaVersion、payloadHash。送受信側でscope/対応付けを照合し、重複は同結果、古い版/同版内容違いは拒否。結果はaccepted/applied/failed/unknownとobservedAt/sourceRevision。acceptedを利用中にしない。APIパスは未実装のため以下では既存と提案を分ける。

| サービス | 既存の再利用 | 新規境界・初期運用 | 接続前のGate |
| --- | --- | --- | --- |
| InfraVision | customers UUID/customer_code、CustomerRepo、既存onboardCustomer/画面、Sheets採番、既存ログイン | atLIB照合→既存ならlinkのみ。新規のみコード予約→既存onboarding→UUID確認。必要時に制限付きlookup/link/result APIを追加 | 全顧客一覧を組合公開しない。code UNIQUEでもZabbix作成後DB失敗を防げない。timeout時再実行前に外部照合 |
| Guard | DNSFilter既存PoC・MSP API調査・GET usage | company↔Organization/Network ID。初期は運用担当が既存手順で提供し結果記録。後日workerでvendor操作 | Organization作成SKU/外部ID/冪等/上限等未確定。Allocated/InUse/user_countを月次確定数量に使わない |
| Send | PR5/6 tenant・OIDC・CommercialUsageService.applyAllowance、容量/利用/SMTP | 正式契約snapshot→認証済みadapter→applyAllowance。契約人数/plan/期間/発注版を供給。GET利用の集計adapter | applyAllowanceは内部メソッドでありサービス間HTTP API未実装。機械認証/招待管理/worker/実環境回帰が必要 |

Send供給snapshotはorganizationId、periodId、startsAt/endsAt、contractedSenders、baseQuotaBytes、sourceOrderId/sourceRevision、effectiveAt、sendingEnabled、plan id/version/設定。料金・配分はSendへ持ち込まない。現行コードは当期の人数/容量減少を拒否し、新periodで反映する。月境界はJST暦月をUTC instantへ変換して供給し、fixtureのUTC月境界を本番仕様にしない。5GB/80%/7日等はfixture/設定であり今回確定しない。

InfraVisionはcustomer.status更新だけで既発行JWTの即時停止を保証できない（#41コメントとauth/CustomerRepoの経路差）。契約終了→停止依頼→実施/アクセス失効確認を分離し、解決まで自動停止完了を表示しない。Sendは送信停止と既存受信/保持削除を分離。Guardはagent削除やSite削除を課金停止の代用にしない。

## 9. 料金・請求・配分

契約数量、実利用数量、vendor確定数量、顧客請求数量を別項目にする。Guardのbilling_basisが未確定なら該当企業/組合請求をBLOCKEDにし、0円確定・推定請求・請求書発行を禁止。ドラフト計算と本番請求を区別する。

卸請求＝企業別基本＋従量＋初期等の確定明細合算（パック条件は版付き）。組合販売額は別。配分原資＝Guard/Sendの対象基本料金×40%、InfraVision対象月額×40%。InfraVision初期・Guard/Send従量は配分対象外。関係者ごとの比率合計が原資を超えない制約、未合意内訳は精算保留。

締切時刻はブラウザ送信/組合社内受付ではなくconfirmOrderのatLIB正式受付時刻。20日23:59:59…と21日00:00はJST日付で比較。月末終了を翌月1日00:00 JSTの排他的境界として保持。提供失敗で契約予定を消さず、技術不一致と請求判断を別々に要対応とする。

Issue35の日割り税別1円未満floorを採用。起算日を含む案は維持するが、起算点・丸め粒度・基本レンジ差額・パック・税の端数・InfraVision個別条件は未決定。これらの価格版を承認するまで該当請求は締め不可。invoice_batchを組合/月/改訂版で一意管理し、確定後は訂正明細と外部照合で修正する。外部請求書発行/振込を再開発せず、初期は人手で反映し外部ID・金額・対象月を照合する。共同購買でサブスクペイを使う範囲は外部仕様/運用確認後に決める。

## 10. Fit/Gap・migration・監査・通知

| 領域 | Fit | Gap / 影響 |
| --- | --- | --- |
| 企業/担当 | company/contact | 同定/代表ID/所属/更新権限、既存重複実測 |
| 見積/社内管理 | 見積API・UI・社内Google認証 | 見積確定版と申込引継ぎ、共同購買専用role。sales_activityの2サービス制約は変更せず別参照 |
| 組合/契約/発注/請求 | 関連業務/UIパターン | 業務モデル・権限・確定処理は新規 |
| InfraVision | 既存提供・ポータル・採番 | 共同購買ID対応、lookup、冪等/途中失敗照合。全機能の複製不要 |
| Guard | vendor API・PoC | 受注連動adapter/状態照合、課金確定数量待ち |
| Send | 未マージPR5/6を後続接続で再利用 | 実環境検証・正式snapshot認証API・運用CRUDが未完 |
| 通知 | Mailer/Slack transport | 永続outbox、再送/lease、配送結果取得、event重複排除 |
| 監査 | 既存append-only/ACLリリース知見 | 共同購買横断audit。domain固有既存監査をそのまま流用しない |
| migration | filename ledger/lock/allowlist artifact | 新規加算のみ。実ledger/ACL照合・採番調整・隔離リハーサル必須 |

Sales sendSlackNotificationは失敗をcatchし戻り値void。**そのままではoutbox workerが配送成功を判定できない。** transport/安全ログ/timeoutを再利用し、明示的resultを返す配送adapterを新規追加する。既存通知呼出しのbest-effort挙動は回帰で維持する。業務transactionへoutbox保存し、未設定は未配送/設定待ちとして保持、業務は完了可能。at-least-once配送ではSlack受理後timeoutによる重複を完全排除できないためeventIdを本文/監査に含める。

専用Webhook URLをSecret Manager等へ設定する工程は別。Incoming Webhookの投稿先固定を確認し、channel IDだけで既存Webhookを他channelへ向けない。本文は必要最小の企業/組合/サービス/番号/認証付き管理URL。個別回答・脆弱性・秘密値は出さない。今回Slack/メール実送信なし。

migrationは専用追加表/FK/index/ACLのみを候補とし、既存SQLを書き換えない。runtimeは必要表SELECT/INSERT/UPDATEのみ、audit/確定snapshotはUPDATE/DELETE明示REVOKE＋trigger。既存companyの権限を外部へ付与せずAPIを経由する。保持削除は契約/監査/請求の法定・同意条件を確認後に期間設定。CSV出力はscope検証・出力監査・式注入対策を必要とし、Sendの送信監査exportそのものはSend側責任とする。

## 11. 段階実装と受入テスト

| 段階 | 実装内容 | 完了条件 |
| --- | --- | --- |
| 0 設計承認/環境事実 | 本案、実ledger/ACL/Production来歴、企業重複の集計、外部認証選定、価格未決分類 | source/ledger差分説明、採番調整。Guard未決は請求禁止で隔離 |
| 1 atLIB内部台帳 | 企業照合、組合所属、契約/外部ID参照、社内role/監査 | 既存company維持、誤紐付け防止、既存管理回帰 |
| 2 申込・組合手動発注 | 外部招待/所属、専用画面、confirmOrder、outbox | 越境/CSRF/二重発注/差戻し/古い版テストPASS |
| 3 提供接続 | 初期手動依頼/確認、必要最小adapter、変更予定/失敗対応 | 各サービスの実結果照合。Send未マージ依存のGoを別管理 |
| 4 請求・配分 | 版付き価格、企業明細、組合締め、外部反映/訂正/精算 | 確定根拠のみ請求、二重締め防止、総額一致 |
| 5 自動化 | 検証済みサービス操作/利用取得、条件付きAUTO | 事前委任条件/版/上限、条件外手動、同一confirmOrder |

必須テスト（実装時に行う。本調査では未実行）：
1. 組合A/B・企業X/YのID改ざん、一覧/詳細/ダウンロード/export、複数組合所属、停止した担当者の旧session。全経路で越境拒否。
2. 同一法人の同時申込、法人番号なし/候補複数、既存重複company、InfraVision停止顧客、同じ外部UUIDの別企業割当拒否。既存顧客でonboardingを呼ばない。
3. 承認20並列、再送、commit後response喪失、同key異内容、別key同申込版、権限失効/料金版変更。発注1件、監査/outbox整合。
4. JST20日最終瞬間/21日開始、休日、2月/閏年、月末、予定変更競合。減少/解約と増加を分離し過去契約不変。
5. サービスaccepted後timeout・実施後callback欠落・古い版・二重結果・別環境ID。unknownを完了にしない。再試行前照合。
6. Sendの正式snapshot再送/版違い、月境界/減少、org越境、送信停止でも許可済み受信維持、実DB排他/SSO/GCS/SMTP/ClamAV。PR6のSKIPをPASS扱いしない。
7. Guardの未確定数量でinvoice確定拒否。Allocated/InUseが変動しても勝手に課金しない。vendor回答の根拠版固定。
8. 基本/従量/初期/パック/日割り/税/配分、組合上乗せ分離、企業明細合計=組合卸請求、二重締め/訂正/外部反映失敗。InfraVision初期配分0。
9. Slack未設定/429/timeout/5xx、lease競合、業務成功と通知失敗の分離、秘密・回答非出力。監査失敗時は発注もrollback。
10. migration空DBとProduction既存ledger相当の隔離fixture、default ACL再現、2回目skip、失敗rollback、runtime権限実効確認。実Productionへ試験しない。
11. 既存診断/代理店lead/見積/Googleログイン/管理gate/通知を回帰。業務KAIZENdomainの変更ゼロを確認。

## 12. 再現可能なread-only Runbook

今回実行したGitHub connector読取と同じ調査を、認証済みghのあるユーザー端末で再現する例。コード/DB/Cloud変更を含まない。公開応答や出力にも秘密/個別顧客情報を混ぜない。

~~~powershell
$owner = 'yoshihisahagisaka'
$repos = @('atlib-sales-tools','atlib-msp-customer-portal','atlib-ppap-file-transfer','atlib-corporate-site','atlib-sensor-edge')
foreach ($repo in $repos) {
  gh api "repos/$owner/$repo/commits/main" --jq '{sha:.sha,date:.commit.committer.date}'
  gh api "repos/$owner/$repo/git/trees/main?recursive=1" --jq '.tree[] | select(.type=="blob") | .path'
}
foreach ($n in @(16) + (27..41)) {
  gh issue view $n --repo "$owner/atlib-corporate-site" --json number,title,body,updatedAt
}
gh issue view 41 --repo "$owner/atlib-corporate-site" --comments
gh pr view 5 --repo "$owner/atlib-ppap-file-transfer" --json number,state,isDraft,baseRefName,headRefName,headRefOid,body
gh pr view 6 --repo "$owner/atlib-ppap-file-transfer" --json number,state,isDraft,baseRefName,headRefName,headRefOid,body
gh pr diff 5 --repo "$owner/atlib-ppap-file-transfer" --name-only
gh pr diff 6 --repo "$owner/atlib-ppap-file-transfer" --name-only
~~~

証拠ファイルの固定SHA読取例（gh apiのbase64デコード、ローカル保存なし）：

~~~powershell
$specResponse = gh api 'repos/yoshihisahagisaka/atlib-sales-tools/contents/src/services/freeDiagnosisSalesLauncherRepo.ts?ref=d35581cec3dbc7d4ca2938f2a9c664906ccc5316' | ConvertFrom-Json
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($specResponse.content))
~~~

実装前に運用担当が承認済みread-only接続で行う照合。今回は未実行。接続先・roleを勝手に作らず、既存の最小権限を用いる。接続URL・環境変数の全量出力はしない。

~~~sql
BEGIN READ ONLY;
SELECT current_database(), current_user;
SELECT filename, applied_at FROM schema_migrations ORDER BY filename;
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('company','contact','customers','schema_migrations')
ORDER BY table_name,ordinal_position;
SELECT table_name,grantee,privilege_type
FROM information_schema.table_privileges
WHERE table_schema='public'
  AND table_name IN ('company','contact','customers','it_management_diagnosis_test_case_designation_audit')
ORDER BY table_name,grantee,privilege_type;
ROLLBACK;
~~~

Sales専用の重複件数確認（個別番号/名称を出力しない。法人同定の確定処理ではない）：

~~~sql
BEGIN READ ONLY;
SELECT count(*) AS duplicate_number_groups FROM (
 SELECT regexp_replace(corporate_number,'[^0-9]','','g') AS k
 FROM company WHERE corporate_number IS NOT NULL
 GROUP BY k HAVING length(regexp_replace(corporate_number,'[^0-9]','','g'))=13 AND count(*)>1
) d;
ROLLBACK;
~~~

Production来歴の限定読取例（env/secretは出力しない）：

~~~powershell
gcloud run services describe sales-tools --project=msp-zabbix --region=asia-northeast1 --format='value(status.latestReadyRevisionName,status.traffic)'
gcloud run services describe msp-customer-portal --project=msp-zabbix --region=asia-northeast1 --format='value(status.latestReadyRevisionName,status.traffic)'
~~~

revision/image digestとGit SHAの対応は既存release証跡と照合する。latestReady=trafficとは限らない。Sheetsはコード/顧客名最小項目と貼付GAS版だけ運用担当が確認し、認証情報列を取得しない。失敗時は理由と未確認項目を残し、credentialsコピーや権限拡大で回避しない。

再開時：本PRと固定SHA→fresh main/PR差分→実ledger/ACL/重複件数→未決条件の確認→最小実装PR→隔離環境検証→別途release判断。今回はmigration・gcloud変更系・deploy・Slack投稿のコマンドを実行しない。

## 13. 承認事項と保留事項

統括へ求める設計判断：
1. Sales Tools専用モジュール配置、外部専用入口、company.id参照＋確認済みidentity/代表ID対応。
2. 初期MANUAL発注→手動提供確認、同一confirmOrderとサービス独立境界。
3. 上記論理モデル・scope/RBAC・請求snapshot・配分分離・outbox。
4. 段階実装順序と受入ゲート。

実装/公開/請求を止める未決・未確認：
- 実ledger/ACL/Production来歴、company重複実態、既存契約/請求原本と担当。
- 外部認証方式、所属確認/委任、企業表示範囲、契約当事者/同意/未回収責任。
- Guard請求数量のDNSFilter回答（重複問い合わせしない）。
- 料金表/パック版・起算点/丸め粒度/税/InfraVision対象月額の定義、関係者内訳・支払時期。
- Send PR5/6の承認/merge・実環境試験、正式snapshot API/機械認証、終了後受信/保持。
- InfraVision停止時の既発行session失効、既存外部IDの法人/拠点粒度、途中失敗照合。
- 診断実装のsource/完了イベント、Slack専用Webhook、外部請求サービスとの運用照合。

**今回の変更はこの設計文書とDraft PR記録のみ。アプリコード、SQL、DB、Production、main、既存Issue内容は変更しない。設計レビューは可能だが、実環境の確認完了・実装Goとは区別する。**
