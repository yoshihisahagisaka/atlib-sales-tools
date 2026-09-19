# SL-A2/A3 受入前検証

基準: `63c84bdd631f5f918afae821df63e9600cd82d78`。対象ブランチ: `feat/free-diagnosis-sales-launch`。Applicationの受入前検証であり、Production/Pilot GO判定ではない。

## 分類の基準と証拠

- A: SL-A2/A3で生じたregression。
- B: SL-A1 Translationに追従していない表示期待値。単に「開始HEADでも失敗した」ことだけではCにしない。
- C: Translation以外の既存baseline failure。業務仕様を変更せず、原因と処置を記録する。
- D: 今回の調査で確認した実装・型・契約上のGAP。発生時点が以前でも、型エラーと状態の誤表示を文言期待値の修正だけで隠さない。

Business根拠: git_KAIZEN `6768020` のdocs/88。顧客発言・未確認・営業の仮説の分離、情報の再利用、顧客同意、Human Decision、営業向け日本語表現を維持する。Translation履歴は `cb04001`（資料本文）、`b1729df`（診断表示）、`6f82881`（分析確認）、`8769028`（経営フィードバック）、`2cd1ecb`（引継ぎ）と照合した。

元の5 Golden失敗は未変更の `2cd1ecb` でも再現済み。各ブラウザ失敗の旧期待値・実画面・Translation差分を照合した。UIの内部コード表示を復活させてテストを通す修正はしない。意味上の状態、version、監査actor、参照関係はread modelでも検証する。

## 失敗分類表（元の29件を個別に記載）

表中のファイルは `test/` 配下。ブラウザのdesktop/mobileは別々の失敗として数える。

| ID | ファイル / テスト | 分類 | 原因・処置 |
|---|---|---|---|
| G01 | diagnosisReport.golden / 4–7 semantic labels, strict schema, grounding | B | `未確認`・`Root Cause仮説`を現行の`まだ分かっていないこと`・`WHY仮説`へ。意味変更拒否・参照guardは維持。 |
| G02 | itManagementDiagnosis.golden / legacy migration/table/API | C | 認証mountの正規表現がカンマ後の空白を必須にした既存テスト不具合。空白非依存に修正。旧`indexOf`比較は見つからない`-1`でも通るため、mount存在と順序を明示検証。認証・業務仕様は変更なし。 |
| G03 | managementFeedbackMfA.golden / Q01 UNKNOWN projection | B | `FUTURE…Management Feedback`の旧文言を`目指している会社の姿…経営フィードバック`へ。knowledge_status=UNKNOWNは維持。 |
| G04 | managementFeedbackMfA.golden / Page 2 Observation/UNKNOWN | B | 節名・観察/未確認ラベルの翻訳に追従。仮説を別節にする検証は維持。 |
| G05 | managementFeedbackMfB.golden / WHY grounding | B | Supporting Observation / Evidence Neededを`確認できていることとのつながり` / `次に確認が必要なこと`へ。参照・推論非確定・raw除外は維持。 |
| B01 | diagnosisAssessment.browser / 受注→引渡し→Close / desktop | B | NOT_PROPOSED等を日本語表示へ。内部状態・監査はread modelで検証。追加発見D03も修正。 |
| B02 | diagnosisAssessment.browser / 辞退→Close / desktop | B | PROPOSED/DECLINEDの表示期待を日本語化。Closeのguardとhandoffなしを維持。 |
| B03 | diagnosisAssessment.browser / Handoff再生成 / desktop | B | Handoff v2 / READYを`引継ぎ情報 第2版 / 引渡し可能`へ。旧版不変・Close禁止は維持。 |
| B04 | diagnosisPreparation.browser / AI提案→Plan確定 / desktop | B | 入口リンクの旧名を`無料診断の準備`へ。 |
| B05 | diagnosisReport.browser / Draft→承認→Feedback完了 / desktop | B | リンク、提供表記、完了・版表示等を現行の日本語へ。IDはDOMのblock IDとread modelで追跡。 |
| B06 | diagnosisReport.browser / Human-only→再発行 / desktop | B | リンク、作成失敗、修正guard、更新・版表示の旧期待値を修正。意味変更拒否・旧版不変は維持。 |
| B07 | diagnosisReport.browser / AI再生成・layout / desktop | B | v1 / Report v2等を第1版 / 第2版へ。最新版選択・横幅検証は維持。 |
| B08 | diagnosisReview.browser / 提案→承認・UNKNOWN変換→完了 / desktop | B | 提供表記、採用ボタン、出典・分類等の旧英語ラベルを現行表示へ。APIの意味型は変更なし。 |
| B09 | diagnosisReview.browser / Human-only→Supersede / desktop | B | 作成失敗・未確認種別・更新・履歴の表示を日本語化。version=2/SUPERSEDEDはread modelで検証。 |
| B10 | diagnosisWorkspace.browser / Start→候補→Finish / desktop | B | `60分診断Workspaceへ`を`確認内容を記録する`へ。 |
| B11 | itManagementDiagnosis.browser / Web申込→完了 / desktop | B | 固定ヒアリングを示す旧完了文言を、同じ質問を最初から繰り返さない文言へ。 |
| B12 | itManagementDiagnosis.browser / 営業訪問→一覧・概要 / desktop | B | SURVEY_STATED/NOT_PROPOSEDのUI期待を日本語化。一覧へのリンク名も追従。 |
| B13 | diagnosisAssessment.browser / 受注→引渡し→Close / mobile | B | B01と同じ翻訳不一致。モバイルでもClose・監査・固定snapshotを検証。 |
| B14 | diagnosisAssessment.browser / 辞退→Close / mobile | B | B02と同じ翻訳不一致。 |
| B15 | diagnosisAssessment.browser / Handoff再生成 / mobile | B | B03と同じ翻訳不一致。 |
| B16 | diagnosisPreparation.browser / AI提案→Plan確定 / mobile | B | B04と同じ旧リンク名。 |
| B17 | diagnosisReport.browser / Draft→承認→Feedback完了 / mobile | B | B05と同じ翻訳不一致。 |
| B18 | diagnosisReport.browser / Human-only→再発行 / mobile | B | B06と同じ翻訳不一致。 |
| B19 | diagnosisReport.browser / AI再生成・layout / mobile | B | B07と同じ版表示不一致。 |
| B20 | diagnosisReview.browser / 提案→承認・UNKNOWN変換→完了 / mobile | B | B08と同じ翻訳不一致。 |
| B21 | diagnosisReview.browser / Human-only→Supersede / mobile | B | B09と同じ翻訳不一致。 |
| B22 | diagnosisWorkspace.browser / Start→候補→Finish / mobile | B | B10と同じ旧リンク名。 |
| B23 | itManagementDiagnosis.browser / Web申込→完了 / mobile | B | B11と同じ完了文言不一致。 |
| B24 | itManagementDiagnosis.browser / 営業訪問→一覧・概要 / mobile | B | B12と同じ翻訳不一致。 |

