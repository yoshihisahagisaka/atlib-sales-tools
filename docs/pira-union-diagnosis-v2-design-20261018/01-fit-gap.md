# 01 既存資産Fit/Gap・証跡
確認日2026-10-18。以下の「事実」は固定SHAのコード・設計書の確認結果。「提案」はPIRAでの適用案。Productionでの稼働・DB適用状況は別物であり、今回のコード確認だけでは認定しない。

## Canonical・ADRと実装差
Salesの[Production Canonical policy](../sales-tools-production-canonical-policy-20261003.md)はmainと実適用migration台帳を正本とし、サービス別ドメインを分ける。今回は実台帳・Cloud Run revisionを確認していない。
Current Design v1の028–032 release文書はパッケージとread-only preflightの許可を記載しており、Production適用済みの証明にはならない。

Design v2 Package B ADRはOriginal Survey / Current State / Analysis / Generated Narrative / Human Editの5層分離を決定。後続Package C ADRは、人間のCurrent State保存と再分析のtransactionを分離し、再分析失敗時にも人間の保存を残すと決定した。Bの原文に残るatomic説明よりCのAPI境界判断を優先する。Slice7は設計時点の「未実装」と記載するが、現行mainにはPersistenceRepo、Report、PDFの実装が存在する。文書の古いStatusを現行コード未実装の根拠にしない。

v1モジュールがコメントで参照する以下2文書は固定mainから404で取得できなかった。Current Design v1の独立したAnswer/Semantic/Rule/Report正本文書一式の所在は未確認。現在確認できたv1のコード契約、golden test、後続Design v2契約で補完したが、独立文書一式を読了したとは扱わない。
- docs/free-diagnosis-rule-based-v1-business-design-canonical-20261003.md
- docs/free-diagnosis-rule-based-v1-implementation-specification-20261003.md

## Fit/Gap
|領域|確認事実|思想の再利用|コードの再利用候補・必要差分|
|---|---|---|---|
|質問管理|v1はQ1–Q7 enum/Zod、v2公開質問はpublicCustomerSelfDesignV2.ts内の固定定義|安定ID・排他・最大選択数|検証パターンとUI部品は候補。PIRA ID/選択肢/分岐は新契約。汎用CMSの存在は未確認|
|回答|v1はANSWERED/UNKNOWN/NOT_IN_POSITION_TO_ANSWER。v2公開申込は会社名・連絡先・同意必須|認識とFACTの分離、回答者と入力元のprovenance|既存申込schemaはそのまま不可。PIRAでは診断利用と相談申込を分離。NOT_APPLICABLEの明示とSKIPPEDの内部状態が必要|
|意味状態|intakeSemanticProjectionはQ2/Q3/Q4/Q5/Q6をM01–M06へ固定変換|Direct/Relevance/Unknown/権限外の区別|関数自体はPIRA非互換。PIRA専用projectionを追加し既存を変更しない|
|ルール|runInitialRule / runFinalRuleおよびanalyzeFreeDiagnosisV2はいずれも業務固有条件|Guard優先、UNKNOWNを問題化しない、健全結果を許容|既存MルールをTルールへ改名して流用しない。既存実行方式を使うPIRA専用判定表アダプタ|
|文章|v2は固定文の組み立て。v1 reportにはmanual経路とAI enqueue経路が共存|固定文章＋根拠ID|固定組み立てのパターンはFit。PIRAからAI route/provider/workerへ到達する経路を作らない|
|Report|diagnosisReportは旧5章、DesignV2Reportも独自5章、issuer固定。mapは最大2件90字省略|出典と意味の検証|6章内容schemaとPIRAテンプレート追加。既存schemaへの押込み・本文省略は禁止|
|PDF|Playwright HTML→PDF、HTTP通信遮断、escape、同時実行上限、timeout、承認hash照合、APPROVED要件|安全な描画と同一snapshot|描画transport・escape・filename helperは分離再利用候補。現行generateはDB/policy/承認必須、8頁IT経営固有HTMLのため直呼び不可|
|版管理|PersistenceRepoはanalyzer/rules/narrative版、input/result/content hash、exact state紐付け|不変snapshot・追跡・再実行|contentHashは再利用候補。ただし配列順はそのままなので、複数選択の並び正規化をPIRA入力側に追加|
|保存・営業|v2 RepoはIT経営Case/会社/FK/lifecycle前提、業務KAIZENはブラウザ診断→相談時snapshot転送|診断と相談を分ける|既存IT経営テーブルへの流用不可。保存方式は最小差分案参照|
|業務KAIZEN|Corporate self-check.jsは15問固定、UNKNOWN/N_A、sixAxis平均・区分・confidence・direction判定。相談は明示同意後POST|登録不要、任意相談、固定文・入力検証|質問操作/escape/引継ぎsnapshotの限定部品は候補。平均・軸メーター・方向判定は本件の採点禁止と非互換。丸ごと再利用不可|
|共同購買|PR14は診断完了producer未接続、feature flag OFF。実環境の作成/DDLはNo-Go|診断と注文を分ける|診断結果を自動申込・請求・CRM登録に変換しない。任意相談だけ別の明示操作|

