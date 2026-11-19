# SECU:MIE Web｜管理画面（暫定運用・DB接続待ち）

2026-11-19 時点の公開受付と、スタッフの診断・レポート作成業務を接続するための実装仕様。

## 役割と設置先

- スタッフ側: Sales Tools の `/admin/secumie-web.html`。既存 `requireStaffAuth` とIPレート制限の内側にある `/admin` static 配信を再利用する。新しい公開APIや認証方式は追加しない。
- 診断・PDF: 既存 `POST /api/admin/web-security-check/diagnose`。既存 WSC VS1 診断、PDF生成、ネットワーク制限を再利用する。
- 公開受付側: `www.atlib.jp/secumie-web/`。**この変更では一切更新しない**。

## 今すぐ使える暫定運用

1. `contact@atlib.jp` の受付メールを原本として確認する。重複・対象URL・同意事項をスタッフが確認する。
2. この画面の「会社名・団体名」「診断対象URL」に手動転記する。受付メールにある担当者の連絡先は入力しない。
3. 「診断を実行してPDFを保存」を押す。HTTPS対象でのみ既存診断APIを実行し、PDFをブラウザでダウンロードする。
4. PDFをスタッフが点検し、原本メールの送付先宛てにメール送信する。**この画面は送信しない**。
5. 暫定期間中の受付済み・対応中・提出済みと送付日時は、既存の担当者間の管理記録で照合する。**この画面には永続的な状態保存機能はない**。

PDF生成は申込の完了、メール送付、提出済みへの自動変更を意味しない。

## 専用DB稼働後の接続契約（PR #50）

- `GET /api/admin/secumie-web/v1/requests?status=&companyName=&unionName=&limit=50&offset=0` から申込一覧を取得する。
- 返却項目: `intakeId`、`receiptId`、`receivedAt`、`unionName`、`companyName`、`websiteUrl`、`contactName`、`contactEmail`、`status` など。入力値は HTML として評価せずテキストとして表示。
- 行の「診断に反映」は会社名とURLだけを診断欄に設定する。PIIを診断APIへ送らない。
- `PATCH /api/admin/secumie-web/v1/requests/:id/status` は `RECEIVED`、`IN_PROGRESS`、`SUBMITTED`、`CANCELLED` を使用する。`SUBMITTED` 更新は、実送付をスタッフが確認した場合に限る。
- HTTP 404（現行mainにはAPI未搭載）時は未接続と明示し、PDF手動診断は独立して機能する。

## 本番移行の未完了条件

1. PR #50 と専用 Web DB マイグレーションは本番No-Go。Web/InsightのDB所有・権限・移行ゲートをクリアしない限り実施しない。
2. 現行コーポレートサイトのメール受付はDBへ直接記録していない。**既存メール受付分が管理一覧へ自動連携されることはない**。連携方式（メール原本の明示的移行、または新受付をDBへ切替）は別途設計・承認・検証が必要。
3. 作成PDFの恒久保管・監査証跡・自動メール送付・エラー再実行管理は未実装。個人情報とレポートの保存先、アクセス制御、保管期限を決めてから追加する。
4. 現時点ではこのPRをマージ・デプロイしていない。実運用URLとして案内する前に、既存Sales Toolsの認証・ビルド・診断PDF実行テストを通し、独立したデプロイ承認を得る。

## Staging着手前の現行確認

Cloud Shell（対象GCPプロジェクトを閲覧できる環境）から以下を実行する。

```bash
bash scripts/secumie-web-admin-preflight.sh
```

`sales-tools` と `sales-tools-staging` の現行100%トラフィック、実行SA、Ingress、Git main/候補HEADを読み取り、**何も変更しない**。チェック結果をもとに、正規の `main` と候補SHAを確認して独立したStaging検証計画を作成する。既存Stagingの100%トラフィックを無断で入れ替えない。

## 検証

```bash
node --check public/admin/secumie-web.js
node --test test/secumieWebAdmin.contract.test.cjs
node --test test/secumieWebAdmin.browser.test.cjs
npm ci --no-audit --no-fund
npm run build
node -r ts-node/register --test test/wscSalesService.test.ts
```

Browser suite はローカルの静的ファイルサーバーとAPIモックを使用する。実Cloud Run・本番DB・外部URLには通信しない。Chromium起動がOSに拒否される環境では4件を **SKIP** として明示し、PASSに算入しない。スタッフ認証と本物のPDF出力については別途Staging受入試験が必要。

Webhooksやメール本文、連絡先、PDFをブラウザの localStorage / sessionStorage / IndexedDB、ログ、Slackに保存しない。Slack通知については既存の秘匿済み設定のみ利用し、本画面から新規送信しない。