元の29件の主分類: **A=0 / B=28 / C=1**。Cの修正はテストの空白依存と誤った存在検査のみで、仕様変更ではない。

## 型エラー・実装GAP（文言テストとは別分類）

| ID | 分類 | 原因 | 修正・検証 |
|---|---|---|---|
| D01 | D（既存起源） | assessmentScopeClarification.tsのresolveルート: `noUncheckedIndexedAccess`下のparamsは`string \| undefined`、repoはstring必須。 | 既存UUID ID境界に沿ってZodで検証・narrowing。invalid IDはDBへ渡す前に400。正しいID・actor・payloadはそのまま転送するHTTPテストを追加。 |
| D02 | D（既存起源） | 同ファイルnot-requiredルートの同じTS2345。 | D01と同じ。`!`・`any`・ts-ignoreで型を消す方法は使わない。 |
| D03 | D（Translationで発生） | review/report/assessmentの`case-status`が固定文字列になり、確認完了やCLOSED後も同じ進行状況を表示。 | 既存一覧画面と同じ日本語状態辞書で実際のdiagnosis_statusを表示。全browserの遷移・完了表示で検証。状態遷移やAssessment contractは変更しない。 |

Business Decisionが必要な変更はない。未同意記録の保持期間等の既知UNKNOWNはこの検証で決めない。SL-A4/A5、MF-F、FACTACT Coreの変更はない。

## 検証結果

テストは指定ブランチの専用worktreeで実行し、別レーンを取り込んでいない。外部サービスは合成providerを使用し、Production/Pilot evidenceとは扱わない。

| 検証 | コマンド / 範囲 | 最終結果 |
|---|---|---|
| unit/integration | `node -r ts-node/register --test --test-concurrency=1 test/*.golden.test.ts test/productionReadiness.security.test.ts` | **135成功 / 0失敗 / 4スキップ**。元137件にUUIDルート境界2件を追加。SL-A2/A3の6件を含む。 |
| real PostgreSQL | `RUN_READINESS_PG=1 npm run test:readiness:postgres`、専用PostgreSQL 17 | **10成功 / 0失敗**。migration、複数接続の同意競合、原子的rollback、WEB/SALES合成E2E。 |
| browser | `npm run test:diagnosis:browser -- --timeout=15000` | **34成功 / 0失敗**。desktop/mobile各17件。元の24失敗をすべて解消。 |
| typecheck | `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) | **成功**。strict / noUncheckedIndexedAccessを維持し、全srcを対象。 |
| build | `npm run build` | **成功**。TS2345を含むエラーなし。 |
| diff check | `git diff --check` | **成功**。 |

残存failureは0件。スキップ4件は既存のlive AI opt-in（legacy KAIZEN、AI-01、AI-02、AI-03）で、実provider/keyによる外部検証は未実施。単なる文言変更でguardやsnapshot検証を削除していない。内部enumを表示へ戻さず、read modelでの状態・version・audit検証を併用した。

`test:diagnosis`に新しいルート境界テストを登録し、既存CIコマンドからも実行されるようにした。今回のremote CIは未実行（pushなし）。専用PostgreSQLコンテナは検証後に停止済み。

## 変更範囲と未実施事項

- B/C: 上表に対応する既存テスト期待値・リンクselector・空白非依存の静的検証のみ修正。
- D01/D02: `src/routes/assessmentScopeClarification.ts`のID入力検証と型narrowing、新しい`test/assessmentScopeRouteValidation.golden.test.ts`。正常なAPI payload/actorと既存のサービス処理は変更なし。
- D03: `public/js/it-management-diagnosis-{review,report,assessment}.js`の状態表示のみ修正。
- 実行登録: `package.json`のtypecheck scriptと既存diagnosis test script。
- SL-A2/A3機能追加、SL-A4/A5、MF-F、FACTACT Core、Business価格・サービス定義、migration変更なし。
- 未同意記録の保存・削除/撤回運用と外部EvidenceのUNKNOWNは継続。Production/Pilot GO判定、push、main mergeは実施しない。
