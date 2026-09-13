# 無料 IT経営診断 Slice 6 — 実装・検証記録

## 1. Summary

Assessmentの営業判断、deterministic Handoff生成・引渡し記録、Human Closeを追加した。無料診断とAssessmentの状態を分離し、受注時は最新Handoffの引渡し完了をClose条件とする。

- Base: `main` / `a30f100a913781d0c2e4a2816b6f7364523bc2fd`
- Branch: `feat/it-management-diagnosis-slice6`
- SSOT: `git_KAIZEN/main` / `b8951b949e7c5eb0f98c4dffe6591cd623d00a51`
- 正本: `docs/31-free-it-management-diagnosis-slice6-codex-implementation-handoff-v1.md`

無料診断関連docs/17〜30は前回SSOTから変更がないことを照合し、既存Canonicalとdocs/31を確認した。SSOT repository、Business message・商品名・価格は変更していない。

## 2. Files changed

| 区分 | ファイル |
|---|---|
| Migration | `migrations/012_it_management_diagnosis_assessment_handoff.sql` |
| Snapshot / command schema | `src/domain/diagnosisAssessment.ts` |
| Case status / Next Action | `src/domain/itManagementDiagnosis.ts` |
| Snapshot builder | `src/services/assessmentHandoffSnapshot.ts` |
| Commands / read / audit | `src/services/diagnosisAssessmentRepo.ts` |
| 既存一覧・概要Next Action | `src/services/itManagementDiagnosisRepo.ts` |
| API / auth gate / 起動 | `src/routes/diagnosisAssessment.ts`, `src/routes/adminItManagementDiagnosis.ts`, `src/server.ts` |
| O-06 Assessment tab | `public/js/it-management-diagnosis-assessment.js`, `public/admin/it-management-diagnosis-report.html`, `public/js/it-management-diagnosis-report.js`, `public/css/diagnosis-report.css` |
| CLOSED表示・既存画面導線 | `public/admin/it-management-diagnosis.html`, `public/js/it-management-diagnosis-admin.js`, `public/js/it-management-diagnosis-preparation.js`, `public/js/it-management-diagnosis-review.js`, `public/js/it-management-diagnosis-workspace.js` |
| Golden / browser | `test/diagnosisAssessment.golden.test.ts`, `test/diagnosisAssessment.browser.test.ts` |
| Test integration | `test/support/assessmentFixtures.ts`, `test/support/diagnosisHarness.ts`, `test/diagnosis.playwright.config.ts`, `test/diagnosisReport.browser.test.ts`, `package.json` |
| 引継ぎ | 本文書 |

既存Express / TypeScript / PostgreSQL、Google Workspaceスタッフ認証、admin rate limit、command header / cross-site Gate、error handler、Case row lock / version、AuditLog / CaseTransition、O-06 UI / CSS、canonical JSON hashを再利用した。新dependency、AI Provider、外部送信は追加していない。

Slice 5 browser testの「Assessment tabは無効」という期待だけを、Slice 6のtab有効化に合わせて変更した。既存Golden Testsの期待値は変更していない。

## 3. Persistence / migration

新migration 012で`assessment_handoffs`を追加。Case内でversionを一意にし、snapshot_json / snapshot_hash、Report参照、生成者、引渡し者・日時を保持する。`DRAFT / READY / TRANSFERRED / ACCEPTED`を許容し、今回の操作はREADY生成とTRANSFERREDへの更新まで。

Caseには営業判断の日時・担当者・理由を保持する`assessment_metadata_json`、`closed_at`、`closed_by_user_id`を追加する。既存の独立した`assessment_status`と5状態をそのまま使用する。Diagnosis statusにはCLOSEDのみ追加する。

Report参照はCaseとの複合FKで他Caseへの参照を拒否する。migration 001〜011とlegacy API / tableは変更していない。本番DBへ未適用。デプロイ時は既存runnerで012を適用してからアプリを起動する。

