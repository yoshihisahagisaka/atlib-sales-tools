# IT経営KAIZEN 無料診断 Design v2 — Package D Admin UX Implementation Contract

Status: READY FOR BOUNDED IMPLEMENTATION AFTER PACKAGE C CLOSE
Date: 2026-10-11
Base expectation: Package C final fix commit `9fc0cbaef90480dafe525de667da52bf92260ea3`

## 1. Goal

Package Dは、Package Cで確定したDesign v2 Admin APIを使い、営業担当者が60分HearingとHearing後のCurrent Understanding整理を実際に行えるAdmin UXを実装する。

Package Dは次の2画面責務を持つ。

1. Live Hearing — 2-column
2. Post-Hearing Analysis — 3-column

Package DではReport Draft / Human Review / Approval / Delivery / Feedbackへはまだ接続しない。

## 2. Source of Truth / precedence

優先順位:

1. 本Package D Implementation Contract
2. Slice 5 Live Hearing UX / Coverage Contract
3. Slice 6 Post-Hearing Analysis UX Contract
4. Package C API Boundary / Implementation Contract
5. Package B persistence contract
6. Package A domain / Survey Question Contract

矛盾時は、Persistence / API integrityについてPackage B/Cを優先し、表示・操作UXについてPackage D / Slice 5 / Slice 6を優先する。

## 3. Core UX principles

- Live Hearingでは会話に集中する。
- Live HearingにCurrent Structured State編集UIを置かない。
- Hearingは固定質問の消化ではなくViewpoint coverageで支援する。
- M01〜M06を顧客との会話章として表示しない。
- Surveyで既に分かっている内容を同じ粒度で聞き直さない。
- Hearing memoはHuman referenceでありRule Inputではない。
- Post-HearingでHumanがCurrent Stateを必要箇所だけ更新する。
- Original Survey / Hearing Record / Current Understandingを混同しない。
- Raw semantic code / internal engineering termをoperator-facing UIへ出さない。
- 戻り導線を常に持つ。
- recording / transcription / AI semantic extractionは実装しない。

## 4. Page architecture

HA6既存Admin flowを大規模に書き換えない。

推奨はDesign v2専用ページをadditiveに作ること。

Candidate:

- `public/admin/free-diagnosis-v2-hearing.html`
- `public/admin/free-diagnosis-v2-analysis.html`
- `public/admin/free-diagnosis-v2.css`
- `public/admin/free-diagnosis-v2-hearing.js`
- `public/admin/free-diagnosis-v2-analysis.js`

実際のファイル命名は既存Admin conventionへ合わせてよい。

既存 `public/admin/free-diagnosis-v1.html` を全面置換しない。

Design v2導線を既存Case画面へ追加する場合も最小差分に限定する。

## 5. Case identification / guard

両画面は明示的なCase IDを受け取る。

例:

`?caseId=<uuid>`

Case IDがない / invalid / Design v2 Original未初期化の場合は、推測でHA6 dataからDesign v2 stateを作らず、operatorへ日本語で利用不可状態を表示する。

例:

`この案件はDesign v2の準備が完了していません。`

この画面からOriginal Surveyを捏造・自動初期化しない。

## 6. Live Hearing — 2-column layout

Desktop標準は2-column。

### Left — 最初の回答

read-onlyで表示:

- Q1 会社の状況
- Q2 実現したい会社の未来
- Q3 ITに期待していること
- Q4 現在特に確認したいこと
- Q5 現在の把握状況
- Q6 IT管理・経営報告の状況
- Q7 関心のあるITテーマ

表示はsemantic codeではなく日本語ラベルを主とする。

Q5/Q6は「回答時点での認識」であることが分かる補足を付けてよい。

Original Surveyは編集不可。

### Right — ヒアリング

上から:

1. 今回確認したい視点
2. optional example questions
3. Hearing memo / statement list
4. memo追加UI
5. Hearing終了 / Post-Hearingへ進む導線

Current State editor / Narrative editor / re-analysis buttonはLive Hearingには置かない。

## 7. Hearing Viewpoints

ViewpointsはPackage A Analysis Resultに含まれる `hearingViewpoints` 相当をSourceとする。

Front-end独自ルールで新しいFinding / Problem / Recommendationを生成しない。

表示原則:

- 原則5〜8件程度までを見やすく表示
- label
- why useful / why it matters
- related lenses（技術 / 運用 / 管理）
- example questionsがあれば1〜3件

Example questionsは「質問してください」ではなく「聞き方の例」等の補助表示にする。

M01〜M06 code / focus code / question sequenceを表示しない。

Coverage statusはPackage D初回実装では永続化しない。

`NOT_YET / COVERED / NOT_NEEDED` のDB保存・新migrationは作らない。

Viewpoint一覧 + Hearing memoだけで成立させる。

## 8. Hearing memo persistence

既存append-only Hearing Record基盤を再利用する。

