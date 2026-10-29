# WSC Phase 2A（Synthetic検証のみ）

VS1を変更せず、CSV取込、実行状態、HTML生成、ローカル隔離保管を検証するための実装です。PowerShell v2原本、外部ネットワーク、GCP、公開URL、メール送信は使用しません。

## 入力契約

必須列は `企業名,本店所在地,URL`。UTF-8（BOM可）を受け付け、将来用に4列目の `メールアドレス` を任意で受け付けます。メールアドレスは診断・送信に使わず、テストデータにも含めません。

## 安全実行制御

`safe-executor.mjs` はHTTPS・443・認証情報なしの公開ホストだけを許可します。ローカル／私設IP、localhost、`.local`、DNS再束縛、接続IP不一致、未承認リダイレクトを拒否します。Phase 2Aの実装はネットワーク転送手段を持たず、Synthetic probe専用です。実運用の外部接続は、接続IP固定・再解決・速度制御を備えた別承認のtransportを実装するまで禁止です。

## 保管と状態

ローカル隔離保管は `batches/<batch_id>/` 配下に、企業・実測JSON・判定JSON・HTML・SHA-256整合性情報を保存します。相対パス逸脱と既存成果物の上書きを拒否します。`state.json` は `RUNNING`、`FAILED`、`REPORT_READY` を保持し、準備済みレポートは再実行しません。保存先ルートのOS権限、保持期間、削除はGCP移行時に統括決定が必要です。

## 実行

`node tools/wsc-phase2a/test.mjs`

## Fit / Gap

- Fit: 5社相当のSynthetic CSV、停止・再開、冪等な再実行、VS1 HTML/判定、改ざん検知を検証する。
- Fit: v2原本には一切触れず、atLIB実測値をPhase 2Aの入力に使用しない。
- Gap: 既存v2はatLIBだけを許可するため、任意企業向けの実ネットワークtransportは未実装。
- Gap: GCPバケット、IAM、保持期間／削除ジョブ、コスト実測は未実装・未検証。
- STOP: 実サイトへのアクセス、50社以上の負荷試験、外部アクセスtransport、GCP移行には別途承認が必要。
