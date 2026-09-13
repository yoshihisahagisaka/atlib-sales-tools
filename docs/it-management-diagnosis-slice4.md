# 無料 IT経営診断 Slice 4 — 実装・検証記録

## 1. Summary

AI-03 Post-Diagnosis Structuring、DiagnosisInsight、Human Review、AssessmentConfirmationItemを追加した。完成地点はHumanによるReview完了とREPORT_REVIEW_REQUIREDへの遷移。

- Base：`atlib-sales-tools/main` = `4132f6ad6b5f50cf7622dd6cc2cc44af6a9efe37`
- Feature branch：`feat/it-management-diagnosis-slice4`
- SSOT：`git_KAIZEN/main` = `47081a97aa45e1c9eff86c135c963edc9fcfd6dc`
- 実装正本：`docs/29-free-it-management-diagnosis-slice4-codex-implementation-handoff-v1.md`

無料診断関連docs/17〜28は既読SSOT `de9cf7e`から変更がないことを確認し、docs/29を読了して実装した。SSOT repository自体は変更していない。

AIProposal、Human Approved Insight、Raw Source、Assessmentで次に確認する項目を分離した。AI-03が成功しただけではCase状態・versionやInsightを変更しない。Human ApprovedはFACTを意味しない。

## 2. Files changed / reuse

| 区分 | ファイル |
|---|---|
| Migration | `migrations/010_it_management_diagnosis_human_review.sql` |
| Domain / schema | `src/domain/diagnosisReview.ts` |
| Case status / Next Action | `src/domain/itManagementDiagnosis.ts` |
| Review commands / read models | `src/services/diagnosisReviewRepo.ts` |
| AI Context Builder | `src/services/postDiagnosisContext.ts` |
| AI Provider | `src/services/postDiagnosisProvider.ts` |
| Worker | `src/services/postDiagnosisWorker.ts` |
| API / Gate / 起動処理 | `src/routes/diagnosisReview.ts`, `src/routes/adminItManagementDiagnosis.ts`, `src/server.ts` |
| O-05 UI | `public/admin/it-management-diagnosis-review.html`, `public/js/it-management-diagnosis-review.js`, `public/css/diagnosis-review.css` |
| 既存画面の導線 / 状態表示 | `public/admin/it-management-diagnosis-detail.html`, `public/admin/it-management-diagnosis-workspace.html`, `public/admin/it-management-diagnosis.html`, `public/js/it-management-diagnosis-admin.js`, `public/js/it-management-diagnosis-workspace.js`, `public/js/it-management-diagnosis-preparation.js` |
| Golden Tests | `test/diagnosisReview.golden.test.ts` |
| Browser Tests | `test/diagnosisReview.browser.test.ts`, `test/diagnosis.playwright.config.ts` |
| Test harness / fixture | `test/support/diagnosisHarness.ts`, `test/support/reviewFixtures.ts` |
| 回帰期待値 | `test/itManagementDiagnosis.golden.test.ts`, `test/diagnosisPreparation.golden.test.ts`, `test/diagnosisWorkspace.golden.test.ts` |
| test command | `package.json` |
| 引継ぎ | 本文書 |

既存Express/TypeScript/PostgreSQL、Google Workspace認証、admin rate limit、command-header/cross-site Gate、error handler、Case lock/version/Audit、管理CSSを再利用した。新runtime dependencyはない。

AIExecutionの既存persisted queue/lease/recoveryを再利用し、AI-03だけをclaimするWorkerを追加した。Providerは既存Anthropic SDK/API key/modelを使用する。Contextは既存の上限付きRaw Context whitelistを再利用し、Review結果は入力に含めない。

既存Golden Testsの「Insightテーブル自体が存在しない」という期待は、新設テーブルと両立する「Survey/AI-01/AI-02からInsightを生成しない」へ更新した。legacy API/table、migration 001〜009、Survey v2質問文は変更していない。

## 3. Persistence / migration

010で4テーブルを新設：

- `diagnosis_insights`
- `insight_sources`
- `human_reviews`
- `assessment_confirmation_items`

Caseの状態CHECK、AIExecution process_type、AIProposal proposal_typeの許可値を拡張し、CaseにReview完了者・完了日時を追加した。既存データの削除・意味変換はない。

Insight出典はSurveyResponse/SourceRecordの2種。generated typed keyと複合FKで同じCaseの実在Sourceを保証する。Theme、前Insight、元Proposal、Assessment関連Insight、HumanReview対象もCaseを含むFKを持つ。Supersedeの前Insight IDはuniqueで、複数の置換先を作らない。

