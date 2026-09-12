# 無料 IT経営診断 Slice 3 — 実装・検証記録

## 1. Summary

60分診断Workspace、Raw SourceRecord、明示操作によるFuture再確認、AI-02 Interview Assistantを追加した。

- 実装基準：`atlib-sales-tools/main` = `00500a14311901a9afa47db76bb16ea77a78093d`
- Feature branch：`feat/it-management-diagnosis-slice3`
- 設計SSOT：`git_KAIZEN/main` = `de9cf7e23ea3b9bfbe68195ba134fc3b034abc8d`
- 実装正本：`docs/28-free-it-management-diagnosis-slice3-codex-implementation-handoff-v1.md`

docs/17〜27の無料診断関連文書は既読版との変更を確認した。docs/20のv1.1更新はFACTACTの作用・Human Decision責任の明確化であり、無料診断のEvidence境界は維持されている。docs/28を確認して実装した。SSOT repositoryの変更はない。

完成地点はHuman StartによるDIAGNOSIS_IN_PROGRESSから、Human FinishによるHUMAN_REVIEW_REQUIREDまで。AI-03、DiagnosisInsight、Human Review画面、Report、Assessment、FACTACT連携は追加していない。

## 2. Files changed / reuse

| 区分 | ファイル |
|---|---|
| 新migration | `migrations/009_it_management_diagnosis_workspace.sql` |
| Source / AI-02 contract | `src/domain/diagnosisWorkspace.ts` |
| Case status / Next Action | `src/domain/itManagementDiagnosis.ts` |
| Human commands / read model | `src/services/diagnosisWorkspaceRepo.ts` |
| Context Builder | `src/services/interviewAssistantContext.ts` |
| Provider Adapter | `src/services/interviewAssistantProvider.ts` |
| Worker | `src/services/interviewAssistantWorker.ts` |
| 既存queueのprocess分離 | `src/services/diagnosisPreparationRepo.ts` |
| API / 既存Gateへの接続 | `src/routes/diagnosisWorkspace.ts`, `src/routes/adminItManagementDiagnosis.ts`, `src/server.ts` |
| O-04 UI | `public/admin/it-management-diagnosis-workspace.html`, `public/js/it-management-diagnosis-workspace.js`, `public/css/diagnosis-workspace.css` |
| 一覧・概要・Preparationからの導線 | `public/admin/it-management-diagnosis.html`, `public/admin/it-management-diagnosis-detail.html`, `public/admin/it-management-diagnosis-preparation.html`, `public/js/it-management-diagnosis-admin.js`, `public/js/it-management-diagnosis-preparation.js` |
| Golden Tests | `test/diagnosisWorkspace.golden.test.ts` |
| Browser Tests | `test/diagnosisWorkspace.browser.test.ts`, `test/diagnosis.playwright.config.ts` |
| Test harness / fake provider | `test/support/diagnosisHarness.ts`, `test/support/workspaceFixtures.ts` |
| 回帰期待値更新 | `test/itManagementDiagnosis.golden.test.ts`, `test/diagnosisPreparation.golden.test.ts` |
| test command | `package.json` |
| 引継ぎ | 本文書 |

既存Express/TypeScript/PostgreSQL、Google Workspace staff認証、Rate Limit、command-header/cross-site Gate、error handler、管理CSS、会社名表示関数を再利用した。新runtime dependencyはない。

Slice 2のDB queue、SKIP LOCKED、lease、timeout/recovery、固定failure code、structured JSON + Zod、Provider Adapter、transaction/Case row lock/Auditの方式を再利用した。共通queueはprocess_typeでclaim/recoveryを分離した。Preparationの読み取り・採用対象もAI-01へ限定し、AI-02質問選択をPreparation採用へ混入させない。

旧Golden Testの「SourceRecordテーブルがない」という期待は、新設テーブルと両立する「Survey/AI-01からSourceRecordが生成されない」に変更した。旧API・legacy table・migration 001〜008の差分はない。

## 3. Persistence / migration

009で`source_records`を新設する。Caseの状態CHECKとAIExecutionのprocess_type CHECKを拡張する。既存データの削除・変換はない。

