# IT経営KAIZEN 設計Assessment E2 — 既存無料診断管理UIからの引継ぎ Fit/Gap

Date: 2026-11-23
Status: **READ-ONLY SOURCE FIT/GAP / NO IMPLEMENTATION AUTHORIZATION**
Parent: Phase E1 Issue #92, Draft PR #93 HEAD `5e294762c52733021a254360747c3d803e4c0b5d` (test completion Issue #94 pending).
Business standard: "業務をシンプルかつ確実に遂行することが目的。既存資産を最大限再利用し、必要な差分のみ実装する。"
Authority: git_KAIZEN docs/23, 77, 78, 86; `docs/it-kaizen-assessment-scope-price-separated-development-priority-20261117.md`, `docs/it-kaizen-assessment-factact-core-division-and-parallel-development-20261121.md`.

## 1. 目的と責任境界

Staffが無料診断Design v2で実際のレポート送付と経営フィードバックを記録したあと、Assessmentへ**1回の明示的なHandoff操作**を行う。Handoffは既存のE1 POST/GETだけを利用する。有料Assessmentの準備では無料診断の原文・参照を再入力させず、確認事項を人が選ぶ。顧客発言・確認候補・FUTUREを自動的にFACTへ昇格しない。

## 2. 現行Gitで確認したFit

- `src/services/vs1ReviewReportFeedbackRepo.ts`: `approve`, `deliver`, `startFeedback`, `decide` の既存状態遷移と監査がある。追加のステータス管理テーブルやCommandは不要。
- `src/routes/adminFreeDiagnosisRuleBasedV1.ts`: 既存staff認証配下に`POST /cases/:id/reports/:reportId/deliver`, `POST /cases/:id/feedback/start`, `POST /cases/:id/feedback/decision` がある。再実装しない。
- `src/services/designV2AssessmentEligibility.ts`: CLOSED + 最新DESIGN_ASSESSMENT + DELIVERED正本 + 全Hash/Versionの既存確認。E1が使用する。UIで類似検証を実装しない。
- E1 `src/routes/adminPaidAssessmentSourceHandoff.ts`: staff POST `/:caseId` / GET `/:caseId/latest` が存在。修正・実施はE1受入完了後。
- `public/admin/free-diagnosis-v1.html` のlegacy Report UIは「送付済みとして記録→経営フィードバック記録」の業務表現を既に持つ。文言・操作思想の準用候補。
- `src/domain/paidAssessmentPreparation.ts` / `paidAssessmentPreparationAgenda.ts` は人が分類したFuture・確認項目を決定論的に整理する。新たな質問/FACT推定エンジンを作らない。

## 3. 実際のUI Gap（現行Gitに限定）

- `public/admin/free-diagnosis-v1.html` `openDesignV2Case` はDesign v2の既存レポートがあると `free-diagnosis-v2-report.html` に遷移する。
- `public/admin/free-diagnosis-v2-report.html` / `.js` の操作は下書き保存、レポート承認、PDF表示が中心であり、**無料診断v2レポートの送付済み記録・経営フィードバック入力・E1 Handoffを行う操作がない**。Backendには既存Commandがあるので、別のCRMやワークフローは不要。
- `free-diagnosis-v2-report.js` の `renderApprovalState()` は `APPROVED` をread-onlyにするが、`DELIVERED` を同等に扱っていない。Backendは承認済み編集を拒否するが、画面上も適切に読み取り専用へ揃える必要がある。
- `src/services/freeDiagnosisRuleBasedCaseRepo.ts` `getCase` の`CaseRow` はstatus/version等は返すが、`feedback_started_at` や最新routeは含まない。リロード時に「フィードバック開始済みか」「直近の決定がDESIGN_ASSESSMENTか」をUIが推測せず判断できる**既存のstaff read contract**があるかは追加の限定調査対象。必要な場合のみ最小のread-only status投影を検討。E1の既存`latest`はHandoffがない場合nullを返すだけで、未引継ぎ案件のEligibilityを表さない。

## 4. 推奨する最小実装方向（コードレベル仕様ではない）

既存v2レポート管理画面を拡張し、**別のAssessment移行管理画面は作らない**。想定する操作は以下:
1. Staffがレポートを承認。既存処理のみ。
2. 実際に顧客へ提出したあと「送付済みとして記録」を操作。既存`deliver`を呼ぶ。**PDF表示だけで送付済みと見なさない。**
3. 経営者とのフィードバックを記録。既存`startFeedback` + `decide` を、再読み込み・再試行時に安全な順序で呼ぶ。選択肢は既存の4routeを使い、常に人が決める。`DESIGN_ASSESSMENT`は検討移行の意思であり、受注・支払・FACT認証ではない。
4. 最新の意思決定が`DESIGN_ASSESSMENT`の場合だけ「設計Assessmentへ引継ぐ」を表示し、staffのクリックでE1 `POST`。既存409等は「引継ぎ可能な状態を確認してください」として扱い、成功後は重複操作不要と表示。
5. 成功後、既存E1 `latest`のID/Version/Hashを準備工程で参照。元のレポートや原調査記録に戻れる。Assessment側で必要な確認事項だけを人が選択・記述する。新しいFACT/Work DBは持たない。

## 5. E2実装前に解消する狭いUNKNOWN

a. Design v2の送付・フィードバック開始・意思決定を再読み込み時に追跡できる**既存の読み取りエンドポイント/型**はあるか（`adminFreeDiagnosisRuleBasedV1.ts`, `FreeDiagnosisRuleBasedCaseRepo`, `Vs1ReviewReportFeedbackRepo`, related UIのみ確認）。ない場合、最小のスタッフ向けread-only状態表示を設計する。二重管理はしない。

b. 既存のDesign v2 Report編集・承認ブラウザテスト `test/freeDiagnosisDesignV2ReportEditor.browser.test.ts` を追加テストに使えるか。既存のローカルPGliteハーネスを流用し、同じ業務状態で往復確認する。別の自動化フレームワークを作らない。

c. E1受入テストIssue #94が完了するまでは、E1上の新規UI実装を開始しない。

## 6. Codexへ渡す場合の限定調査範囲とSTOP

まずはa/bの**読み取り専用調査**だけを依頼する。正確なファイル・シンボル・既存GET/POST契約とUIイベント、ブラウザテストの再利用可否を返す。設計判断をCodexへ委任しない。結果に基づき、こちらで単一画面と既存APIの最小差分をコードレベルで確定する。No new CRM, new paid contract/price workflow, FACTACT write/API, duplicated Evidence/FACT, second report pipeline, Merge, Migration execution, GCP or Production.
