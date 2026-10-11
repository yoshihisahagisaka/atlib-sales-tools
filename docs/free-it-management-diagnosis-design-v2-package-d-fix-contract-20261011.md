# IT経営KAIZEN 無料診断 Design v2 — Package D Fix Contract

Status: FIX REQUIRED / BOUNDED CHANGE ONLY
Date: 2026-10-11
Source Review result: PACKAGE D SOURCE REVIEW: FAIL / FIX REQUIRED
Package D implementation branch: feat/free-diagnosis-design-v2-package-d
Package D code baseline: c2db6ba2f64ccd6ef52d2d71fc6440a97b177ad3

## 1. Purpose

Package D Source Reviewで確認された4点だけを修正し、Package Dの設計境界・Package A〜Cの契約・HA6 additive independenceを変更せず、Source Review再判定へ戻す。

本修正はPackage Dのbounded fixであり、Package E、Report、Human Review、Delivery、Feedback、HA7、Production migration/deploy/trafficには進まない。

## 2. Fix 1 — Q1 raw codeを日本語表示へ修正

対象:
- public/admin/free-diagnosis-v2-common.js

現状:
- q1CompanyContextだけlabels mappingを通さずemployeeRange / siteRangeのraw codeを直接表示する。
- fixture例 EMP_21_50 / SITE_1 がそのまま画面表示される。

Required:
- Q1-A employeeRangeとQ1-B siteRangeを、Design v2 Survey Contractの日本語ラベルへ必ず変換して表示する。
- Live Hearing / Post-Hearingの双方で同一日本語表示を使用する。
- unknown/unexpected codeを誤った日本語に推測変換しない。未定義値は安全に表示できるfallbackを持つ。
- Original Surveyはread-onlyのまま。

Acceptance:
- raw semantic codeがoperator-facing画面に出ない。
- Browser testでQ1〜Q7の日本語表示を直接assertする。

## 3. Fix 2 — Multi-select差分の追加/削除を表示

対象:
- public/admin/free-diagnosis-v2-analysis.js

現状:
- diffのtop-level statusだけ表示し、APIが返すadded / removedを利用していない。
- Q2/Q3/Q7の部分追加・部分削除がすべて「ヒアリング後に変更」になる。

Required:
- Q2/Q3/Q7のmulti-select diffで、APIのadded / removedを日本語ラベルへ変換して表示する。
- Difference-first UXとして少なくとも以下を区別する。
  - 変更なし
  - ヒアリング後に変更
  - 追加
  - 外した項目
- added / removedがある場合、それぞれの値をoperatorが確認できる形で表示する。
- frontend側で独自に差分判定ロジックを再構築せず、API diffをSSOTとして使う。
- Q4/Q5/Q6 single-selectは既存status表現を維持してよい。

Acceptance:
- 「A→A+B」はBが追加と分かる。
- 「A+B→A」はBが外した項目と分かる。
- 「A→B」は変更として認識できる。
- Browser testで追加/削除を直接assertする。

## 4. Fix 3 — 「現在の分析」レイヤー見出し追加

対象:
- public/admin/free-diagnosis-v2-analysis.js
- 必要なら対応HTML/CSS

Required:
- Post-Hearing右列に、各分析sectionをまとめるoperator-facing見出し「現在の分析」を明示する。
- 既存section名:
  - 実現したい会社の未来
  - 現在どこまで分かっているか
  - 技術・運用・管理から見た確認ポイント
  - まだ確認できていないこと
  - 次に確認する価値があること
  は維持する。
- Internal term（Rule Result / Generated Narrative等）を追加しない。

Acceptance:
- Browser testで「現在の分析」が直接表示されることをassertする。

## 5. Fix 4 — Browser Acceptanceの直接assert拡張

対象:
- test/freeDiagnosisDesignV2AdminUx.browser.test.ts
- 必要ならfixture/helperのみ最小変更

次を直接assertする。

### Original / Live
1. Original Q1〜Q7が日本語表示
2. Originalは編集不能
3. Live HearingにCurrent editorなし
4. Viewpoint表示
5. M01〜M06 / Primary/Secondary Focusなし
6. caseId欠落時guard
7. Liveから案件一覧へ戻れる
8. LiveからPost-Hearingへ進める

### Post-Hearing editability / validation
9. Q2〜Q7だけ編集対象
10. Q1編集不可
11. Q2 NO_MAJOR_CHANGE / UNDECIDED exclusivity
12. Q3 UNDECIDED exclusivity + max 2
13. Q7 UNDECIDED exclusivity + max 3
14. Q4/Q5/Q6 single select
15. Original表示値がCurrent editで変わらない

### Difference-first
16. 変更なし
17. ヒアリング後に変更
18. multi-select追加
19. multi-select削除

### Analysis / narrative
20. 「現在の分析」表示
21. Generated/system narrativeがread-only
22. fresh Human EditをUIから保存可能
23. REANALYSIS_REQUIRED中はHuman Edit保存不可
24. stale Human Edit warning

### Failure / retry
25. Current SaveとRe-analysisが別request
26. Re-analysis failure後Current保持
27. retry可能

### Safety / navigation / responsive
28. Post-HearingからLiveへ戻れる
29. Post-Hearingから案件一覧へ戻れる
30. Healthy caseで人工的Gap表示なし
31. AI interestでsolution recommendation表示なし
32. free text XSS-safe
33. mobile/narrowでOriginal/Hearing/Currentの区別維持
34. Design v2未初期化guard

既存integration/unit assertionsで間接的に保証されていても、Source Reviewで要求された主要UI契約はBrowser testで直接確認する。

## 6. Preserve existing Package D boundaries

変更してはいけない:
- Live Hearing = 2-column, Original read-only + Hearing
- LiveにCurrent State editor / Re-analysis / Narrative editorを置かない
- Post-Hearing = Original / Hearing Record / Current Understandingの3-layer
- Q1 read-only, Q2〜Q7 editable
- memoはAnalyzer inputにしない
- Current SaveとRe-analysisは別HTTP call
- Re-analysis failureでHuman Current Stateをrollbackしない
- stale Human Edit auto merge禁止
- Package A analyzer semantics
- Package B persistence semantics
- Package C API semantics

## 7. Forbidden scope

本Fixで禁止:
- migrations 027〜033変更
- migration 033 Production適用
- DB schema追加
- Public Survey変更
- Package E Report/Review/Approval/Delivery/Feedback実装
- HA7
- deploy
- Production traffic変更
- KPI implementation
- 大規模refactor

## 8. Regression

Fix後に最低限:
- Package D memo integration
- Package D Browser desktop/mobile
- Package C API
- Package B persistence
- Package A Golden
- HA6 Vertical Slice
- HA6 Browser desktop/mobile
- npm run build

を再実行する。

既知V1 Golden 2件はPRE-EXISTING / NON-BLOCKINGとして修正しない。

## 9. Deliverable

- 変更ファイル一覧
- exact code commit SHA
- Browser Acceptanceのassert追加内容
- 全regression結果
- worktree clean確認

Fix commit後STOPする。

次はPackage D Source Review再実施であり、Human Acceptance / Package Eへはまだ進まない。
