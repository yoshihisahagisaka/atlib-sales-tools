# SL-A6 — Application Readiness / BD-SL-01

検証日：2026-09-20（JST）。branch：`feat/free-diagnosis-sales-launch`。
開始時baseline：`a8262cd02cbb9644aaba58c28de5fe3f2beba0fc`。
今回の検証対象コードcommit：`4e358b129e54d1f7b50c73f2890b2bdc85d62ef2`。
この報告書・Evidenceはコード検証後の文書commitで記録する。worktree：`C:\atlib\atlib-sales-launch`。

## Application Gate

**APPLICATION READY: GO**。

前回のDecision待ち停止を、利用者が正式決定・受入れした **BD-SL-01 — Free Diagnosis Completion by Human Decision** により解消した。以前の部分PASSは流用せず、今回のコードcommitで全suiteを再実行した結果を以下に記録する。
Production / Pilotは引き続き **NO-GO**。この文書のApplication判定は外部サービス接続・本番運用の認定ではない。

## BD-SL-01実装結果

| 人が記録する判断 | 無料診断 | 後続動作 |
| --- | --- | --- |
| DIRECT_ACT | 完了 | 具体的な改善の実行へ接続する判断を保存。ACT/Core objectは作らない |
| FOCUSED_CONFIRMATION | 継続 | 追加確認 → 顧客発言保存 → Human Review → Report / 経営フィードバック → Human Re-Decision |
| DESIGN_ASSESSMENT | 完了 | Assessmentは未提案のまま。別の人の操作で提案・回答保留・受注・引渡しを継続できる |
| STOP_HOLD | 完了 | Assessment提案なしで正常終了。将来の人の再判断・再開を妨げない |

既存のDecisionテーブル・snapshot・supersedes関係を再利用。Decision、Case状態、Case version、CaseTransition、auditを同一transactionで記録する。actor・timestamp・過去Decisionは保持し、Re-Decisionは追記する。AI actorの確定は禁止。stale version、重複送信、audit失敗は部分保存しない。
FOCUSED_CONFIRMATIONは既存の追加確認状態へ戻す。現在の完了メタデータを解除しても過去のDecision・遷移・Reportは消さない。追加発言によるInsight更新、UNKNOWNの解消、FACT昇格は行わない。再度Feedbackを完了するまでRe-Decisionできない。

## Human Decision UI / API

経営フィードバック資料画面の「次の選択肢」に、空欄から人が選ぶ4ルート、判断内容、次の行動、明示確認、判断履歴を接続。通常画面には日本語の選択肢と担当者・日時を表示し、内部enumは表示しない。
既存 `POST /api/admin/it-management-diagnosis/cases/:id/feedback/decision` とGETを使用。新endpointなし。staff/session/command header/Case versionの既存境界を維持。
無料診断の終了をAssessment受注・辞退・引渡しへ依存させない。旧close APIは既に完了したCaseの互換再実行のみ許可し、未完了Caseには人のDecisionを要求する。
Assessment操作は最新の人のDESIGN_ASSESSMENT判断を要求し、無料診断完了後も許可する。引渡しsnapshotはCLOSEDも表現可能とし、既存FEEDBACK_COMPLETED版も読める。古い保存snapshotを書き換えない。

## Scenario A〜K

| Scenario | 結果 | 今回実行したEvidence |
| --- | --- | --- |
| A 営業会話開始 | PASS | salesLaunchE2E browser（desktop/mobile、実PG）：3分類保存・再読込、同意前Caseなし、明示同意後1件作成。salesIntake + 実PG並行同意テストでidempotency/actor/provenance |
| B Web開始 | PASS | itManagementDiagnosis browser：Web申込・保存・再開・完了。実PG WEB E2E。Q01〜Q10は既存定義/SSOT一致テストで確認 |
| C Progressive Reuse | PASS | Intake/Web由来を区別し、既取得Q01/Q04を再質問せず不足だけ入力。既知/未確認/仮説を分離。progressiveReuse browser/service/実PG |
| D 追加確認 | PASS | 候補を人が選びPlan確定→workspaceで顧客発言保存→Human Review。UNKNOWNは残存、原文sourceと参照関係を保持 |
| E AI分析 | PASS（Application contract） | AI-01〜04のstrict contract、失敗・重複・late結果・Human fallback。ブラウザの候補は採用前Insightにならない。live外部Evidenceは別記 |
| F Human Review / 3×6 | PASS | review/managementAnalysis browser、golden、実PG。人の編集採用・不採用・UNKNOWNとして保持、未採用候補をReportへ混入しない |
| G 経営フィードバック資料 | PASS | report browser：承認・共有・再発行・意味変更拒否。新一貫E2Eで5区分と内部語非露出、承認snapshot保持 |
| H 経営者との対話 | PASS | browser：Feedback開始・顧客発言保存・完了。生の発言からInsight/FACTを自動生成しない |
| I NEXT DECISION | PASS | 新Human UIから4ルートを記録。FOCUSED循環後STOP_HOLDへRe-Decisionし過去Decision不変。実PGのactor/version/audit/履歴検証 |
| J Assessment Handoff | PASS | DESIGN_ASSESSMENT判断直後CLOSED / NOT_PROPOSED / handoffなし。browserで提案→回答保留→受注→生成→引渡し。完了Caseでも継続可能 |
| K 無料診断完了 | PASS | DIRECT_ACT / STOP_HOLDは提案なしで完了。DESIGN_ASSESSMENTは受注前に完了。FOCUSEDは継続→再判断。golden / 実PG / 両browser |