まず実装前に既存HA6のHearing Statement POST API / repoをFit確認する。

### Reuse condition

既存endpointが、Design v2で必要なplain memo / statementをM01〜M06 semantic answerなしで安全にappendできる場合は再利用する。

### Adapter condition

既存endpointがfixed hearing unit / structured answerを必須としDesign v2 memo用途と意味が混ざる場合のみ、Design v2 Admin namespaceへ最小memo endpointを追加してよい。

Conceptual:

`POST /api/admin/free-diagnosis-v1/cases/:id/design-v2/hearing-statements`

Requirements:

- server-side authenticated actor
- append-only `hearing_statement_v2` reuse where schema allows
- text required
- optional viewpoint reference may be display metadata only
- `structured_answer_json`をAnalyzer sourceにしない
- memoからCurrent Stateを自動更新しない
- migration追加なし

既存schemaがDesign v2 plain memoを意味的に保存できない場合は、無理にDDLを変えずSTOPしてFit/Gapを報告する。

## 9. Live Hearing completion

Hearing終了をfixed-question completionに依存させない。

Operatorが任意のタイミングで:

`ヒアリング後の整理へ進む`

を選べる。

全Viewpoint確認必須、スコア、進捗率は設けない。

必要なら軽い確認文を出してよいがblocking checklistにしない。

## 10. Post-Hearing Analysis — 3-column layout

Desktop標準は3-column。

### Left — 最初の回答

Original Survey Q1〜Q7。
read-only。

### Center — ヒアリング記録

時系列でHearing Recordを表示。
read-only reviewが基本。

Hearing RecordをCurrent Stateへ自動変換する操作を置かない。

### Right — 現在の理解

Human Decisionの作業領域。

少なくとも:

A. 現在の回答 Q2〜Q7 editor
B. Originalとの差分表示
C. 現在の分析
D. システム生成文
E. 顧客向け文面

を持つ。

## 11. Current State editor

Q2〜Q7はSurvey Question Contractと同じStable Semantic Code / 選択肢だけを使う。

UI表示は日本語。
Raw codeは通常表示しない。

Q1は編集対象外。

Guard:

- Q2 `NO_MAJOR_CHANGE` と他Futureを同時選択不可
- Q2 `UNDECIDED` と他Futureを同時選択不可
- Q3 `UNDECIDED` と具体Expectationを同時選択不可
- Q7 `UNDECIDED` と具体Themeを同時選択不可
- Q3は原則最大2
- Q7は原則最大3
- Q4/Q5/Q6はsingle select

Client validationはoperator UX向上用であり、server validationも必ず残す。

## 12. Difference-first UX

全項目を毎回再入力させない。

OriginalとCurrentが同じ場合は「変更なし」。
差がある場合のみ視覚表示する。

Internal diff:

- UNCHANGED
- CHANGED
- ADDED
- REMOVED

Operator-facing wordingは自然な日本語にする。

例:

- 変更なし
- ヒアリング後に変更
- 追加
- 外した項目

差異を「誤り」「問題」「Gap」と表現しない。

## 13. Save / Re-analysis interaction

Package C boundaryを崩さない。

Current State SaveとRe-analysisは別HTTP operation / 別transaction。

UXではPrimary actionとして:

`現在の理解を保存して再分析`

を用意してよい。

ただしfront-endは明示的に:

1. Current State Save API
2. Save successを確認
3. Re-analysis API
4. refresh

の順に呼ぶ。

1つのbackend endpointへ統合しない。

### Failure behavior

Save成功後にRe-analysis失敗:

- Human入力は保存済み
- UIは入力を元に戻さない
- `現在の理解は保存されましたが、再分析に失敗しました` と表示
- `再分析する` retry actionを表示
- analysisFreshness = REANALYSIS_REQUIREDを可視化

未保存変更がある場合はページ離脱時に警告してよい。

## 14. Analysis presentation

Right column内でPackage C Workspaceのlatest Analysisを表示する。

表示対象:

- 実現したい会社の未来
- 現在どこまで分かっているか
- 技術 / 運用 / 管理から見た確認ポイント・改善可能性
- まだ確認できていないこと
- 次に確認する価値があること

技術 / 運用 / 管理を画面全体の3列にしない。

1論点に複数lensが付くことをbadge等で表現してよい。

Problem score / maturity score / risk scoreを作らない。

## 15. UNKNOWN / FACT Candidate language

UNKNOWNは悪い状態として表示しない。

Operator-facing推奨:

- `まだ確認できていないこと`
- `追加で確認すると判断しやすくなること`

FACT Candidateは:

- 次に何を確認するか
- なぜFutureに関係するか
- 確認すると何が分かりそうか
- 関連lens

を表示する。

`Assessment Scope確定` や `要対応` と表示しない。

## 16. System Generated / Human Edited Narrative UX

内部用語を避ける。

UI labels:

- `分析から作成した文面` — read-only
- `顧客向け文面` — editable

Human Editがない場合:

- latest Generated Narrativeを顧客向け文面editorの初期値としてclient-side copyしてよい
- 保存するまではHuman Edit rowを作らない

### Analysis CURRENT時

latest GeneratedをsourceにHuman Editを保存できる。

### Analysis REANALYSIS_REQUIRED時

Human Narrative Edit saveをdisableする。

`先に再分析してください` と表示する。

古いGeneratedをsourceに保存しない。

### Existing stale Human Edit

Current State変更後、新Generatedができた場合、旧Human Editは保持したまま:

`前回の編集文は、現在の分析より前の内容です。確認してください。`

等の警告を出す。

自動マージしない。

UIは:

- 新しい分析文を元に編集を始める
- 前回編集文を参考表示する

を可能にしてよい。

## 17. Operator-facing language

以下のraw termを主表示しない:

- Semantic Projection
- Current Structured State
- Generated Narrative
- Rule Result
- UNKNOWN Code
- FACT Candidate（見出しとしては内部すぎるため避ける）
- M01〜M06

推奨:

- 最初の回答
- ヒアリング記録
- 現在の理解
- 現在の分析
- 分析から作成した文面
- 顧客向け文面
- まだ確認できていないこと
- 次に確認する価値があること

## 18. Navigation

必ず戻り導線を持つ。

Live Hearing:

- 案件一覧へ戻る
- ヒアリング後の整理へ進む

Post-Hearing:

- ヒアリング画面へ戻る
- 案件一覧へ戻る
- Package E未実装のReport actionはactiveにしない

前へ戻れないwizard構造にしない。

## 19. Responsive behavior

Desktopでは2-column / 3-columnを基本とする。

狭いviewportでは縦積みにしてよい。

Mobile / narrow layoutでも:

- Original
- Hearing Record
- Current Understanding

のレイヤー区別が失われないこと。

## 20. Auth / security

既存Admin guardを利用する。

- unauthenticated page/API accessを許可しない
- unsafe HTML injectionを避け、Hearing memo / Human Narrative等のfree textをHTMLとして直接挿入しない
- actorはPackage C API通りserver auth context

## 21. No Report / no Production

Package Dでは以下を行わない。

- Report Draft生成/wiring
- Human Review / Approval wiring
- Delivery / Feedback wiring
- migration追加
- Migration 033 Production適用
- Public Survey flow変更
- HA7 build/deploy
- Production traffic変更

## 22. Minimum acceptance scenarios

最低限browser/integration levelで確認する。

### Live Hearing

1. 2-columnでOriginal + Hearing workspaceが表示される
2. Originalはread-only
3. Q1〜Q7が日本語ラベルで表示される
4. M01〜M06固定質問UIがDesign v2 pageに存在しない
5. hearingViewpointsが表示される
6. example questionsが補助表示される
7. Current State editorがLive Hearingに存在しない
8. memoをappend保存できる
9. memo保存後もsemantic analysisは自動変更されない
10. Hearing終了に全Viewpoint完了を要求しない
11. Post-Hearingへ進める

### Post-Hearing

12. Desktop 3-columnでOriginal / Hearing / Current Understandingを分離
13. Original read-only
14. Hearing Record read-only reference
15. Q2〜Q7だけ編集可能
16. Originalとの差分表示
17. invalid semantic combinationを日本語で防止
18. Save APIとRe-analysis APIを別々に呼ぶ
19. Save成功後Re-analysis失敗でもCurrent編集内容が残る
20. failure時REANALYSIS_REQUIREDとretry action表示
21. retry成功後CURRENTになる
22. Analysisを技術/運用/管理lensで表示
23. UNKNOWNを問題/欠陥と表現しない
24. FACT Candidate相当をWhat/Why/Expected learning/Lensで表示
25. Healthy caseで人工的Gap表示なし
26. Q7 AIだけでAI導入推奨表示なし
27. Generatedはread-only
28. fresh Human Edit保存可能
29. REANALYSIS_REQUIRED中はHuman Edit save不可
30. stale Human Edit warning表示
31. stale Generated sourceでAPI保存しない
32. back navigationあり
33. internal raw codesを主表示しない
34. free text XSS-safe rendering
35. narrow viewportでも3レイヤー区別維持

### Regression

36. Package C API regression PASS
37. Package B persistence regression PASS
38. Package A Golden PASS
39. HA6 Vertical Slice PASS
40. HA6 Browser desktop/mobile PASS
41. TypeScript build PASS

## 23. Commit / STOP gate

Package D code + browser/integration testsをlocal commitしたらSTOP。

推奨commit:

`feat: add free diagnosis design v2 admin ux`

Do not proceed to:

- Package E Report / Human Review integration
- Migration 033 Production execution
- HA7
- deploy
- Production traffic

Source Review + Human Acceptance前にPackage Eへ進まない。
