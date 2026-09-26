# 無料IT経営診断V1：既存PDF基盤の調査・再利用方針

記録日：2026-09-26
対象：無料IT経営診断V1 Phase 5
区分：既存資産調査／再利用方針
状態：調査済み。無料診断への実装・E2E検証は未完了。

## 1. 調査の目的

無料IT経営診断V1の経営フィードバック資料をPDF出力するにあたり、atLIBで既に稼働しているPDF生成資産を再利用する。既存実装を推測で作り直さず、所在と方式を記録する。

## 2. 既存実装の所在

InfraVision月次レポート：

- リポジトリ：C:\atlib\atlib-msp-customer-portal
- PDF生成：batch/generate-monthly-reports.ts
- PDF保存：src/services/reportStorage.ts
- PDF配信：src/routes/adminMonthlyReports.ts
- HTMLレポート：C:\atlib\atlib-zabbix-server\atlib_monthly_report.html
- 参照URL：https://topology.zabbix.atlib.jp/atlib_monthly_report.html

無料診断側：

- リポジトリ：C:\atlib\atlib-sales-launch
- 画面：public/admin/it-management-diagnosis-report.html
- 画面処理：public/js/it-management-diagnosis-report.js
- 現行出力：window.print()によるブラウザ印刷
- レポート管理：src/services/diagnosisReportRepo.ts
- Context生成：src/services/reportContext.ts

## 3. InfraVisionで確認したPDF生成方式

1. PuppeteerでHTMLレポート画面を開く。
2. 対象顧客・対象月・運用履歴等を画面に反映する。
3. 既存の印刷用CSSを利用してpage.pdf()でPDFを生成する。
4. PDFは幅10インチ、高さ5.625インチ、背景印刷あり、余白ゼロ。
5. PPTXとPDFをCloud Storageに保存する。
6. 管理者向けAPIからPDFをapplication/pdfとしてインライン配信する。

依存ライブラリ：

- puppeteer
- @google-cloud/storage

現行のInfraVisionはPPTXを本体、PDFをプレビューとして扱う。

## 4. 保存方式と注意点

InfraVisionの保存先はcustomerCode/reportPeriod.ext形式。

同一顧客・同一対象月の再生成時は同一オブジェクトパスとなるため、この方式だけでは承認済みの過去版を不変に保持できない。

無料診断では既存のレポート版管理を優先し、少なくともcase_idとreport_idを区別する。承認済みの版をPDF化する際は、出力内容と対象report_idの一致を検証する。

## 5. 無料診断V1への再利用方針

- HTMLからPDFを生成するPuppeteer方式を再利用候補とする。
- InfraVisionの稼働コードを直接変更しない。
- 無料診断の既存Human Review、Report Context、Human承認、snapshot、版管理を維持する。
- AI生成結果をHuman承認なしに顧客提出物へしない。
- PDFを正式な提出物として扱う場合は、承認済み版との対応、保存、再発行、アクセス制御を設計・検証する。
- 現段階で無料診断の専用PDF生成APIや保存処理の実装完了を宣言しない。

## 6. 将来のIT経営KAIZEN／FACTACTへの展開

「顧客コード＋対象月」は、継続支援・運用支援の月次レポート共通基盤に活用する。

想定する管理単位：

- 無料診断：case_id / report_id / version
- 継続支援：customer_code / report_period / report_type / version

月次報告では、FACT（発生事実）、ACTION（実施内容）、RESULT（変化・成果）、NEXT（次の判断）を経営向けに整理する構想を保持する。

これは将来の拡張方針であり、今回の無料診断V1に共通月次レポート基盤全体を実装するものではない。

## 7. Phase 5の残作業

- ヒアリングの特定revisionからHuman Review、承認済みレポートまでの接続E2E検証
- レポート画面の印刷対象・版選択・印刷CSSの確認
- 承認済み版のPDF生成・保存・配信の必要差分を設計
- PDFが対象report_idの内容と一致することの検証
- 修正前後のヒアリングrevisionとレポート版が混在しないことの検証

## 8. 作業境界

- InfraVision本番環境・既存リポジトリを変更しない。
- push、deploy、本番migrationを実施しない。
- 実顧客データを使用しない。
- C:\atlib\git_KAIZENおよびDocker Supabaseには触れない。
- src/server.ts.backup-20260925-131908は変更・削除・stageしない。