SourceRecordの話者・親SourceはCaseを含む複合FKで同じCaseに限定する。`ai_proposal_sources`と`diagnosis_futures`の出典はSURVEY_RESPONSE / SOURCE_RECORDの2種を許可し、種別ごとのgenerated columnと複合FKで実在・Case一致を保証する。既存Survey出典を保持する。Futureに`previous_future_id`と同じCaseのFKを追加する。

既存runnerはmigrationごとにtransactionを使用する。009を適用後に新アプリを起動する。本番migration・deployは今回未実施。

## 4. SourceRecord boundary

- INTERVIEW_STATEMENT：顧客の発言。話者は任意指定。
- OPERATOR_NOTE：担当者のメモ。顧客話者を指定した入力を拒否。
- TRANSCRIPT：貼付原文。切り出した顧客発言から親IDを参照可能。
- SCREEN_SHARED_INFORMATION：画面共有のRaw情報を記録するAPI。
- DOCUMENT_EXISTENCE_OBSERVED：自発的に提示されたEvidenceの存在観察。

空白・改行を含む原文を保持し、trim・AI要約への置換・意味分類を行わない。更新/削除APIはない。SurveyResponseを複製しない。FACT / Observation / Hypothesis / DiagnosisInsightをSource保存から生成しない。

## 5. Diagnosis state transition

```text
READY_FOR_DIAGNOSIS
  -- StartDiagnosis (Human) --> DIAGNOSIS_IN_PROGRESS
  -- FinishDiagnosis (Human, from IN_PROGRESS) --> HUMAN_REVIEW_REQUIRED
```

開始時はHuman確定済みPlan snapshot・確定者・確定日時を要求する。開始・終了はCase row lock、state、expectedVersion、staff actorを検証する。開始・終了日時、CaseTransition、AuditLogを同一transactionで記録する。

終了時は質問数・経過60分・UNKNOWN解消・AI実行・全候補判断・Future再確認を要求しない。終了後の記録追加・候補判断は409。Surveyの完了表示は継続する。

## 6. Future reconfirm behavior

Workspaceを開く・顧客発言を保存する・AIを実行するだけでは再確認しない。Humanが元となる同じCaseの顧客発言またはTranscriptとFutureを指定し、明示commandを実行する。

旧Futureの本文・versionを保持し、新versionにINTERVIEW_RECONFIRMED、前Future ID、Source ID、再確認者・日時を保存する。担当者メモだけを再確認の出典にする入力は拒否する。SURVEY_STATEDのまま診断終了可能。

## 7. AI-02 Provider / schema / source validation

既存Anthropic SDK / API key設定 / model `claude-sonnet-5`を再利用した。Provider未設定ならAI_NOT_CONFIGUREDとなりHuman-onlyで継続できる。

Context BuilderはFuture、確定Planの業務field、現行Theme/Plan、Raw SurveyResponse、直近Source、参照価値のあるPreparation UNKNOWN/Hypothesis、直近AI-02判断を選択する。staff principalや連絡先、token、cookie、legacy評価を選択しない。

- Sourceは直近20件、各2000文字の原文抜粋。全文はDBに保持し、抜粋はis_excerptを付ける。
- Theme/Plan/snapshotは各100件まで。
- Preparation UNKNOWN/Hypothesisは10件まで。REJECTEDを除外。
- AI-02の直近候補は10件まで。Ask/Later/Unnecessaryを含み重複防止に利用。
- 顧客発言・Survey・Transcript・メモ・Plan・過去提案をすべてuntrusted inputとして独立system promptで扱う。

Structured schemaは0〜5候補、FOLLOW_UP / CLARIFY / CHECK_UNKNOWN / CHECK_CONTRADICTION / NEW_THEMEに限定する。全objectで追加fieldを拒否する。出典は実際に入力した同じCaseのSurveyResponse/SourceRecord、Theme参照は同じCaseのACTIVE Themeに限定する。保存時もThemeの有効性とDB FKを確認する。

FACT、CONFIRMED_FACT、score、maturity、rating、final_root_cause、System metadata、Evidence評価field、service recommendation fieldを許可しない。明示的な断定・Evidence評価・導入推薦表現も拒否guardで検査する。自由文の意味を網羅的に保証するものではなく、必ずHumanが質問候補を判断する。