既存migration runnerのtransactionで010を適用後、新アプリを起動する。本番DBへの適用は今回未実施。

## 4. AI-03 Provider / schema / context validation

Providerは既存`claude-sonnet-5`、Anthropic API key設定、native JSON Schema + Zodの方式を使用する。API key未設定はAI_NOT_CONFIGUREDとして失敗を記録し、Human-only操作を継続できる。

`buildPostDiagnosisContext()`にはCurrent Future、Human確定Plan snapshot、現行Theme/Plan、Raw SurveyResponse、SourceRecord、必要最小限のAI-02候補/判断、Preparation UNKNOWN/Hypothesisを含める。REJECTEDのAI-02候補は除外する。Raw Sourceと過去提案をすべてuntrusted contentとして扱う。secret/token/cookie、連絡先、staff principal、legacy評価、FACTACT data、既存Human Review Insightは入力に含めない。

上限はSlice 3の方式を継承：Source直近20件・各2000文字、Theme/Plan各100件、Preparation UNKNOWN/HypothesisとAI-02候補各10件。原文はDBへ全文保持し、切り詰めたSourceは`is_excerpt`を保持する。

AI outputはInsight候補0〜30件とAssessment確認候補0〜20件を別collectionにする。UNKNOWNにはunknown_typeを必須とし、他のtypeではnullにする。出典は送信Contextに含めた実在Source、Themeは同じCaseのACTIVE Theme。Assessment候補の関連indexは実在Insight候補indexまたはnull。

全objectで追加fieldを拒否する。FACT/CONFIRMED_FACT/DECISION、score/maturity/rating、System metadata、Evidence評価fieldはschemaにない。明示的な原因確定・実行決定・Evidence評価表現は拒否guardでも確認する。Area/Improvement Lensはタグであり点数にしない。

Human requestだけがPENDING Executionを作る。Provider呼出しはtransaction外。timeout60秒、Worker上限65秒、lease2分、5秒間隔のqueue処理を再利用する。中断はFAILED、再実行は別Execution。Review完了後に届いたAI結果はCASE_STATE_CHANGEDとして記録し、新Proposalも作らない。

## 5. DiagnosisInsight semantics

許可する意味区分はOBSERVATION / UNKNOWN / HYPOTHESIS / GAP_CANDIDATE / ROOT_CAUSE_HYPOTHESIS / KAIZEN_DIRECTION / EVIDENCE_CANDIDATEのみ。DB CHECKと入力schemaの両方で制限する。FACT / CONFIRMED_FACT / DECISIONは追加していない。

UNKNOWNはNOT_YET_CONFIRMED / UNRESOLVED / CONTRADICTORY / NOT_REQUIRED_NOWのいずれかを保持する。HUMAN_APPROVEDとsemantic_typeは別fieldであり、承認後もHypothesisはHypothesisのまま。

Report用`GET .../review/approved-context`はHUMAN_APPROVEDのInsightだけを返す。DRAFT / REJECTED / SUPERSEDED、未承認Proposal、Raw Source本文をReport Contextとして返さない。Futureはintent statusをそのまま保持する。Report本体は生成しない。

## 6. Human Review behavior

- Approve：元semanticを維持したHUMAN_APPROVED Insightと出典参照を作成。
- Edit & Approve：編集結果を新Insightとして保存。AI originalは変更しない。許可list内で意味区分変更可能。
- Convert to UNKNOWN：元AIProposalを残し、明示したunknown_typeを持つUNKNOWN Insightを作成。原文の内容を保持し、判断理由をHumanReviewへ記録。
- Reject：ProposalをREJECTEDにし、Insightを作らない。
- CreateHumanInsight：AIなしで、出典を1件以上指定しHUMAN_APPROVED Insightを作成。
- Supersede：旧本文・出典・versionを残し、旧statusをSUPERSEDEDにして別record/versionの置換先を作成。再置換の二重実行を拒否。

すべてstaff actor、Case row lock、HUMAN_REVIEW_REQUIREDの状態を確認する。元/変更後情報、判断理由、判断者・日時をHumanReviewへ記録しAuditも残す。承認済み/却下済みProposalの二重判断は409。

Human新規作成・編集承認・Supersede APIのpayloadは`{ insight: ..., reason: ... }`。Review完了後の編集は409で拒否する。

## 7. AssessmentConfirmationItem behavior

AI確認候補は検証済みAIExecution raw outputの別collectionとして保持する。AIProposal semantic typeにもDiagnosisInsightにも混在させない。

