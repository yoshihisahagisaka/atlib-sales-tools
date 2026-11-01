# PIRA情報セキュリティ診断｜受付・情報管理 Contract

Repository: `yoshihisahagisaka/atlib-sales-tools`
Status: CANONICAL FOR LOCAL IMPLEMENTATION / GENERAL CONSENT NOT APPROVED FOR PRODUCTION
Date: 2026-11-01
Scope: PIRA情報セキュリティ診断の企業情報受付、共通OTPとの認証境界、状態管理、独立管理、CSV/XLSX出力、出力監査。
Out of scope: PIRA v6/v7の質問、38回答ID、C方式、固定文、レポート、診断回答・レポートの永続保存、Cloud Run・DNS・Secret・本番変更。

## 1. 正本性と優先順位

本書は、復元版 `pira-information-management-intake-admin-contract-20261030.md`、共通OTP Contract（PR #22）、共通OTP実装（PR #23）、および2026-11-01の統括判断を統合した受付実装正本である。

次の事項は本書を優先する。

- 診断回答、C方式の結果、レポート、PDFは受付側・共通OTP側で永続保存しない。
- UNIONはatLIB独自営業に利用しない。GENERALは利用者が同意した範囲に限り利用できる。
- 認証済みメールアドレスは共通OTPのJWT claimを正とし、公開フォームで任意入力・差し替えしない。
- GENERAL同意文言は提示案であり、最終承認前に本番公開しない。

## 2. サービス・URL・責任境界

| 区分 | URL | ブランド・利用境界 |
| --- | --- | --- |
| UNION | `https://pira.atlib.jp/` | 国際連携推進協会（国連協）。atLIB独自営業への利用は禁止。 |
| GENERAL | `https://www.atlib.jp/security-check/` | atLIB。承認済み同意範囲に限り支援・サービス案内へ利用できる。 |

- URLからサーバー側で受付区分、ブランド、許可サービス識別子を決定する。クライアントの任意入力では切り替えない。
- PIRA受付・管理データは、既存の`company`、`contact`、`sales_activity`、IT経営KAIZEN案件、既存診断Caseに結合しない。
- 管理画面は`/admin/pira/`配下に独立して置く。共通ダッシュボードは遷移だけを担い、PIRA固有状態や顧客データを統合しない。

## 3. フォーム Contract

| ID | API key | GENERAL | UNION | 制約 |
| --- | --- | --- | --- | --- |
| F01 | `companyName` | 必須 | 必須 | trim、1〜200文字 |
| F02 | `contactName` | 必須 | 必須 | trim、1〜200文字 |
| F03 | `email` | JWTから保存 | JWTから保存 | 認証済みemail。画面は表示専用、要求本文に含めない。 |
| F04 | `websiteUrl` | 必須 | 必須 | trim、HTTP/HTTPSのみ、最大2,000文字。取得、クロール、到達性確認をしない。 |
| F05 | `phone` | 任意 | 任意 | trim、最大50文字 |
| F06 | `unionName` | 表示・取得しない | 必須 | trim、最大200文字 |
| F07 | `address` | 表示・取得しない | 必須 | trim、最大500文字の自由入力。郵便番号必須・住所分割は行わない。 |

公開APIは施策種別から必須項目を決定する。`GENERAL`ではF06/F07を拒否し、`UNION`では必須とする。未知フィールド、自由記述、添付は受け付けない。

## 4. 同意 Contract

### 4.1 UNION — `PIRA-UNION-CONSENT-V1.0`（統括承認済み）

#### ご入力いただく情報の取り扱いについて

本診断は、国際連携推進協会（国連協）が、組合および所属企業の情報セキュリティ向上を支援するために実施しています。

ご入力いただいた情報は、国連協が本診断の運営や今後の支援施策の企画・検討に利用します。

診断システムの運営および情報の取り扱いは、国連協から委託を受けたatLIB株式会社が担当します。atLIBが取得情報を独自の営業活動に利用することはありません。

□ 上記の内容を確認し、同意します。

