# SECU Insight Readiness Phase 2B 本番runtime組立記録

確認日: 2026-11-02

基準Commit: `9368248daab4fa269d089a6f8aeb4f2c3527a5ef`

## 構成

既存実装を次の2 runtimeへmountした。Sales Toolsの既存`src/server.ts`へ公開OTPやPIRA受付を追加せず、スタッフ認証・営業データとの実行境界を維持する。

| runtime | entry point | Docker target | 公開機能 |
| --- | --- | --- | --- |
| 共通OTP | `dist/publicOtpServer.js` | `otp-runtime` | `/v1/otp/*`、`/.well-known/jwks.json`、`/healthz` |
| PIRA公開受付・画面 | `dist/piraPublicServer.js` | `pira-runtime` | PIRA画面、受付API、静的資産、`/healthz` |

PIRA画面はHA承認済み`pira-e2.html`と既存v7資産を配信する。HA用固定OTP、レビュー案内、モック受付はDocker imageへ含めない。回答、C方式結果、レポート、PDFはブラウザ内で処理し、受付DBへ永続化しない。

## 推奨接続経路

ブラウザからはsame-originを維持し、HTTPSロードバランサでパスを分離する。

- `https://pira.atlib.jp/v1/otp/*` → OTP runtime
- `https://pira.atlib.jp/.well-known/jwks.json` → OTP runtime
- `https://pira.atlib.jp/*` → PIRA runtime
- `https://www.atlib.jp/security-check/v1/otp/*`の正式ルーティングはGENERAL公開承認後に確定する
- `https://www.atlib.jp/security-check/*` → PIRA runtime（GENERAL有効化後）

OTP runtimeのCORSは登録済みOriginだけを許可する。現在の画面はsame-origin API baseを使用するため、通常経路でcross-origin CORSに依存しない。

## 必須環境設定

秘密値はSecret Manager等から環境変数へ注入し、ソースやimageへ格納しない。

### 共通

- `PORT`
- `DB_NAME`、`DB_USER`、`DB_PASSWORD`
- `DB_HOST` / `DB_PORT` または`DB_SOCKET_PATH`
- `NODE_ENV=production`

### OTP runtime

- `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD`、`SMTP_FROM`
- `TURNSTILE_SECRET`
- `OTP_HMAC_KEY`（32文字以上）
- `OTP_JWT_ISSUER`（productionはHTTPS）
- `OTP_JWT_ACTIVE_KID`
- `OTP_JWT_KEYS_JSON`（RS256新旧鍵。秘密鍵はOTP runtimeだけに注入）
- `PIRA_UNION_ORIGIN`
- `PIRA_GENERAL_ENABLED=false`（現時点の本番値）
- `PIRA_GENERAL_ORIGIN`（GENERAL有効化時のみ）

### PIRA runtime

- `OTP_JWT_ISSUER`
- `OTP_JWKS_URL`（productionはHTTPS）
- `TURNSTILE_SITE_KEY`
- `PIRA_UNION_HOST=pira.atlib.jp`
- `PIRA_GENERAL_HOST=www.atlib.jp`
- `PIRA_UNION_INITIATIVE_CODE=pira-union`
- `PIRA_GENERAL_INITIATIVE_CODE=pira-general`
- `PIRA_GENERAL_ENABLED=false`

必須値の欠落、不正JSON、短いHMAC鍵、productionでの非HTTPS issuer/JWKSは起動失敗となる。

## セキュリティ境界

- containerは`node`ユーザーで実行する。
- `trust proxy=1`とし、Cloud Run/LBの1ホップを前提にIPレート制限へ渡す。
- OTP APIは10分20回の既存IP制限、登録Origin、Turnstileを維持する。
- JWTはRS256、`kid`、`iss`、`aud`、`exp`を受付側で独立検証し、`jti`を受付DBで一回消費する。
- CSPはselfを基本とし、Turnstileのscript/frame/connectだけを許可する。既存HTMLのinline初期設定・styleを維持するため`unsafe-inline`が残る。nonce化は公開前のhardening候補とする。
- GENERALは`PIRA_GENERAL_ENABLED=false`時に画面、受付route、OTPブランド登録を行わない。
- ログは起動イベントのみを出し、OTP、JWT、メール、秘密値を出力しない。

## ローカル検証

- OTP/PIRA Docker target build: PASS
- container非root: PASS
- 必須設定欠落時のfail closed（exit 1）: PASS
- 実PostgreSQL＋実Router＋Playwright本番相当E2E: 2/2 PASS
  - OTP→JWT→受付→ANSWERING→8問→レポート→COMPLETED
  - 不明Host、GENERAL無効、JWT不正の拒否
- OTP送信予約: 10/10 PASS
- OTP API: 8/8 PASS
- PIRA受付: 8/8 PASS
- E3管理・CSV/XLSX・監査: 12/12 PASS
- E2ブラウザ: 2/2 PASS
- HA-1: 1/1 PASS
- HA-2: 1/1 PASS（隔離レビューDB設定を明示）
- OTP UI: 2/2 PASS
- TypeScript build: PASS
- `npm audit --omit=dev`: Critical 0 / High 0 / Moderate 14

## 未確認・No-Go

次の値はGCP現物へ変更・照会せず、未確定のDeployment Configurationとして残す。

- Cloud Run service名、service account、ingress、min/max instances、Cloud SQL接続名
- HTTPS LBのURL mapと`pira.atlib.jp`のDNS・証明書
- Secret Manager secret名、runtime service accountへの最小IAM
- 本番SMTP送信経路と送信上限
- Turnstile本番site/secret keyと許可hostname
- JWT本番issuer、`kid`、新旧鍵併存期間、JWKS cache方針
- DB runtime roleへの`public_auth` / `pira`専用最小権限
- ログ保持、監視、バックアップ、revision切り戻し手順の本番値
- GENERAL同意文言の最終承認と`www.atlib.jp`既存Apache/LBルーティング

上記が承認・設定・本番前検証されるまでProduction No-Goを維持する。