主Evidence：`test/salesLaunchE2E.browser.test.ts`。営業入力からAssessment引渡しまでは実際のブラウザ操作で一貫実行した。FOCUSED/DIRECT_ACTの独立browserはFeedbackまでをfixtureで構築し、その後の操作をブラウザで実施。Web入口は専用browserと実PG WEB E2Eで検証。すべて同じ最終コードを対象とし、異なるtestを単一browser sessionだったとは扱わない。

## Report Translation audit

表示は次の5区分に統一した。

1. 目指している会社の姿
2. 今、確認できていること
3. まだ分かっていないこと
4. ITで良くできそうなこと
5. 次に確認・判断すること

生成済みのラベル・UNKNOWN subtype・Human Review等を表示層でBusiness表現へ翻訳する。原文引用を一括置換せず、承認済みReportの本文・block・参照・hashは変更しない。編集時は生成ラベルを元の保存表現へ戻し、既存の意味変更禁止ガードを通す。仮説・差の候補は第4区分でも候補である旨を明示する。
観察と未確認が同じ承認blockに含まれる場合、推測で分割せずblockを保持し、未確認事項の所在を第3区分に表示する。未確認を確定情報へ翻訳しない。
Translation goldenは意味・原文・block同一性・編集round tripを確認。新browserは通常表示のFACT / UNKNOWN / HYPOTHESIS / GAP_CANDIDATE / KAIZEN_DIRECTION / semantic_type / SourceRecord / Human Review等の非露出を確認する。内部API/DB enumと顧客原文自体は表示翻訳による改変対象ではない。

## Security / Error Recovery

今回の全suiteで以下を再実行した。

| 境界 / 障害 | Evidence |
| --- | --- |
| staff-only / customer-admin / AI確定拒否 | salesIntake、managementFeedbackMfC、businessDecisionSl01、review/report golden |
| 他Case token/source、UUID、不正/失効/revoke token | itManagementDiagnosis、assessmentScopeRouteValidation、workspace/report golden |
| duplicate submit / stale version / invalid transition | Intake、Decision、Report、Assessment golden + 実PG multi-connection |
| transaction / audit failure rollback | BD-SL-01、Intake、Report、MF-D golden/実PG |
| AI failure / AIなしHuman fallback / late結果 | preparation/workspace/review/report golden・browser、実PG worker claim |
| OAuth session契約・CSRF/state・安全な失敗ログ | productionReadiness.security（provider stub。実Google接続のEvidenceではない） |

認可を緩和した修正なし。Case参照のstaff権限は既存契約を維持し、新しい担当者別アクセス制約を推測で追加していない。

## PostgreSQL / migration

専用の破棄可能なPostgreSQL 17（loopback 55436、readiness DB）を使用。fresh schemaへmigration **001〜017を順次適用**し、全browserも実PG上で実行した。既存レコードを持つ001〜012からの追加upgrade、migration ledger、同時runner、失敗rollback/再実行、制約、immutable snapshot、row lock、version、Decision履歴、audit rollbackも検証。

> Historical evidence note (2026-09-21): this report records the then-current `001〜017` sequence. After a staging-ledger collision was observed, the unchanged Free Diagnosis intake SQL was renamed from `017_sales_conversation_intake.sql` to `018_sales_conversation_intake.sql`; this does not alter the reported application validation evidence.
新migration・DB object・Core objectの追加なし。既存Application契約のBD-SL-01による遷移変更のみ。旧Intakeの同意を遡及捏造しない。

## 全テスト結果