Human requestだけがPENDING Executionを生成する。Provider呼出しはDB transaction外。timeout60秒、worker上限65秒、lease2分、5秒間隔の既存方式で処理する。中断はFAILED、retryは別Execution。AI成功だけではCase version/state、Theme、Plan、SourceRecord、Futureを変えない。終了後に届いた結果はCASE_STATE_CHANGEDで失敗記録し、Proposalも新設しない。

## 8. Human resolution behavior

| Action | AIProposal status | 意味 |
|---|---|---|
| ASK | ACCEPTED | 担当者が質問することを選択 |
| LATER | UNDER_REVIEW | 後で確認する候補として保持 |
| UNNECESSARY | REJECTED | 今回は不要と判断 |

判断前とLaterから操作可能。Ask/Unnecessary後の二重判断は409。AI原文を上書きしない。判断者・日時・前後statusをAuditへ記録しUIで表示する。AskだけでTheme/Plan/SourceRecord/Insightを作らない。NEW_THEMEを扱いたい場合は、独立したHuman入力フォーム/APIでTheme/Planを追加できる。準備時の確定snapshotを変更しない。

## 9. Evidence existence boundary

Evidence存在APIは`voluntarily_presented: true`を要求する。存在の原文記録のみ。accuracy/currentness/validity/verified/sufficient等の評価fieldは422。提出依頼・upload・OCR・分析・Evidence評価結果の生成はない。UIは存在と内容評価を明確に区別する。

## 10. Tests and results

| Command | 結果 |
|---|---|
| `npm.cmd install` | 成功、新dependencyなし |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:kaizen` | 12成功、AI live 1 skip |
| `npm.cmd run test:diagnosis` | 13成功 |
| `npm.cmd run test:preparation` | 11成功、AI live 1 skip |
| `npm.cmd run test:workspace` | 14成功、AI live 1 skip |
| `npm.cmd run test:diagnosis:browser` | 16成功（desktop/mobile各8） |
| `npm.cmd run test:diagnosis:browser -- --grep Workspace` | 最終UI変更後のSlice 3再確認、6成功 |
| `git diff --check` / staged diff check | 成功 |

Golden Testsはdocs/28の26項目を複数assertionで網羅する。追加で監査障害時のSource/Future/判断/終了rollback、実在する別Caseの出典・Theme拒否、process分離、queue重複・中断・遅延結果、Context上限、native schema/Zod整合を検証した。

Test DBはPGliteの使い捨てWASM PostgreSQL。実SQL/CHECK/FK/transactionを実行する。単一接続adapterであり、実PostgreSQL複数接続競合の検証は別途必要。

## 11. Browser / manual verification

Chromiumの実HTTP・既存staff認証middleware・Test DB・deterministic fake providerで確認：

1. Case概要からWorkspaceへ移動、Human開始。
2. 顧客発言・担当者メモの分離保存。
3. AI実行、出典の原文・source type表示、Ask/Later/Unnecessary。
4. UNKNOWN/Later/未判断を残したまま診断終了。
5. Transcriptから顧客発言の親参照、Future再確認と履歴表示。
6. 自発的Evidence存在記録、Human Theme/Plan追加。
7. AI failure後も記録追加・終了可能。
8. 終了後も顧客Survey完了表示を維持。
9. desktop/mobileの表示、横方向overflowなし。生成画面画像を目視確認。

実Google OAuthログイン、実Anthropic、実顧客との60分セッションは未実施。

## 12. Remaining issues

- 本番migration/deploy、実AI接続、複数接続PostgreSQL・複数instanceでの競合試験は未実施。
- 既存Slice 2と同様、リクエスト外workerを動かす本番設定が必要。Cloud Runのinstance-based billing/minimum instance設定は今回変更していない（Slice 2実装記録参照）。
- AI liveは明示opt-inとAPI keyがないためskip。テストは外部顧客データを送信していない。
- Transcriptは手動貼付、1記録20000文字まで。リアルタイム音声や会議連携は対象外。
- 自由文の意味判定はschema/拒否guardだけでは完全に保証できない。AIは質問候補まで、Human判断を維持する。

## 13. Canonical deviations

None.

## 14. Latest commit SHA

この文書を含むfeature branchの最新commitを`git log -1 --format=%H`で確認する。完了報告にremoteと一致したSHAを記載する。mainへmergeせずレビュー待ちとする。