承認状態: **統括承認済み**。逐語変更禁止。

### 4.2 GENERAL — `ATLIB-GENERAL-CONSENT-DRAFT-V0.1`（統括提示案・最終承認待ち）

#### ご入力いただく情報の取り扱いについて

本診断は、atLIB株式会社が、企業の情報セキュリティへの理解を深め、今後の対策に役立てていただくために提供しています。

ご入力いただいた情報は、本診断の運営や、情報セキュリティに関する支援・サービスのご案内に利用します。

□ 上記の内容を確認し、同意します。

承認状態: **統括提示案・最終承認待ち**。逐語変更禁止。ローカル実装・検証には使用できるが、本番公開の前に最終承認を要する。

### 4.3 保存・利用規則

- 同意は`accepted=true`、区分に対応する`consentWordingVersion`、サーバー作成の`consentedAt`を保存する。
- UNIONの`sales_use_allowed_snapshot`は常に`false`とする。
- GENERALは、`ATLIB-GENERAL-CONSENT-DRAFT-V0.1`が本番承認された後に限り、同意済み受付について`true`にできる。それ以前の本番受付は開始しない。
- 営業利用可否は管理画面・出力確認画面だけに表示し、CSV/XLSXの列・セルに出力しない。

## 5. 状態・保持 Contract

基本遷移は`RECEIVED → ANSWERING → COMPLETED`とする。

| 状態 | 意味 | 保存しないもの |
| --- | --- | --- |
| `RECEIVED` | 認証済み利用者の企業情報・同意を受領した | 診断回答、レポート、PDF |
| `ANSWERING` | 既存8問の回答をブラウザ内で進めている | 回答本文、C方式結果 |
| `COMPLETED` | レポート表示まで完了した | 回答本文、C方式結果、レポート、PDF |

- 同一受付区分、trim済み企業名、共通OTPと同じ正規化メールアドレスの組合せでは、`COMPLETED`後24時間の再実施を拒否する。
- 企業名の照合はtrim済み文字列の完全一致とし、表記ゆれを推測して同一視しない。
- 受付情報は2年、出力監査は3年保持する。削除ジョブ、バックアップ、削除要求の具体運用はDeployment Configurationで検証する。

## 6. JWT・受付セキュリティ Contract

1. ブラウザは有効な2時間OTPセッションから、対象サービスに束縛されたRS256・5分JWTを取得する。
2. 受付APIはJWKSから`kid`を選択し、RS256署名、`iss`、`aud`、`exp`、`iat`、`jti`、`sub`、必須`email`を独立して検証する。OTPサービス内部の検証補助を受付側の代用品にしない。
3. 署名、JWKS、claim、サービス識別子、ブランド、URL区分のいずれかを検証できない場合はfail closedとする。
4. JWTの`email`を受付保存値とする。要求本文のメールアドレスを受け付けない。
5. `jti`はPIRA受付DBで一回だけ原子的に消費する。共通OTP DBに受付履歴または消費表を置かない。
6. JWT、OTP、セッショントークンをURL、Cookie、localStorage、sessionStorage、ログ、エラー本文へ出力しない。

## 7. 物理データ Contract

物理Schema名、role名、Migration番号は実装時点のDeployment Configurationとする。主キーはUUID、時刻は`TIMESTAMPTZ`、公開受付の冪等キーはUUIDとする。

### 7.1 `pira_initiative`

| 列 | 制約 |
| --- | --- |
| `initiative_id` | UUID PK |
| `initiative_code` | TEXT UNIQUE、公開URL・受付区分のサーバー側対応に使用 |
| `initiative_name` | TEXT、1〜200文字 |
| `initiative_kind` | `GENERAL` / `UNION` |
| `is_active` | BOOLEAN、受付可否 |
| `starts_at`, `ends_at` | TIMESTAMPTZ nullable |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Workspace操作者・監査時刻 |

### 7.2 `pira_submission`