最終ログと実行コマンド・SHA256は `docs/evidence/sl-a6/` に保存。Node v24.18.0 / npm 11.16.0、Windows、Chromium desktop/Pixel 7 emulation。各commandのexit codeは0。PowerShellログのNativeCommandError表記はChromium起動時のNO_COLOR/FORCE_COLOR警告のstderr整形であり、テスト失敗ではない。

| 検証 | 結果 |
| --- | --- |
| unit / integration（全golden + security） | 149成功 / 0失敗 / 4skip（全153件） |
| real PostgreSQL | 13成功 / 0失敗 / 0skip |
| browser desktop / mobile（実PostgreSQL） | 50成功（desktop 25 / mobile 25） / 0失敗 / 0skip |
| typecheck | PASS |
| build | PASS |

Surveyの定義部分はbaselineと不変。LF正規化した `itManagementDiagnosis.ts` のnextAction以前のSHA256：`8f2cb98bd9fe53a8eee84fd4a90b7cee445a8c4576742950626c9822bf035d47`。変更したのは営業向けnextAction文言であり、Q01〜Q10の質問・選択肢・必須条件ではない。

## 検証中に修正したfailure

| 分類 | 内容 | 対応 |
| --- | --- | --- |
| D / BDで解消 | 非Assessment終了不能・完了するとAssessmentも禁止される契約 | 正式BD-SL-01に従い分離、4ルート回帰を追加 |
| D / UI GAP | 人が新しいDecisionを記録する営業UIなし | 既存APIへ明示Human操作を接続 |
| B / Translation | ReportのUNRESOLVED、Human Decision拒否文、旧AI事前整理next-actionへのテスト期待値 | Business表現へ修正。拒否・遷移のassertionを削除していない |
| D / UI競合 | 再読込中に利用者が選んだ過去の引継ぎ版が最新版へ戻る | 応答時点の利用者選択を尊重。応答を遅延させるdesktop/mobile回帰テストを追加 |
| テスト同期 | 新E2Eの入口リンク完全一致、途中保存応答前のreload | 実表示に合わせたlocator、保存完了の明示待機 |

残存Application failure：なし。Application blocker、認可・Translation blocker、未解決Business/Product Decisionなし。既存baseline failureを仕様変更で隠していない。

## live AI / Remaining Production GAP

この実行環境ではAnthropic credentialとlive opt-inがなく、live AI関連4件はSKIP。AI adapter、AI-02、AI-03、代表企業live E2Eの実プロバイダーEvidenceは未取得。合成providerでのApplication contract・AI失敗・AIなしHuman fallbackの成功と区別する。

Production / Pilot **NO-GO維持**。以下は外部Evidence未取得・別Gateであり、今回のApplication GOでは代替しない：Cloud SQL migration、backup/restore、Secret Manager/IAM、real Anthropic、real Google OAuth、Cloud Run/worker、ingress/proxy/rate limit、monitoring/alert、staging E2E、運用責任者/incident対応、Privacy/Legal。

## FIT / GAP / CONFLICT / UNKNOWN

- FIT：既存Decision履歴、source、Report、workspace、review、Assessment lifecycleを再利用。Intake/Survey/Progressive Reuseを変更せず接続。
- GAP：AG-01完了条件、AG-02Human UI、AG-03Report Translation、AG-04最終E2E Evidenceを今回対応。
- CONFLICT：従来のAssessment依存完了条件は正式BD-SL-01で置き換えた。未解決Business/Product conflictなし。
- UNKNOWN：実AI品質、本番infra/運用/法務の外部Evidence。日数での情報失効、UNKNOWN自動解消条件、新Core temporal contractは作っていない。
- BUSINESS / PRODUCT DECISION REQUIRED：なし。BD-SL-01は正式決定・受入れ済み。

## 変更ファイルとcommit

コードcommitは上記SHA。主要変更：

- services：managementFeedbackDecisionRepo、diagnosisAssessmentRepo、diagnosisReportRepo。
- domain：diagnosisAssessment（完了後snapshotの表現）、itManagementDiagnosis（nextAction翻訳のみ）。
- UI：it-management-diagnosis-report.html、report.js、assessment.js、report-business-wording.js。
- 検証：businessDecisionSl01/reportTranslation golden、salesLaunchE2E browser、focusedConfirmation fixture、実PG/browser harness、既存回帰期待値、Playwright設定、package/CI。
- 文書：本書と `docs/evidence/sl-a6/`。

push / main mergeは行わない。SL-A7、MF-F、FACTACT Coreには進んでいない。maturity/completeness score、FACT自動確定、AIによるRoute確定、atLIB自動Actor選択は追加していない。
