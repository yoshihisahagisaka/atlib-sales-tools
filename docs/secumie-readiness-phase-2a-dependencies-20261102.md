# SECU Insight Readiness Phase 2A 依存関係是正記録

確認日: 2026-11-02

基準Commit: `89aeb1908c1a3853cab775114025933942b59adc`

作業ブランチ: `fix/secumie-readiness-dependencies`

## 結果

`npm audit --omit=dev` で検出された本番依存の Critical / High を、互換パッチおよび限定的な直接依存更新で解消した。

| 区分 | 更新前 | 更新後 |
| --- | ---: | ---: |
| Critical | 1 | 0 |
| High | 5 | 0 |
| Moderate | 14 | 14 |
| 合計 | 20 | 14 |

## 更新した依存関係

| パッケージ | 更新前 | 更新後 | 方法 |
| --- | --- | --- | --- |
| `proxy-addr` | 2.0.7 | 2.0.8 | `overrides` |
| `body-parser` | 1.20.8 | 1.20.9 | `overrides` |
| `@grpc/grpc-js` | 1.14.4 | 1.14.7 | `overrides` |
| `nodemailer` | 9.1.1 | 10.3.1 | 直接依存更新 |
| `zod` | 3.25.76 | 4.6.7 | 直接依存更新 |
| `brace-expansion`（開発依存経路） | 1.1.18 | 1.1.21 | `overrides` |

## 解消したAdvisory

- `proxy-addr`: GHSA-jqcg-44mw-7w3h（Critical）
- `body-parser`: GHSA-27r3-jxmh-p828（High）
- `@grpc/grpc-js`: GHSA-m9gg-hp2v-232j（High）、GHSA-f596-whhp-79r4（Low）
- `zod`: GHSA-mrhx-c7xc-m3w5（High）
- `nodemailer`: GHSA-v53p-9fqp-m79j、GHSA-prgh-xp8r-p3m5（High）
- `brace-expansion`: GHSA-qhr7-859c-m2p7、GHSA-6j4f-fj2g-mc7p（High）、GHSA-q2hr-2g5m-vwhr（Moderate、対象経路）

## 互換対応

- Zod 4で必須になった`z.record()`のキーSchemaを`z.string()`として明示した。入力項目、拒否条件、診断ロジックは変更していない。
- 共通のparse helperをZod 4の入出力型に合わせた。実行時の検証ルールは変更していない。
- Nodemailer 10の送信結果分類について、SMTP成功を`SENT`、SMTPが未受理と確定した失敗を`FAILED`、タイムアウト等を`UNKNOWN`とする既存境界を自動テストで確認した。
- OTP UIブラウザテストにDOM型参照を明示した。製品コードと画面表示に変更はない。

## 残存するModerate

### ExcelJS系

`exceljs 4.4.0`から`archiver`、`archiver-utils`、`glob`、`minimatch`、`readdir-glob`、`zip-stream`、`uuid`へ至る経路が残る。XLSX生成は本番到達可能だが、アーカイブ内パスはサーバー側で固定され、利用者入力は文字列セルとして出力される。CSV数式注入対策およびXLSX文字列セルの既存テストはPASSした。

`npm audit fix`が示す`exceljs 3.4.0`への変更は非互換ダウングレードとなるため実施しない。上流の互換修正版を追跡し、ExcelJS更新を独立工程で評価する。

### Google系

`gaxios`、`google-gax`、`retry-request`、`teeny-request`、`uuid`の経路が残る。Google認証・Secret Manager等の既存経路への影響があるため、一括更新せず、上位Googleライブラリの互換更新として別工程で扱う。

### Express / qs系

`qs 6.16.0`にGHSA-x5fp-wj9c-mxmx、GHSA-4mjr-xmp4-gh2g、GHSA-6pq8-jhm2-2vcwが残る。現在のCritical / Highは解消済みであり、Express/body-parserの上流更新を追跡する。

### 開発依存系

`rimraf` / `glob`等の開発ツール経路にModerateが残る。本番ランタイムの到達経路とは分離して記録する。

## 検証結果

すべてPASS。

- TypeScript build
- OTP送信予約 実PostgreSQL: 10/10
- OTP API 実PostgreSQL: 8/8
- OTP UI Playwright: 2/2
- OTP Mailer配送結果分類: 1/1
- PIRA受付 実PostgreSQL: 8/8
- PIRA E2ブラウザ: 2/2
- HA-1ブラウザ: 1/1
- HA-2管理ブラウザ: 1/1
- E3管理・CSV/XLSX・監査 実PostgreSQL: 12/12
- 既存Sales Tools回帰: kaizen、diagnosis、preparation、workspace、review、handoff、report、business-web-consultation API（live依存テストのみ既存どおりskip）
- `git diff --check`

実PostgreSQLテストは初期化競合を避けて直列に実行した。本番Cloud SQL、本番SMTP、Cloud Run、Secret、DNS、Migrationには変更していない。

## Readiness判断

Phase 2Aの依存関係ゲートである「到達可能なCritical / High 0件」を満たす。残存Moderateは上記のとおり到達性と制約を記録し、非互換ダウングレードや一括更新は行わない。

PR #28のProduction No-Goは、依存関係以外の公開準備条件が解消されるまで維持する。