| 列 | 制約・用途 |
| --- | --- |
| `submission_id` | UUID PK |
| `receipt_id` | 推測困難な表示用ID、UNIQUE |
| `initiative_id` | `pira_initiative` FK |
| `initiative_kind_snapshot` | `GENERAL` / `UNION` |
| `company_name`, `company_name_normalized` | F01、trim値を保存し、24時間制限に使用 |
| `contact_name` | F02 |
| `verified_email`, `verified_email_normalized` | JWT claimだけから保存 |
| `website_url`, `phone`, `union_name`, `union_address` | F04〜F07。UNION制約をCHECKで保証 |
| `consent_wording_version`, `consented_at` | 同意版・サーバー時刻 |
| `sales_use_allowed_snapshot` | UNIONは`false`。GENERALは本Contractの承認状態・同意に従う |
| `status`, `received_at`, `answering_at`, `completed_at` | 3状態と状態時刻 |
| `idempotency_key`, `payload_hash` | UNIQUE。再試行の同一性検証 |
| `created_at`, `updated_at`, `expires_at` | 2年保持・削除対象 |

`answers_json`、`priority_theme_ids_json`、レポート本文、PDF、OTP、JWT、セッショントークンをこの表へ置かない。

### 7.3 `pira_consumed_jti`

| 列 | 制約・用途 |
| --- | --- |
| `jti` | PK。JWT一回消費 |
| `submission_id` | `pira_submission` FK |
| `idempotency_key` | 同一操作リトライ照合 |
| `consumed_at`, `expires_at` | JWT期限と保持・削除に使用 |

`jti`のINSERT、`pira_submission`の作成、idempotency検証は同一トランザクションで行う。消費済み`jti`に異なるidempotency keyまたはpayload hashを組み合わせた要求は拒否する。

### 7.4 `pira_export_audit`

`export_audit_id`（UUID PK）、`requested_at`、`requested_by`、`format`（`CSV`/`XLSX`）、`filter_snapshot_json`、`result_count`、`initiative_ids_json`、`success`、`failure_code`、`created_at`を持つ追記専用表とする。アプリruntime roleはUPDATE/DELETEできない。監査書込み失敗時はファイルを返さない。

## 8. API Contract

### 8.1 公開受付

| Endpoint | 認証 | 責任 |
| --- | --- | --- |
| `GET /api/public/pira/v1/intake-contract?initiative=…` | 不要 | 有効施策のフォーム項目、同意文言識別子・承認状態だけを返す。 |
| `POST /api/public/pira/v1/submissions` | Bearer JWT | JWT検証、`jti`消費、企業情報・同意の受付、`RECEIVED`作成、冪等再応答。 |
| `POST /api/public/pira/v1/submissions/{receiptId}/state` | 新しいBearer JWT | 本人・区分・順序を検証し、`ANSWERING`または`COMPLETED`だけへ遷移する。回答・レポート本文は受け取らない。 |

`POST /submissions`のbodyは`initiativeCode`、`commonForm`、`union`（UNIONのみ）、`consent`、`idempotencyKey`、許可済みattributionだけを持つstrict schemaとする。F03はbodyに含めない。

- 同じ`idempotencyKey`と同じpayload hashの再試行は、同じ`receiptId`を返す。
- 同じkeyで異なるpayload、または同じ`jti`で異なる受付は409で拒否する。
- state遷移には、その操作ごとにOTPセッションから取得した新しいJWTを使う。`jti`の再利用を許さない。
- 受付ID単独で個人情報を返す公開詳細APIは提供しない。
- `Cache-Control: no-store`、origin allowlist、CORS、rate limit、honeypot、入力上限を適用する。

### 8.2 管理API

すべて`/api/admin/pira/v1/`配下とし、既存Google Workspace認証を必須とする。

| Endpoint | 責任 |
| --- | --- |
| `GET/POST/PATCH /initiatives` | PIRA施策の一覧・作成・許可項目更新 |
| `GET /submissions` | 施策、状態、期間のAND検索 |
| `GET /submissions/{id}` | 受付情報・同意・状態の詳細。診断回答・レポートは返さない。 |
| `POST /exports` | 出力前確認、監査書込み、CSV/XLSXストリーム応答 |

