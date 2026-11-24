# 業務KAIZEN Package E2a 匿名KPI Fit/Gap

調査日: 2026-11-24 JST

## 結論

実装は可能。ただし、現在のコードには、Bot検証済みの `diagnosis_start` / `diagnosis_complete` を正式KPIとして保存・集計できる既存の匿名集計先はない。既存のLead、Business Diagnosis、E1 KPI、GA4のいずれにも混ぜない。

最小案は、Corporateの既存セルフチェックへ2か所だけ非同期送信フックを追加し、Sales ToolsへTurnstile検証付き公開APIと、個別イベントを残さない日次集計テーブルを1つ追加する構成である。イベントには個人情報、回答、Diagnosis ID、Lead ID、個別追跡IDを含めない。結果表示は計測の成否を待たない。

この調査ではコード、環境設定、Turnstile、DB、Migration、Productionを変更していない。

## 照合した正本と公開Evidence

- Sales Tools: PR #96 HEAD `f9674fd7650a7648ad86a275812cc3020d761310`。2026-11-24確認時点でGitHub上も同じHEAD、OPEN。baseは `feat/business-kaizen-package-d2-20261123`。
- Sales Tools main: ローカル追跡SHA `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`。本調査の実装基準は指定どおりPR #96 HEADとした。
- Corporate: PR #74 HEAD `a7c14308a01da253d4842266ed3d9f94ac0bcb29`。2026-11-24確認時点でGitHub上も同じHEAD、OPEN。
- 公開セルフチェックは `https://service.atlib.jp/business-web/self-check/` と `https://www.atlib.jp/business-web/self-check/` の双方でHTTP 200を確認した。HTMLとJSはPR #74のblobとbyte-for-byte一致した。
  - `index.html`: 782 bytes、SHA-256 `4b717a9cc201ca756b1161ddbf6319b6a7c9bbd20a07b9c22b44d20c34162ae6`
  - `self-check.js`: 38,873 bytes、SHA-256 `fb363ad6edc61e12e3370882e1aa80a282fc189c018248a4eaf561156721735b`
- 公開配信はGoogle Frontend経由。2026-11-24のread-only確認では、Corporate Cloud Runの100% trafficはrevision `corporate-site-bwf-20261122122157`、image digest末尾は `sha256:5539197badd65e7315b03dd5183d18b7ddcd24294113bbb5052a3cf437c7aea7` だった。`latestReadyRevisionName`とは別なので、公開Revisionはtraffic割当で判定した。
- Production Migration Ledgerの実値は、この作業権限から独立確認できなかった。リポジトリの最新read-only verifierはMigration 027〜036が各1回、037以降なしを要求するが、これは期待契約であってProduction実値の証明ではない。実装開始前のRelease Gateとする。

## 1. 正確な計測位置

対象はCorporate PR #74の `public/business-web/self-check/self-check.js`。

### `diagnosis_start`

Q01は単一選択で、回答の正本更新は `select(q, v)` 内の `state.answers[q.id] = v`。したがって次の条件を満たした直後を開始とする。

- `q.id === 'Q01'`
- 値がQ01の定義済みoption codeに一致
- 現在の画面試行でまだ送信を開始していない

「セルフチェックをはじめる」ボタンでは数えない。画面を開いた件数でもない。計測用のin-memory booleanは再描画による重複を避けるためだけに使い、サーバーへIDとして送らない。再スタート操作は新しい画面試行として扱える。

### `diagnosis_complete`

最後の「結果を見る」は `state.screen = 'result'` の後に `render()` を呼び、`result()` が `diagnose(state.answers)` を実行して結果HTMLを描画する。完了は次の順序にする。

1. `diagnose()`が正常終了
2. 結果DOMの描画が正常終了
3. 必須の結果要素がDOM上に存在
4. その後に計測を非同期開始

ボタンクリックだけでは数えない。計測通信、Turnstile、Sales Tools障害のいずれが起きても結果表示は維持する。自動再送はしないため、通信喪失時は過少計上を許容する。

## 2. 現在の公開ホスト・Origin

現在確認できたOriginは次の2つ。

- `https://service.atlib.jp`
- `https://www.atlib.jp`

両方で同一セルフチェックが公開されている。正式集計対象をserviceのみとするか、移行期間中は両方とするかをRelease前に確定する必要がある。サーバーはリクエストの `Origin` とTurnstile検証結果の `hostname` を照合し、クライアント申告のenvironmentやhostnameを信用しない。

