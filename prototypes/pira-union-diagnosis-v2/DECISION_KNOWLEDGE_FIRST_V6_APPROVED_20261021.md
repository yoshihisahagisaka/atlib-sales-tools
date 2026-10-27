# Decision｜汎用知識提供型無料診断 v6 承認記録

- Decision: 2026-10-21
- Status: **APPROVED by business decision lane**
- Source of truth for full specification: `PIRA_knowledge_first_spec_v6_approved.md`（本対話で生成された34KBの全文。**このファイル本体はまだGitHub未格納**）
- Prior decision records: `DECISION_KNOWLEDGE_LED_DIAGNOSIS_20261021.md`, `DECISION_ENTERPRISE_DNS_EDUCATION_20261021.md`
- Draft PR: #16 / baseline head before this record: 6e3f98e47546ceaf8e2af098ec56fc1859fa89b7

## 承認範囲

1. 汎用8問、38回答選択肢。組合向け・所属企業向け・一般企業向けで質問と基本解説を共通化する。
2. T04「メールや業務システムへのログインに、パスワード以外の本人確認（多要素認証）も利用していますか？」
3. T05「業務用パソコンのWindowsなどの基本ソフトを、定期的に更新（Windows Update）していますか？」
4. T06「業務で使う重要なデータが突然使えなくなった場合、元に戻す方法（バックアップと復元方法）を把握していますか？」
5. 他の5問はv6全文のとおり変更しない。T01〜T08の共通解説・回答別導入・確認文・確定済み実務資料紹介文を用いる。
6. **C方式**：対象外を除き、未実施・一部・不明・委託先任せを優先候補、実施済みを補完候補とする。各群内の編集順 T06→T02→T08→T04→T03→T01→T05→T07。最大3件。安全性の採点ではない。
7. 03は固定総括、04は最大3件の重点解説、05は確定済み5種類の実務資料。本編に選ばれないテーマは全8テーマの固定基礎知識集で読める。
8. PIRA組合向けは商品・相談誘導なし。所属企業・一般企業向けだけ、承認済みDNSセキュリティ解説で「atLIB Secure Guard」を自然に例示し、任意の相談導線を表示する。利用者向けにDNSFilterという技術基盤名を出さない。
9. 既存PR #16のHTML・PDF表示、フィードバック、テストを最大限再利用する。DB/Cloud/Production/main変更なし。

## Work実装ガード

- Workは**設計・判定変更・文章生成・要約・補完を行わない**。v6全文をWorkに渡してから着手。
- 不明点、既存仕様との衝突、資料ファイル不足があれば**STOPしてFit/Gapを報告**。独自判断で補わない。
- 作業範囲は開発ブランチ・ローカルテスト・Draft PR更新まで。ユーザーによる追加の実装依頼がある場合に開始。
- 期待ケース：全実施 T06/T02/T08、全不明 T06/T02/T08、混在 T06/T02/T08、主要3実施・他未整備 T04/T03/T01、対象外多め T06/T01/T02、委託先任せ T06/T02/T08、対象2件 T08/T01。
- 完成後は実際のHTML/PDF全文と原稿の一致、PIRA/企業表示分岐、既存回帰を検証する。

## 完全仕様の格納待ち

**本決定記録は全文仕様の代替ではない。** `PIRA_knowledge_first_spec_v6_approved.md` のGitHub格納・SHA固定が完了するまでは、実装用Canonicalの完全化は未完了。GitHub上の本記録だけを根拠にWorkが文章を再構成してはならない。
