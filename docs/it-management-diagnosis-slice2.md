# 無料 IT経営診断 Slice 2 — 実装・検証記録

## 1. Summary

Slice 1の完了済みSurvey v2を入力とするAI-01事前整理と、担当者が診断Planを確定するPreparationを追加した。

基準：`atlib-sales-tools/main` = `6c856d5b09a762f1a9e700afa9fcbf115683ec08`。ブランチは`feat/it-management-diagnosis-slice2`。

設計SSOT：`git_KAIZEN/main` = `356078d`。指定文書17〜24は既読版`024360d`から差分がないことを確認し、文書26・27を読了。実装指示書は文書27。Survey v2の正式定義は文書26を固定snapshotとしてテストに取り込んだ。

AI生成の到達点はAIProposalのみ。Caseの状態、正式Theme、正式Plan ItemをAI単独では生成・変更しない。AIが未設定・失敗した場合も、担当者がThemeと確認項目を作成し、診断Planを確定できる。

## 2. Files changed

| 区分 | ファイル |
|---|---|
| 新migration | `migrations/008_it_management_diagnosis_preparation.sql` |
| AI output / Human input定義 | `src/domain/diagnosisPreparation.ts` |
| 状態・Next Action・Survey状態projection | `src/domain/itManagementDiagnosis.ts`, `src/services/itManagementDiagnosisRepo.ts` |
| Preparation repository / Commands | `src/services/diagnosisPreparationRepo.ts` |
| Context Builder | `src/services/preDiagnosisContext.ts` |
| Provider Adapter / prompt | `src/services/preDiagnosisProvider.ts` |
| 非同期worker | `src/services/preDiagnosisWorker.ts` |
| API / 認証Gate接続 | `src/routes/diagnosisPreparation.ts`, `src/routes/adminItManagementDiagnosis.ts` |
| bootstrap / worker起動 | `src/server.ts` |
| 新Preparation UI | `public/admin/it-management-diagnosis-preparation.html`, `public/js/it-management-diagnosis-preparation.js` |
| 一覧・概要からの導線 | `public/admin/it-management-diagnosis.html`, `public/admin/it-management-diagnosis-detail.html`, `public/js/it-management-diagnosis-admin.js` |
| Preparation以降も顧客Survey完了表示 | `public/js/it-management-diagnosis-survey.js` |
| Golden Tests | `test/diagnosisPreparation.golden.test.ts` |
| browser tests | `test/diagnosisPreparation.browser.test.ts`, `test/itManagementDiagnosis.browser.test.ts`, `test/diagnosis.playwright.config.ts` |
| test harness / fake provider | `test/support/diagnosisHarness.ts`, `test/support/preparationFixtures.ts` |
| Survey v2 SSOT snapshot | `test/fixtures/diagnosisSurveyV2Canonical.json` |
| test command | `package.json` |
| 引継ぎ | 本文書 |

## 3. Persistence / migration

008で追加する5テーブル：

- `ai_executions`
- `ai_proposals`
- `ai_proposal_sources`
- `diagnosis_themes`
- `diagnosis_plan_items`

既存Diagnosis Domainの`diagnosis_cases`にPlan確定者・日時・snapshot、`diagnosis_audit_logs`にcommand detailを追加する。新たな万能Fact／SourceRecord／Insightテーブルは作らない。

Case状態CHECKは従来の3状態を維持し、`PREPARATION_IN_PROGRESS`と`READY_FOR_DIAGNOSIS`を追加する。既存migration 001〜007を変更しない。legacy table/APIも変更しない。

すべてのHuman commandはCase row lock内で、状態・対象Case・認証actorを検証する。採用／編集／却下／削除／順序変更をAuditに記録する。採用時のAudit失敗はproposal stateとdownstream作成を同時rollbackする。

Proposalとsource、Theme／Planと元ProposalにはCaseを含むFKを置く。他CaseのProposal・回答・Themeを流用できない。回答はSurveyResponseのIDを参照し、SourceRecordへ複製しない。

Themeの配下情報はQUESTION／UNKNOWN／HYPOTHESIS／EVIDENCE_CANDIDATEとして独立したAIProposalにも保存する。親Themeの出典を子提案へ関連情報（RELATED）として継承する。Theme採用だけではこれらのPlan Itemを採用しない。

