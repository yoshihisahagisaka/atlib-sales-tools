# 無料IT経営診断V1 — ヒアリング出典参照 Phase 3 検証記録

日付：2026-09-26
対象ブランチ：feat/free-diagnosis-sales-launch
実装コミット：216bc4f2ad1df268f6ef8233ace28a5c2f7bc5d5

## 1. 位置づけ

本書は既存の入力・分析・レポーティングDecisionを変更せず、Phase 3の実装と隔離環境での検証結果を記録する。

Phase 3はヒアリング記録の特定revisionをAI提案・Human Review後のInsight・分析・レポート文脈へ出典として接続する段階である。Web回答原本とヒアリング記録を混同せず、訂正後も引用時点のrevisionを保持する。

## 2. 実装対象

実装コミット 216bc4f に含まれる主な対象：

- migrations/020_diagnosis_hearing_source_references.sql
- src/domain/diagnosisReview.ts
- src/domain/diagnosisWorkspace.ts
- src/services/diagnosisReviewRepo.ts
- src/services/diagnosisWorkspaceRepo.ts
- src/services/interviewAssistantContext.ts
- src/services/managementAnalysisReadModel.ts
- src/services/reportContext.ts
- test/diagnosisHearingSourceReferences.golden.test.ts
- test/support/diagnosisHarness.ts

## 3. コード側の検証

- npm.cmd run typecheck：PASS
- Phase 3専用テスト：12 PASS / 0 FAIL
- 関連回帰テスト：60 PASS / 2 SKIP / 0 FAIL
- git diff --check：PASS

回帰テスト対象：

- diagnosisHearing：2 PASS
- diagnosisWorkspace：14 PASS / 1 SKIP
- diagnosisReview：15 PASS / 1 SKIP
- diagnosisReport：13 PASS
- managementAnalysis：3 PASS
- itManagementDiagnosis：13 PASS

SKIPの2件は明示的opt-inが必要なAIライブテストであり、実行していない。

## 4. 隔離PostgreSQLでの検証

専用Dockerコンテナ atlib-diagnosis-v1-pg-test 内のPostgreSQL 16.15を使用。ホストポート公開なし、ネットワークnone。対象DBは専用テストDBのみ。

- 001〜016、018〜020の19 migrationをUTF-8原本から再生：PASS
- Phase 3正常系の実DB確認：PASS、ROLLBACK後の残存0件
- 不正参照10ケースの実DB拒否確認：10/10 PASS
- SOURCE_RECORD旧形式の互換確認：PASS
- SURVEY_RESPONSE旧形式の互換確認：PASS

別の専用DB diagnosis_upgrade_test では、001〜016、018、019を適用した状態で旧形式の参照4件をCOMMITし、migration 020を適用した。

- migration 020適用：PASS
- 旧参照4件：移行前後で完全一致
- 欠落・余分な参照：0件
- 旧参照のsource_revision_id・hearing_record_id：NULL
- 旧参照のsource_revision_identity：ゼロUUID

検証用のphase3_pre020_source_baselineは専用テストDB内の比較用テーブルであり、製品migrationには含めない。

## 5. 未実施・次工程

- 専用ヒアリングUI
- Web事前回答あり／なしの両入口の画面動作
- 出典・現在値・訂正履歴の画面表示
- Human Reviewから版管理レポート・PDFまでのE2E確認
- 明示的opt-inを要するAIライブテスト
- 本番migration、deploy、本番動作確認

Phase 3の検証完了は、無料IT経営診断V1全体の完成・本番公開を意味しない。

## 6. 作業境界

本検証では本番DB、本番環境、実顧客データを変更していない。push・deploy・本番migrationは実施していない。

未追跡のsrc/server.ts.backup-20260925-131908は既存の保護対象として維持し、変更・削除・stageしない。