## 4. Assessment lifecycle behavior

FEEDBACK_COMPLETEDのスタッフ操作に限定し、NOT_PROPOSED → PROPOSED → 必要に応じPENDING → ACCEPTEDまたはDECLINEDとする。PROPOSEDから直接ACCEPTED / DECLINEDも可能。終端の営業判断を別状態へ書き換えるcommandは追加していない。

営業状態の更新でDiagnosis statusは変えない。各状態の日時・スタッフ・理由と、状態変更before / afterをAuditに記録する。AI actorと顧客tokenを拒否する。

APIは既存admin namespace配下の`/cases/:id/assessment`、`/assessment/propose|pending|accept|decline`を使用する。mutationにはexpectedVersion、任意reasonが必要。汎用PATCHで営業判断を変更しない。

## 5. Handoff deterministic builder / snapshot

`buildAssessmentHandoffSnapshot(client, caseId, generatedAt)`が明示SQL whitelistでDB状態を組み立てる。generatedAtはSystemが付与し、同じDB状態とSystem timestampで同一snapshot / hashを生成する。AI / AIExecutionを使用しない。

含める情報はOrganization ID・表示名、Case ID・Entry Channel、Current Future ID / version / intent status、最新承認済みReport ID / version / 承認snapshot hash / 本文hash、HUMAN_APPROVED Insightと出典参照、OPEN AssessmentConfirmationItem、Theme参照、生成時のDiagnosis / Assessment status。

Insightと出典は安定した順序で並べ、構造をstrict schemaで検証する。保存済み本文はtrim等で加工せず保持する。Raw Transcript / Raw SurveyResponse / Feedback本文は複製せず、元のSource refで追跡する。

`POST /cases/:id/assessment/handoff/generate`はFEEDBACK_COMPLETED + ACCEPTED、Current Futureと最新承認済みReportがある場合のみREADYを生成する。

## 6. Semantic preservation

元のsemantic type、review_status、UNKNOWN区分、本文、area_tag、improvement_lens、source refsを保持する。HYPOTHESIS / ROOT_CAUSE_HYPOTHESIS / UNKNOWN / OBSERVATIONをFACTへ変換しない。Evidence Candidateにverified等の判定を追加せず、存在Observationから内容の妥当性を推論しない。

DRAFT / REJECTED / SUPERSEDED Insightを除外する。FACT / CONFIRMED_FACT / VERIFIED_EVIDENCE / ROOT_CAUSEをInsight semantic typeとしてschemaに追加していない。

## 7. Confirmation item behavior

OPENのみを独立した`assessment_confirmation_items`配列へ格納し、NOT_REQUIREDは除外する。Insight semantic typeへ変換しない。

今回、引渡しによるHANDED_OFF更新は行わない。生成と引渡しで項目はOPENのまま保持し、引き渡した項目IDをTransfer Auditに記録する。これにより再生成時にも未確認項目を残す。生成・引渡しを確認済み評価として扱わない。

## 8. Handoff immutability / versioning

READY以降はDB triggerでsnapshot / hash / version / Report参照等の更新と削除を拒否する。再生成は必ず新versionで旧版を保持し、最新READY版だけを引き渡せる。

Transfer時に保存hashとsnapshotを照合し、Current Contextとも再照合する。Report再発行等でContextが変わっていれば、新version生成を要求する。引渡し後もsnapshotは不変。

JSON保存機能でsnapshotとhashを取り出せる。Assessment担当へ引き渡した後、スタッフが`/assessment/handoff/transfer`で引渡し済みを記録する。外部CRM / FACTACTへの送信は行わない。受領確認commandは今回は追加せず、ACCEPTED enum / metadataは将来用に確保した。

## 9. Close Guards

`POST /cases/:id/close`はHuman staffとexpectedVersionが必要。

