# 無料 IT経営診断 Slice 5 — 実装・検証記録

## 1. Summary

Report Draft生成、Human Reviewへの修正導線、Report承認・送付記録、経営Feedback完了までを追加した。

- Base: `main` / `632e9cd49f8208ec831a0299f650d444d120dd03`
- Branch: `feat/it-management-diagnosis-slice5`
- SSOT: `git_KAIZEN/main` / `6b0d22a82efedefccfe04bac3f8830338e6f3a5e`
- 正本: `docs/30-free-it-management-diagnosis-slice5-codex-implementation-handoff-v1.md`

無料診断関連docs/17〜29を確認し、既読のSlice 4時点からの変更がないことを照合した上でdocs/30に従って実装した。SSOT repositoryは変更していない。

AIはHuman Approved ContextからDraftを作るだけであり、Case状態、Insight、Raw Sourceを変更しない。Human Approvedは企業FACTの確定を意味しない。

## 2. Files changed

| 区分 | ファイル |
|---|---|
| 新migration | `migrations/011_it_management_diagnosis_report_feedback.sql` |
| Domain / schema | `src/domain/diagnosisReport.ts` |
| Case status / Next Action | `src/domain/itManagementDiagnosis.ts` |
| Persistence / commands | `src/services/diagnosisReportRepo.ts` |
| Context / Provider / Worker | `src/services/reportContext.ts`, `src/services/reportDraftProvider.ts`, `src/services/reportDraftWorker.ts` |
| API / 起動 | `src/routes/diagnosisReport.ts`, `src/routes/adminItManagementDiagnosis.ts`, `src/server.ts` |
| O-06 | `public/admin/it-management-diagnosis-report.html`, `public/js/it-management-diagnosis-report.js`, `public/css/diagnosis-report.css` |
| 既存画面への導線 | `public/admin/it-management-diagnosis-detail.html`, `public/admin/it-management-diagnosis-review.html`, `public/admin/it-management-diagnosis.html` |
| 状態・Raw Source表示 | `public/js/it-management-diagnosis-admin.js`, `public/js/it-management-diagnosis-preparation.js`, `public/js/it-management-diagnosis-review.js`, `public/js/it-management-diagnosis-workspace.js` |
| Golden / browser | `test/diagnosisReport.golden.test.ts`, `test/diagnosisReport.browser.test.ts`, `test/diagnosis.playwright.config.ts` |
| Test harness / fixtures | `test/support/diagnosisHarness.ts`, `test/support/reportFixtures.ts` |
| Test command / 引継ぎ | `package.json`, 本文書 |

既存Express / TypeScript / PostgreSQL、Google Workspaceスタッフ認証、admin rate limit、command header・cross-site Gate、error handler、Case lock/version/Audit、管理画面CSSを再利用した。AIExecutionのqueue・lease・失敗保存を再利用し、AI-04専用Workerを追加した。既存Anthropic SDK・モデル・API key設定を使用し、新dependencyは追加していない。

Mailer / Slackは既存のまま。Deliveryは実際の送付後にスタッフが行う送付記録であり、このcommandから顧客へのメールを自動送信しない。

## 3. Persistence / migration

011で`diagnosis_reports`を新設。Case内のReport versionを一意にし、本文更新の`content_version`を別に保持する。`content_json`が正本、HTML・ブラウザー印刷/PDFはrender結果。Draft作成時の`context_json`とhash、AIExecution参照、prompt / policy versionも記録する。

CaseにFeedback開始・完了時刻、開始担当者、対象Report参照を追加した。SourceRecordに`FEEDBACK_STATEMENT`と対象Report参照を追加し、Caseを跨ぐ参照は複合FKで拒否する。新Case statusとAI process typeは追加のみ。migration 001〜010、legacy API / tableは変更していない。

Report承認後の本文・Context・snapshot・version・承認情報の更新、および削除をDB triggerでも禁止する。許されるReport遷移は承認から送付済みへの変更。承認・送付・FeedbackとAudit / CaseTransitionは同一transactionで保存する。

