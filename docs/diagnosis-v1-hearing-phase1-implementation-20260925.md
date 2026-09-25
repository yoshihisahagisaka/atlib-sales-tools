# 無料IT経営診断V1 — ヒアリング記録 Phase 1 実装・検証記録

日付：2026-09-25
対象ブランチ：feat/free-diagnosis-sales-launch
実装前基準SHA：6b907e53dce10718575bac3635d7a99b3c425083

## 1. 位置づけ

本書は `diagnosis-v1-input-analysis-reporting-decision-20260925.md` の
業務・UX Decisionに基づくPhase 1の実装記録であり、同Decisionを変更しない。

Phase 1はヒアリング記録のDB・Repository・管理APIを対象とする。
専用ヒアリング画面、共通分析画面、Human Review、レポート/PDF接続は未実装。

## 2. 実装対象

- migrations/019_diagnosis_hearing_records.sql
- src/services/diagnosisHearingRepo.ts
- src/routes/diagnosisHearing.ts
- src/server.ts
- test/diagnosisHearing.golden.test.ts

## 3. 実装内容

- Web回答とは別に、案件・設問・設問バージョン単位でヒアリング記録を保存する。
- CREATE/CORRECTの版管理を行い、訂正理由・変更前後・操作者・記録日時を保持する。
- expectedVersionによって古い版からの更新を拒否する。
- 既存の設問定義・選択肢・回答検証を再利用する。
- スタッフ認証と管理APIの更新ガードを適用する。
- 読取APIは元のWeb回答とヒアリング記録を別々に返す。
- ヒアリングAPIはsurvey_responsesを更新しない。

## 4. 検証結果

隔離レビュー環境および元リポジトリで検証。

- ヒアリング専用テスト：2/2 PASS
- 既存診断テスト：15/15 PASS
- Sales Intakeテスト：6/6 PASS
- npm.cmd run typecheck：正常終了
- git diff --check：空白エラーなし（Windows改行コード警告あり）

専用テストではWeb回答の非破壊性、CREATE/CORRECT履歴、
訂正理由必須、更新競合、設問バージョン検証、スタッフ認証、
更新ガード、入力検証、読取を確認した。

## 5. 未実施・次工程

- 専用ヒアリングUIの実装
- Web回答の出典情報とヒアリング記録の画面上での並列表示
- 共通分析ワークスペースへの連携
- Fact / Unknown / AI仮説 / 人間の判断の分離
- Human Review、版管理レポート、PDFへの接続
- 本番migration適用、デプロイ、本番動作確認

本記録の作成時点では、本番DB・本番環境への変更は行っていない。