## 4. AI Provider Adapter / schema

`AIProvider` interfaceによりProvider呼出しを分離。既存Anthropic SDK、既存`config.aiAssist.anthropicApiKey`、既存アプリのモデル`claude-sonnet-5`を再利用する。新しいruntime dependencyはない。

`buildPreDiagnosisContext`は以下だけを明示的にSELECTする：

- 会社表示名、entry channel
- Current Futureのstatement、intent status、time horizon
- DBに固定したSurvey v2 question definitions
- 同CaseのRaw SurveyResponseとsource ID

連絡先・staff identity・access token・cookie・legacy score・legacy診断・FACTACT dataは渡さない。質問文と顧客回答を含む入力全体をuntrusted dataとしてJSONにまとめ、独立したsystem promptに責任境界を置く。

Structured JSON Schemaは全objectで`additionalProperties: false`。同じ構造をzodで厳密検証し、Theme数1〜5、文字数、配列数、source UUID、同Caseに存在するsource IDまで検証する。System metadataはAIに作らせない。

FACT／CONFIRMED_FACT、score／maturity／rating、final_root_cause、未知のfield、source不整合、UNKNOWN type欠落、Evidence内容評価を拒否する。文面上の明白な原因断定・製品導入指示も拒否する。これは出力の拒否guardであり、顧客へのルール式診断やwarningを生成する機能ではない。自由文の意味を完全に保証するものではないため、Human Gateを必須としている。

### 非同期実行と復旧

- `POST .../preparation/ai/run`はPENDING Executionと入力snapshotをtransactionで保存して202を返す。
- Workerは`FOR UPDATE SKIP LOCKED`で1件をclaimし、RUNNINGにしてからtransaction外でAIを呼ぶ。1プロセスの同時実行は1件。
- Provider timeoutは60秒、worker timeoutは65秒。worker leaseは2分。サーバー起動時と5秒間隔でqueueを確認する。
- Provider成功後にschemaとsourceを検証し、Proposal一式とSUCCEEDEDを同一transactionで保存する。
- 失敗はFAILED＋固定error code。入力snapshot／AI原出力は監査用DBへ保存し、通常ログには出さない。
- worker中断でleaseが切れた実行は`AI_WORKER_INTERRUPTED`でFAILEDにする。担当者の再実行は新Executionであり、旧履歴を上書きしない。
- CaseごとにPENDING／RUNNINGを1件へ制限。完了済み実行の再実行はSURVEY_COMPLETED／PREPARATION_IN_PROGRESSで可能。
- AI実行中にHuman-only Planを確定した場合、遅れて届いたAI結果は`CASE_STATE_CHANGED`で記録し、確定Planや新Proposalを書き換えない。

## 5. Human Gate implementation

既存Google Workspace認証、admin Rate Limit、`X-Diagnosis-Command: 1`、cross-site拒否をそのまま適用。customer access tokenではPreparation APIを使用できない。

担当者は準備開始後、各提案を採用・編集採用・却下できる。編集採用後も元AIProposalの`content_json`とExecutionのraw outputを保持する。却下済み・採用済みProposalの再採用は409。

採用時のmapping：THEME→DiagnosisTheme、QUESTION→QUESTION Plan Item、UNKNOWN／HYPOTHESIS→CONFIRMATION Plan Item、EVIDENCE_CANDIDATE→EVIDENCE_CANDIDATE_CHECK。UNKNOWNやHypothesisを解消・FACT化する意味はない。元Proposalとsourceを追跡できる。

担当者による独自Theme／Plan Item、編集、削除（REMOVED）、順序変更を実装。AI由来Plan Itemの意味区分は編集で変換できない。Theme削除時に有効な関連Plan Itemがあれば移動／削除を先に要求する。

Confirmは有効Themeと有効Plan Itemを各1件以上要求する。UIが確認したCase versionとDB versionが一致することを検証し、他の担当者の更新を見ずに確定する操作は409。確定者・日時・Plan snapshotを保存し、確定後のPreparation編集を拒否する。