Humanが候補を編集して採用、または独自入力すると専用Entityへ保存する。優先順は1〜5、statusはOPEN。任意で同じCaseのHUMAN_APPROVED Insight/Evidence Candidateと関連づける。元execution/indexを保持し、同じ候補の二重採用を拒否する。元候補と採用内容はHumanReviewで追跡可能。

Assessment proposal/sales lifecycle、Handoffは変更しない。

## 8. State transition

```text
HUMAN_REVIEW_REQUIRED -- AI-03 success --> HUMAN_REVIEW_REQUIRED
HUMAN_REVIEW_REQUIRED -- CompleteHumanReview (Human) --> REPORT_REVIEW_REQUIRED
```

完了時はexpectedVersionを検証し、完了者・日時、CaseTransition、Auditを同じtransactionで記録する。Reportで利用する予定の情報はHUMAN_APPROVED一覧で確認する。

未処理Proposal/Assessment候補/実行中AIを残す場合、Humanが`leave_unreviewed: true`を明示する。残したIDをAuditへ記録する。UNKNOWN解消、Insight件数、AI成功、Future再確認は完了条件にしない。Insightが0件でもHumanの完了操作は可能。

## 9. Evidence boundary

Evidence存在Observationは存在確認まで。Human Review UI/APIに正確性・最新性・妥当性を承認するfieldはない。Evidence内容を評価した断定表現を拒否guardで確認する。Assessment確認項目には、Assessmentで今後何を確認するかを記述できる。

Raw Source・SurveyResponseは更新しない。Evidenceのupload/OCR/収集/内容分析、Confirmed Fact生成は追加していない。

## 10. Tests and results

| Command | 結果 |
|---|---|
| `npm.cmd install` | 成功、新dependencyなし |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:kaizen` | 12成功、AI live 1 skip |
| `npm.cmd run test:diagnosis` | 13成功 |
| `npm.cmd run test:preparation` | 11成功、AI live 1 skip |
| `npm.cmd run test:workspace` | 14成功、AI live 1 skip |
| `npm.cmd run test:review` | 15成功、AI live 1 skip |
| `npm.cmd run test:diagnosis:browser` | 20成功（desktop/mobile各10） |
| `git diff --check` / staged diff check | 成功 |

docs/29のGolden項目1〜28を複数assertionで確認した。追加で承認/Supersede/完了の監査障害rollback、未処理候補を残す明示操作、Worker中断・timeout・遅延結果、禁止semanticのDB直接更新拒否、Human Review結果のAI Context除外を検証した。

PGliteの使い捨てWASM PostgreSQLで実SQL/CHECK/FK/transactionを実行した。単一接続adapterのため、実PostgreSQL複数接続での競合試験は別途必要。

## 11. Browser / manual verification

Chromium、実HTTP、既存staff認証middleware、Test DB、deterministic fake providerで次を確認した：

1. 60分診断画面からHuman Reviewへ移動。
2. 会社名の敬称・提供会社名・Future status・Next Action表示。
3. AI実行後もInsight未生成、Case状態不変。
4. Raw Source確認、承認・編集承認・UNKNOWN変換・却下。
5. Assessment確認候補のHuman作成。
6. 未処理候補を残してReview完了。
7. AI failure後のHuman-only UNKNOWN作成と完了。
8. Supersedeの旧本文・新version表示、Report Contextの旧Insight除外。
9. 完了後の編集停止、顧客Survey完了表示継続。

desktop/mobile双方が成功し、横方向overflowがないことと生成画面画像を確認した。実Google OAuth、実Anthropic、実顧客によるReviewは未実施。

## 12. Remaining issues

- 本番migration/deploy、実AI/API key/model利用権限、実Google OAuth、複数接続PostgreSQL/複数instanceの検証は未実施。
- AI liveは明示opt-in/API key未設定のためskip。テストから外部へ顧客データを送信していない。
- 既存Slice 2/3と同様、リクエスト外workerを動かす本番設定が必要。Cloud Runの稼働設定は今回変更していない。
- 自由文の意味をschema/拒否guardだけで完全には保証できない。HumanがRaw Sourceを確認して判断する。
- Report本文・AI-04・Feedback・Assessment lifecycle/Handoff・FACTACT連携は対象外。

## 13. Canonical deviations

None.

## 14. Latest commit SHA

この文書を含むfeature branchの最新commitは`git log -1 --format=%H`で確認する。完了報告にremoteと一致したSHAを記載する。mainへmergeせずレビュー待ちとする。