「再利用候補」は関数依存と運用許可を確認した上での将来実装候補であり、今回にコンパイル・実稼働の互換性を検証した意味ではない。既存エンジンの全面作り直しも、既存IT経営診断への破壊的変更も不要。

## 参照コード・設計書（すべてSales固定SHA）
基準URL： https://github.com/yoshihisahagisaka/atlib-sales-tools/tree/d35581cec3dbc7d4ca2938f2a9c664906ccc5316
- src/domain/freeDiagnosisRuleBasedV1.ts
- src/domain/intakeSemanticProjection.ts / initialRuleEngine.ts / finalRuleEngine.ts / structuredHearing.ts
- src/domain/freeDiagnosisDesignV2.ts / freeDiagnosisSemanticProjectionV2.ts / freeDiagnosisAnalysisV2.ts / freeDiagnosisDesignV2Report.ts
- src/domain/publicCustomerSelfDesignV2.ts / diagnosisReport.ts
- src/services/freeDiagnosisDesignV2PersistenceRepo.ts / freeDiagnosisDesignV2ReportPdf.ts / diagnosisReportRepo.ts
- src/routes/diagnosisReport.ts
- docs/free-it-management-diagnosis-design-v2-survey-question-contract-20261010.md
- docs/free-it-management-diagnosis-design-v2-golden-rule-contract-20261011.md
- docs/free-it-management-diagnosis-design-v2-package-b-architecture-decision-20261011.md
- docs/free-it-management-diagnosis-design-v2-package-c-api-boundary-decision-20261011.md
- docs/free-it-management-diagnosis-design-v2-slice7-report-fact-candidate-human-review-contract-20261011.md
- docs/production-release-it-management-current-design-v1-028-032.md
- test/currentDesignV1.golden.test.ts

業務KAIZEN： https://github.com/yoshihisahagisaka/atlib-corporate-site/blob/1caa2eb1fec2d887a41130b0aa0fdf102493562b/public/business-web/self-check/self-check.js
共同購買： https://github.com/yoshihisahagisaka/atlib-sales-tools/pull/13 および /pull/14

## 既存テスト証跡の限界
前工程の固定mainに対するローカルbaseline TAPではCurrent Design v1 goldenが9 PASS / 2 FAIL。Golden5とCase3でM04だけの期待にM05 OPPORTUNITYが追加されている。Q7の違いによる結果同一性そのものの失敗とは区別する。今回この既存不一致を修正しない。既存全テストが通る、またはPIRAの新テストが通ったという報告は行わない。実装着手時に所有者がcanonical期待と現行挙動のどちらを採るか解決する。