## 6. State transition implementation

```text
SURVEY_COMPLETED --Run AI-01--> SURVEY_COMPLETED
SURVEY_COMPLETED --StartDiagnosisPreparation (Human)--> PREPARATION_IN_PROGRESS
PREPARATION_IN_PROGRESS --ConfirmDiagnosisPlan (Human)--> READY_FOR_DIAGNOSIS
```

AI失敗・成功をCase business stateにしない。Human transitionはCaseTransitionとAuditに記録する。Assessment statusは独立した`NOT_PROPOSED`を維持し、Futureは`SURVEY_STATED`のままで準備・確定できる。

Next Actionは文書27に合わせて状態から導出する。Preparation以降もSurvey状態は`SURVEY_COMPLETED`としてprojectionし、顧客の再開画面や旧代理入力画面で完了済み回答を編集可能に見せない。

## 7. Tests and results

Windowsでは同じnpm CLIの`npm.cmd`を使用した。

| Command | 結果 |
|---|---|
| `npm.cmd install` | 成功 |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:kaizen` | 12成功、1 skip（既存AIライブ：APIキー未設定） |
| `npm.cmd run test:diagnosis` | 13成功 |
| `npm.cmd run test:preparation` | 11成功、1 skip（AIライブ：明示opt-in／APIキー未設定） |
| `npm.cmd run test:diagnosis:browser` | 10成功（desktop/mobile各5、Slice 1/2の回帰を含む） |
| `git diff --check` | 成功 |

PGliteの使い捨てDBに005・007・008を実際に適用。SQL、CHECK/FK、transaction、障害triggerによるrollbackを検証した。実行／採用／編集採用／却下／手動追加／並替／確定、他Case参照拒否、auth、customer token拒否、出力schema不正、source不正、Evidence境界、未実行／失敗からのHuman-only確定、timeout／中断／retry／遅延結果を確認した。

Survey v2 drift testは文書26の質問文・選択肢・型・順序・必須区分・versionを含むsnapshotと比較する。コピー元commitはfixtureに記録した。

## 8. Browser/manual verification

実HTTP、認証middleware、使い捨てDB、deterministic fake providerを接続してChromiumで検証：

1. Case OverviewからPreparationへ移動。
2. AI実行成功後もSURVEY_COMPLETEDで、Theme未生成のまま。
3. 担当者が開始し、Themeを編集採用、質問／Evidence Candidateを個別採用、Hypothesisを却下。
4. Plan順序変更とHuman confirmによりREADY_FOR_DIAGNOSIS。
5. Provider失敗時の表示と手動Theme／Plan追加からの確定。
6. 確定後に顧客リンクを再開してもSurvey完了画面を維持。
7. 既存Slice 1の公開申込・保存・再開・失効・営業訪問も回帰検証。

生成した画面画像でHuman-only準備画面も確認した。実Google OAuth、実顧客、実Anthropic、SMTP／Slackへの接続試験は今回行っていない。

## 9. Remaining issues / rollout

- 本番migration／デプロイは未実施。008を既存runnerで適用してから新アプリを起動する。
- Anthropicへのライブ試験は未実施。既存環境のAPI keyとモデル利用権限を検証する。未設定でもHuman-only運用は可能。
- DB testsはWASM PostgreSQLの単一接続adapter。通常のPostgreSQLサーバーでの複数接続競合・実Cloud Runの複数instance実行は未検証。
- 非同期workerをリクエスト外でも稼働させるため、Cloud Runではinstance-based billingとminimum instances 1以上を設定して運用する。稼働中instanceがない間はqueueが処理されない。設定変更は今回実施していない。[Google Cloud公式：Billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)、[Instance autoscaling](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)。
- 自由文の意味判断はschema／検証だけでは保証できない。AI提案は担当者がレビューして採用する。
- AI-02、60分Workspace、AI-03、Insight、Report、Assessment Handoff、FACTACT連携はSlice 2に含めない。

## 10. Canonical deviations

None.

## 11. Latest commit SHA

この文書を含むfeature branchの最新commitを`git log -1 --format=%H`で確認する。完了報告にpush後のSHAを記載する。