- FEEDBACK_COMPLETED + DECLINED: Close可能。
- FEEDBACK_COMPLETED + ACCEPTED + 最新Handoff TRANSFERRED（将来のACCEPTEDも許容）: hash / Current Contextが一致すればClose可能。
- NOT_PROPOSED / PROPOSED / PENDING: Close不可。
- 受注済みでもHandoff未生成 / 最新版READY / Context変更あり: Close不可。
- CLOSED: 二重Close・Assessment更新・Handoff再生成 / 引渡し不可。

CaseTransitionとAudit、closed_at / closed_byは同一transactionで保存する。生成・引渡し・AI成功だけでCaseを閉じない。

## 10. State / Next Action

O-06、案件一覧・概要に営業状態とHandoff状況に応じたNext Actionを追加した。提案前は提案、PROPOSEDは回答確認、PENDINGは回答待ち、ACCEPTEDは生成→引渡し→Case完了、DECLINEDはCase完了、CLOSEDは完了と表示する。

Assessment read modelは営業判断metadata、最新Handoffと全版履歴、snapshot、Close可否・理由、関連Audit、全CaseTransitionを返す。O-06ではsemantic labelとHuman Approvedを文字で明示し、旧版も参照できる。Close不能の理由を表示する。

## 11. Tests and results

2026-09-13、disposable PGlite PostgreSQL、実Express HTTP、Chromiumで検証した。

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
| `npm run test:handoff` | 9 pass |
| `npm run test:diagnosis:browser` | desktop / mobile合計32 pass |
| `git diff --check` / staged diff check | 成功 |

Golden / 既存テスト合計87 pass、既存live AI試験4 skip。skipはopt-in / API key未設定による。Slice 6自体には外部AI依存がない。

新Golden Testsの9シナリオでdocs/31の30項目を固定し、楽観ロック、DB直接更新拒否、再生成後の最新version guard、Context変更後のClose拒否、Audit障害時の全command rollbackも確認した。

## 12. Browser / manual verification

PC / Pixel 7相当で、保留→受注→生成→JSONダウンロード→引渡し記録→Close、辞退→HandoffなしClose、新版READY時の旧版引渡し済みClose拒否を操作した。

会社名`ABC株式会社様`、提供会社`atLIB株式会社`、SURVEY_STATED、UNKNOWN / HYPOTHESIS / Human Approved、出典参照、営業判断・Close監査を確認。CLOSED後の管理一覧と顧客Survey完了表示も確認した。

スクリーンショットを目視確認し、PCのHandoff参照画面とモバイルの辞退・Close画面でレイアウトと状態表示を確認した。横はみ出し・pageerrorなし。画像は`test-results/diagnosis/`の`assessment-ready.png`、`assessment-closed.png`、`assessment-declined-closed.png`に生成される（git対象外）。

## 13. End-to-end regression result

WEB申込からSurvey、Preparation、Diagnosis、Human Review、Report承認・Delivery、Feedback、Assessment受注、Handoff生成・引渡し、CLOSEDまで同一Caseでサービス層を通し、全CaseTransitionと最終営業状態・snapshot・Auditを確認した。

既存Slice 1〜5のGoldenとHTTP / browser回帰も成功。営業訪問チャネル、AI失敗時Human-only、Raw Source保存、Report freeze、顧客token / staff Gateを維持した。

## 14. Remaining issues

Slice 6の実装・ローカル検証に未完了項目なし。本番migration / デプロイ、実Google Workspaceログイン、実際のAssessment担当への資料引渡しは未実施。受領確認command、確認項目HANDED_OFF更新、Assessment実行・請求・CRM / FACTACT連携は今回未実装。

## 15. Canonical deviations

None. docs/31の任意項目である受領確認とHANDED_OFF更新は採用せず、Human Transfer記録とsnapshot保持でMVPを完了した。

## 16. Latest commit SHA

この文書を含むcommit SHAを最終応答で報告する。`git rev-parse HEAD`とremote branch SHAの一致・clean worktreeを確認し、mainへmergeせずレビュー待ちとする。