## 3. Turnstile Fit/Gap

Corporateの問い合わせフォームには再利用可能な実装パターンがある。

- client widgetとserver-side Siteverify
- `success`、`action === 'contact'`、許可hostnameの検証
- `SITE_CONTACT_TURNSTILE_SITE_KEY` / `SITE_CONTACT_TURNSTILE_SECRET`
- `SITE_CONTACT_ALLOWED_ORIGINS` / `SITE_CONTACT_TURNSTILE_HOSTNAMES`
- 15分5回のIP rate limit、honeypot、JSON body limit

ただし問い合わせ実装はそのまま流用できない。actionが `contact` 固定で、問い合わせ必須項目・同意・メール送信に結びついており、セルフチェックにはwidgetがないためである。

最小実装では、検証関数の仕組みだけを共通化し、匿名KPI専用のsitekey/secret、action、hostname allowlistを用意する。開始と完了は別イベントなので、各イベントで新しいtokenを発行・検証する。Cloudflareのtokenは5分で失効し原則1回限りであるため、同じtokenを2イベントへ流用しない。

公式資料:

- [Cloudflare Turnstile Get started](https://developers.cloudflare.com/turnstile/get-started/)
- [Server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/)

## 4. Sales Toolsの既存防御と集計先

既存Public相談API `POST /api/business-web-consultation-leads` は次を持つ。

- 1時間5回のIP rate limit
- honeypot `hp`
- Zod入力検証、同意検証、idempotency
- Lead、Diagnosis、初期Stageのtransaction保存
- 初回だけCOMMIT後通知

一方、現行rate limiterはプロセス内 `Map` であり、Cloud Runの複数instance間では共有されない。相談APIにはTurnstileもない。またCORSはPR #96 lineageでは `https://www.atlib.jp` 固定で、現在のservice hostを含まない。いずれも匿名KPIの正式なBot証明としては不十分である。

既存のBusiness Diagnosis、Stage History、Commercial Events、E1 KPIは相談成立後の業務正本であり、匿名開始・完了を入れる場所ではない。`marketing_initiative` は施策マスタでイベント保存先ではない。Corporate内にはGA4利用箇所があるが、セルフチェック自身にはGA tagがなく、GAのclient識別子とBot検証契約は今回の固定方針に適合しない。正式KPIの既存集計先は「なし」と判定する。

## 5. 最小実装案（1案）

### 流れ

1. CorporateでQ01有効回答後、専用Turnstileをexecuteする。
2. token取得成功時だけSales Tools公開APIへ `diagnosis_start` を送る。UIは待たない。
3. 結果DOM表示成功後、新しいTurnstile tokenを取得して `diagnosis_complete` を送る。UIは待たない。
4. Sales ToolsはOrigin、JSON schema、event type、Turnstileのsuccess/action/hostnameを検証する。
5. 検証成功したイベントだけ、JST日付・event type・environment・Origin・正規化UTMの集計bucketをatomic upsertで `count + 1` する。

API payloadは次だけに限定する。

```json
{
  "eventType": "diagnosis_start | diagnosis_complete",
  "turnstileToken": "...",
  "utmSource": null,
  "utmMedium": null,
  "utmCampaign": null,
  "utmContent": null,
  "utmTerm": null
}
```

時刻、JST日付、environment、Originはサーバーで確定する。回答、氏名、連絡先、Diagnosis/Lead ID、cookie ID、session ID、fingerprint、idempotency keyは送らない。開始と完了は個別結合できず、conversionは同一期間の集計比率であってユーザー単位funnelではない。

### 永続化

将来の実装時には新規Migrationが必要。個別イベント行ではなく、次を一意keyとする日次集計テーブル1つで足りる。

- `event_date_jst`
- `event_type`
- `environment` (`PRODUCTION` / `TEST`)
- `origin`
- 5つの正規化UTM（nullable）
- `event_count`
- `created_at` / `updated_at`

年度2月1日起点は保存時に年度列を重複保持せず、JST日付からread queryで算出する。例えば2026-02-01〜2027-01-31をFY2026とする。UTMは既存Leadと結合せず、集計dimensionとしてのみ使う。値の最大長、文字種、空文字のNULL化をAPI schemaで固定する。

UTMを無制限に日次bucketの一意keyへ入れると、攻撃または誤設定で高cardinalityになる。正式施策のallowlistは既存 `marketing_initiative` の有効UTM組合せをread-only参照するか、承認済みの小さな設定として管理する。allowlist外の値をそのまま新規dimensionにせず `UNATTRIBUTED` / `OTHER` の固定bucketへ集約し、raw UTMは保存しない。どちらを正本にするかと、未知値を正式KPIへ含めるかは実装前に決定する。DB側にも日付・event・environment・origin・正規化済み施策keyの一意制約を置き、APIの文字長制限だけに依存しない。

この方式は個別重複除去ができない。画面内の一度限りguardと「自動再送しない」で重複を抑え、指標名はunique usersではなく開始イベント数・完了イベント数とする。

## 6. 必要な変更（将来実装時）

### Corporate

- `public/business-web/self-check/index.html`: Turnstile script/sitekey設定の読込
- `public/business-web/self-check/self-check.js`: 上記2つの非同期hook、画面試行内の重複guard、UTM読取
- Corporate設定/CSP: `challenges.cloudflare.com` とSales Tools endpointを必要最小限許可
- Browser test: Q01、結果描画、失敗時もUI継続、重複送信なし

### Sales Tools

- `src/config.ts`: 匿名KPI専用Turnstile、Origin/hostname、environment設定
- 新規public route/service/repository: schema検証、Turnstile、atomic aggregate upsert
- `src/server.ts`: route登録と既存pool受渡し
- 新規migration: 日次集計テーブルとruntime最小権限
- API/PGlite/PostgreSQL 16 test: Bot拒否、Origin、並行increment、JST/FY、UTM、TEST分離
- E1とは別の匿名KPI read service/API、またはE1応答内でも明確に別sectionとして返す。Diagnosis cohortと混ぜない。

### 環境設定

- production/testで別Turnstile widget（sitekey/secret）
- production/testのOrigin・hostname allowlist
- Corporate側のSales Tools endpoint
- Sales Tools側のenvironmentはdeployment configから確定

## 7. Bot対策とテスト分離

- 正式集計条件はserver-side Siteverify成功、期待action一致、期待hostname一致、production Origin一致の全て。
- Turnstile未成立、timeout、重複token、不正OriginはHTTP拒否し、正式bucketを更新しない。
- rate limitは防御層として残すが、instance-local limiterだけを正式KPI判定に使わない。
- honeypotはフォームではないため主対策にしない。
- productionとtestはwidget、secret、許可Originを分離する。クライアントの `environment=PRODUCTION` は受け付けない。
- Cloudflare test keyはTEST bucketのみ。production既定の集計APIはTESTを除外する。
- IPは集計テーブルへ保存しない。Cloud Run等の基盤アクセスログに含まれる可能性は、既存ログ保持ポリシーの確認対象とする。

## 8. 追加費用と運用負担

- Turnstileは現行のCloudflare Free planで利用可能。ただし専用widget/secretの作成、rotation、hostname管理が必要。
- Sales ToolsのAPI呼出し、Siteverify外向き通信、Cloud Run実行、Cloud SQLの小さなupsert/読取は従量負担が増える。日次aggregateなのでDB容量増加は小さい。
- 新規migration、権限、backup、監視、集計APIの運用は必要。GA4だけで済ませる案より作業は増えるが、固定されたBot・プライバシー・正本分離を満たす最小構成である。
- Turnstile障害時はUIを優先して未計上とするため、可用性障害日のKPI注記が必要。

## 9. 未解決Release Gate

1. 正式Originをserviceのみとするか、wwwも含めるか。
2. production/test用Turnstile widget、action名、hostname allowlistの承認。
3. 公開セルフチェックにTurnstile scriptを追加する際のCSPと表示/アクセシビリティ確認。
4. 匿名日次集計Migrationとruntime権限の正式番号・レビュー。Production Ledger実値をread-only verifierで独立確認してから採番する。
5. event countはunique visitorではなく反復を含む操作件数であることのKPI表示文言。
6. Turnstile/Sales Tools障害時の過少計上を許容し、結果表示を優先する運用承認。
7. UTMの許容長・正規化と、未付与・不正値をどう表示するか。
8. ProductionのアクセスログにおけるIP保持期間の確認。集計テーブルには保存しない。
9. UTM allowlistの正本を既存 `marketing_initiative` とするか環境設定とするか、およびallowlist外を `OTHER` に含めるか除外するか。

以上のGateを確定すれば実装着手可能。既存診断判定、相談申込、TimeRex、Business Diagnosis、E1 KPIを変更する必要はない。