## 9. 管理・CSV/XLSX Contract

- `/admin/pira/`で施策、受付一覧、受付詳細、出力確認を独立して表示する。
- 出力前画面は対象施策、対象件数、営業利用可否を表示する。
- CSV/XLSXは受付ID、受付日時、施策名、状態、F01〜F07を対象候補とする。`sales_use_allowed`、操作者、監査ID、payload hash、idempotency key、token、IP、referrerは出力しない。
- CSVはUTF-8 BOM付き、XLSXは1シート・固定列順を初期Contractとする。最大件数・期間上限、STANDARDのF06/F07列の扱いは公開前に確定する。

## 10. ローカルE2E受入条件

1. UNION/GENERAL URLごとに、正しいブランド、フォーム、同意版が表示される。
2. OTP認証済みJWTだけで企業情報受付を開始でき、email差し替えを拒否する。
3. `kid`、RS256、`iss`、`aud`、`exp`、`iat`、`jti`、`sub`、`email`の不正を拒否する。
4. 並列`jti`消費は一件だけ成功し、同一idempotency keyの通信再試行は同じ受付を返す。
5. UNIONのF06/F07必須、GENERALのF06/F07拒否、全文字数・URL制約を確認する。
6. `RECEIVED → ANSWERING → COMPLETED`だけを許容し、COMPLETED後24時間の再実施を拒否する。
7. UNIONの営業利用不可、GENERALの承認状態・同意境界、回答・レポート非永続化を確認する。
8. 管理検索、CSV/XLSX、出力監査、2年/3年の削除候補抽出を確認する。
9. PIRA 8問・38回答ID・C方式・v7レポート、共通OTP PR #22/#23を回帰させない。

## 11. Decision Record — 旧設計との差異

| 日付 | 決定 | 本書での反映 |
| --- | --- | --- |
| 2026-10-30 | F01〜F07、STANDARD/UNION分岐、独立管理、出力監査 | 維持 |
| 2026-10-31 | 共通OTP、RS256/JWKS、受付側`jti`一回消費 | 受付JWT境界へ反映 |
| 2026-11-01 | UNION同意 `PIRA-UNION-CONSENT-V1.0` | 承認済み原文を逐語保存 |
| 2026-11-01 | GENERAL同意 `ATLIB-GENERAL-CONSENT-DRAFT-V0.1` | 提示案として逐語保存。本番承認待ち |
| 2026-11-01 | 回答・レポート非永続化 | 旧設計の`answers_json`、C方式結果snapshot、レポート保存を不採用 |
| 2026-11-01 | 利用境界 | UNIONは直接営業禁止。GENERALは同意範囲に限定 |

## 12. Fit/Gapと公開前STOP条件

| 資産 | Fit | Gap |
| --- | --- | --- |
| PR #22 | JWT、JWKS、認証済みemail、ブラウザ非永続化 | 本番Origin/CSP/CORS値 |
| PR #23 | OTP、セッション、JWT発行、UI | PIRA受付API・DB・画面接続 |
| 既存公開受付 | strict schema、冪等化、transaction、rate limitの実装パターン | PIRA専用テーブル、JWT、非永続化、営業データ分離 |
| 既存Workspace認証 | 管理API/画面の保護 | PIRA管理、CSV/XLSX、出力監査の実装 |

公開前に確認する。

1. GENERAL同意文言の最終承認。
2. Cloud Runの公開経路、CSP/CORS allowlist、Turnstile、SMTP、JWT鍵、DB role、保持・削除ジョブの環境値。
3. CSV/XLSXの正式列順、件数/期間上限、閲覧・出力role分離。
4. 本番Migration、切り戻しRevision、2年/3年保持の運用手順。

本書はContract正本化のみであり、Migration、API、管理画面、Cloud Run、Secret、DNS、本番を変更する承認ではない。