本番DBには適用していない。デプロイ時は既存migration runnerで011を適用してから新アプリを起動する。

## 4. AI-04 Provider / schema / context validation

`buildReportContext()`の明示SQL whitelistはCurrent Future、HUMAN_APPROVED Insight、OPEN AssessmentConfirmationItem、顧客表示名と提供会社名だけを選ぶ。Raw SurveyResponse、SourceRecord、Transcript、AIProposal、DRAFT / REJECTED / SUPERSEDED Insight、token等は入力に含めない。

Workerは監査用execution snapshot全体ではなく、承認済みContext部分だけをProviderに渡す。構造化JSON schemaとstrict Zodで5section・block type・参照を検証する。Systemがblock IDを生成し、AIによるmetadata追加、FACT / CONFIRMED_FACT / score / maturity等のfield追加を拒否する。

Provider promptはContext中の指示をuntrusted dataとして扱い、承認済み`report_text`を使用する。Backendでも原文との照合を行う。AI timeout・未設定・不正出力はFAILEDとして保存し、Human-onlyで継続できる。遅延結果はCase version・状態・最新Report・Context hashを再照合し、Human作業後の結果を採用しない。

## 5. Report grounding behavior

診断blockは1件以上の同じCaseのHUMAN_APPROVED Insightを参照する。semantic typeに応じたsection・ラベルを保持し、仮説・UNKNOWNを断定へ変換しない。

Future紹介は`FUTURE` block、Assessmentでの確認候補は`ASSESSMENT` blockとして分離する。Evidence候補を存在Observationや内容評価へ変換しない。未承認・別Case・存在しない参照、重複Insight、不正なsectionを拒否する。

O-06ではblockから承認済みInsightのID・version・semantic type・本文を確認できる。既承認版はその版のsnapshotを表示し、現在のInsightで置き換えない。Insightがないsectionは空のまま残せる。

## 6. Wording / meaning-change guard

通常編集は空白・改行、定義済みの敬体変換を照合して保存する。英数字間の空白削除による単語・数値の変化は許可しない。block ID・参照・semantic typeを通常編集で変更できない。本文のbefore / afterをAuditに保存する。

任意の言い換えを自動的に「同じ意味」と判断しない。照合できない言い換え、新しいGap・Root Cause・導入判断、UNKNOWN解消等は422で拒否し、Human Reviewへの修正導線を示す。

スタッフが修正理由と「Human Reviewへ戻す」を明示すると、ReportをREVISION_REQUIREDにし、CaseをHUMAN_REVIEW_REQUIREDへ戻す。既存Slice 4のInsight追加 / Supersede / Review完了を経て、新しいDraftを作る。理由のみの修正依頼ではCase状態は変えない。REVISION_REQUIREDのまま承認できない。

## 7. Approval snapshot behavior

Human承認時に以下をfreezeする。

- Future ID / version / statement / intent status
- Insight ID / version / semantic type / content / UNKNOWN区分
- OPEN AssessmentConfirmationItem ID / status / 内容
- 顧客・提供会社表示名
- prompt / policy version
- Report version / content version / canonical content hash
- 承認者 / 承認日時

承認前に最新のHUMAN_APPROVED Contextとのhash一致と全blockのGroundingを再検証する。再発行は理由を記録し、新Report versionでREPORT_REVIEW_REQUIREDへ進む。過去の承認済み本文・snapshotは、後のInsight Supersedeでも変わらない。

## 8. Report state transition

`REPORT_REVIEW_REQUIRED → ApproveReport → REPORT_APPROVED → MarkReportDelivered → FEEDBACK_PENDING → StartFeedback / RecordFeedbackStatement → CompleteFeedback → FEEDBACK_COMPLETED`

状態遷移はスタッフの明示commandのみ。AI成功でCase state / versionは変わらない。楽観ロックとCase row lockで競合を拒否し、Audit障害時はtransactionをrollbackする。

## 9. Feedback SourceRecord behavior

開始後の顧客発言を`FEEDBACK_STATEMENT`として改行・前後空白を含め原文保存する。話者は任意で、入力スタッフ・時刻・対象Report・任意の親Sourceを追跡できる。話者・親Sourceは同じCaseに限定する。

FeedbackからFACT / Insightを生成せず、Reportを更新しない。UNKNOWNを強制補完しない。Humanが開始していれば発言件数0でも完了できる。再発行後も旧Feedbackの対象Report参照と原文を保持する。

## 10. Tests and results

2026-09-13、ローカルのdisposable PGlite PostgreSQLと実Express HTTP、Chromiumで実行した。

| Command | Result |
|---|---|
| `npm install` (`npm.cmd install`) | 成功、dependency変更なし |
| `npm run build` | 成功 |
| `npm run test:kaizen` | 12 pass / 1 skip |
| `npm run test:diagnosis` | 13 pass |
| `npm run test:preparation` | 11 pass / 1 skip |
| `npm run test:workspace` | 14 pass / 1 skip |
| `npm run test:review` | 15 pass / 1 skip |
| `npm run test:report` | 13 pass |
| `npm run test:diagnosis:browser` | desktop / mobile合計26 pass（Slice 1〜5） |
| Slice 5 browser再確認 | 6 pass |
| `git diff --check` / staged diff check | 成功 |

既存4件のskipは外部AI live試験の明示opt-in / API key未設定によるもの。AI-04もlive Providerへの通信は行わず、deterministic Provider、失敗・timeout・未設定をテストした。

新Golden Testsはdocs/30の26項目を12シナリオにまとめ、追加1件で英数字の意味変化と承認前のContext失効を確認する。queue分離、遅延結果、再発行、DB直接更新拒否、Audit failure rollback、0 Insight / 0 Feedbackも含む。

## 11. Browser / manual verification

PC / Pixel 7相当の両方で次を操作し、保存結果まで確認した。

- 案件概要 / Human ReviewからO-06への導線
- AI Draft、Insight trace、敬体編集、Human承認、送付記録、Feedback完了
- AI失敗時の手動Draft、意味変更拒否、Human Reviewへ戻す操作、Supersede、再生成
- 新版の再発行、過去版選択、旧snapshot保持
- AI再生成時の最新版選択、承認後の編集不可
- 顧客表示`ABC株式会社様`、提供会社`atLIB株式会社`、SURVEY_STATED表示
- 完了後のSurveyページ、管理一覧のFeedback完了フィルター
- 印刷表示で操作UIが隠れ、5sectionが残ること

生成スクリーンショットを目視確認し、PCのGrounding表示・印刷とモバイルのFeedbackを確認した。横はみ出し・pageerrorなし。タブ選択表示を修正し、印刷にも版・本文version・承認状態を追加した。

画像は`test-results/diagnosis/`内の`report-grounded-draft.png`、`report-print.png`、`feedback-completed.png`、`report-reissue-history.png`。再実行で生成されるためgitには含めない。本番Googleログイン、外部AI live、実顧客への送付、物理プリンターは操作していない。

## 12. Remaining issues

Slice 5の実装・ローカル検証に未完了項目はない。レビュー後の本番migration / デプロイ / live AI疎通は未実施。通常wordingは検証できる変換に限定し、自由な言い換えはHuman Reviewを経由する。メール自動送信・Assessment lifecycle / Handoff / FACTACTは今回の範囲外。

## 13. Canonical deviations

None. Business message / 価格 / 無料診断とAssessmentの境界、Survey v2質問文、legacy資産は変更していない。

## 14. Latest commit SHA

この文書を含むfeature branchのcommit SHAを最終応答で報告する。commitに自己参照SHAは埋め込まない。`git rev-parse HEAD`と`git ls-remote origin refs/heads/feat/it-management-diagnosis-slice5`の一致・clean worktreeを確認してレビュー待ちとし、mainへmergeしない。
