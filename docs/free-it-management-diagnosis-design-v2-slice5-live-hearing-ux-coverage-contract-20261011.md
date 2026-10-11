# IT経営KAIZEN 無料診断 Design v2 — Slice 5 Live Hearing UX / Coverage Contract

Status: DESIGN v2 IMPLEMENTATION CONTRACT / NO IMPLEMENTATION YET
Date: 2026-10-11

## 1. Purpose

本書は、Design v2 の60分Hearingを、HA6のM01〜M06別固定質問列から、**Surveyを見ながら自然に会話し、レポート価値を上げるために必要な確認視点を漏らさないCoverage型Hearing**へ変更するためのUX契約を固定する。

Hearingは診断ロジックそのものではない。
Hearingで得た内容はObservation / reference materialであり、Hearing後にHumanがCurrent Structured Stateを更新するための材料となる。

録音・文字起こし・音声解析はDesign v2の対象外とする。

---

## 2. Core Principle

Hearingの品質は、固定質問を何問消化したかでは評価しない。

評価対象は、**Initial Analysis / Report Draftをより正確・具体的にするために必要な視点を、自然な会話の中でどこまで確認できたか**である。

したがって：

- M01〜M06を顧客との会話章にしない
- Primary / Secondary Focusで質問順を固定しない
- 固定questionSequenceを完了条件にしない
- Surveyですでに明示されている内容を同じ粒度で聞き直さない
- 1つの質問・回答で複数の確認視点を満たしてよい
- 技術 / 運用 / 管理を別々の会話セクションに分けない
- Hearing memoをRuleへ直接入力しない

Hearingは「質問の消化」ではなく「必要な理解の解像度を上げること」を目的とする。

---

## 3. Live Hearing Screen Layout

Live Hearingは**2-column**を基本とする。

### Left — Original Survey

顧客が回答したOriginal Surveyをread-onlyで表示する。

表示対象：

- Q1 Company Context
- Q2 Future
- Q3 IT Expectation
- Q4 Current Interest
- Q5 Visibility
- Q6 Management Connection / Decision Usability
- Q7 Interest Theme

表示原則：

- Original Surveyは編集不可
- semantic codeではなく顧客向け表示文を主表示
- MULTI_SELECTは選択項目をまとめて見やすく表示
- Q5/Q6は「顧客が回答時点でそう認識していた内容」であることが分かる表現とする
- Hearing中にOriginal Surveyを書き換えるUIを置かない

必要ならOriginal Surveyの下部に、Initial Analysisの要約をread-onlyで表示してよい。ただしSurveyとSystem Analysisを視覚的に混同させない。

### Center — Hearing Workspace

中央を会話支援の主作業領域とする。

上から以下の順を基本とする。

1. 今回確認したい視点
2. optional example questions
3. Hearing memo / statements
4. Hearing終了導線

Current Structured Stateの編集UIはLive Hearingには置かない。

Hearing中に「診断結果を確定する」操作を要求しない。

---

## 4. Hearing Viewpoint Contract

### 4.1 Viewpointとは

Viewpointは固定質問ではなく、**今回のSurvey / Initial Analysisから見て、60分で確認するとレポート価値が上がる視点**である。

例：

- 事業をどのように広げようとしているか
- 少人数で運営できる状態とは具体的にどのような状態か
- 今の仕事の進め方で事業拡大を支えられそうか
- 事業が増えたとき負担が増えそうな仕事はどこか
- 経営には現在どのようなIT・業務情報が届いているか
- 何が経営判断に使えて、何が使いにくいか
- 欲しいが届いていない情報はあるか
- AI・自動化を使ってみたい業務はあるか
- まだ具体化できていないことは何か

### 4.2 Viewpoint Generation Source

ViewpointはDesign v2 Analyzerの以下から生成する。

- Future
- Current Understanding
- UNKNOWN
- Q4 Current Interest
- 3-lens possibility / confirmation value
- FACT Candidateの前段となる未確認事項

Q7 Interest Themeはviewpoint追加要因にはなり得るが、解決策推薦には使わない。

### 4.3 Viewpoint Object

論理的には以下を持つ。

```ts
interface HearingViewpoint {
  viewpointCode: string;
  label: string;
  whyItMatters: string;
  relatedLenses: Array<'TECHNOLOGY' | 'OPERATION' | 'MANAGEMENT'>;
  sourceRefs: string[];
  exampleQuestions?: string[];
}
```

`relatedLenses`は複数可。

`sourceRefs`は例として、`Q2:LEAN_GROWTH`, `Q5:VISIBLE_PARTIAL`, `Q6:REPORTED_NOT_DECISION_USABLE` 等を保持できる。

ViewpointはFindingでもFACTでもない。

---

## 5. Viewpoint Prioritization

画面上で大量のViewpointを並べない。

初期表示は原則5〜8件程度を上限目安とし、重複するものは統合する。

優先順位は概ね以下。

1. Q4 Current Interestに直接関係する未確認事項
2. Future達成に影響し得るUNKNOWN
3. Q5/Q6の認識を具体化する視点
4. Future × IT Expectation × Interest Themeから生じる改善可能性
5. その他の補助確認

ただし「順位＝重要度スコア」ではない。
顧客との自然な会話順をOperatorが自由に選べる。

---

## 6. Example Question Contract

各Viewpointには必要に応じて1〜3個のExample Questionを持てる。

Example Questionは営業支援であり、必須質問ではない。

例：

Viewpoint:
`事業が増えたとき負担が増えそうな仕事はどこか`

Example Questions:

- 「今のやり方のまま事業が増えたら、どこが一番大変になりそうですか？」
- 「人を同じ割合で増やさずに成長するとしたら、今の仕事の中で気になる部分はありますか？」

Viewpoint:
`経営判断に使えている情報 / 使いにくい情報`

Example Questions:

- 「経営には今どんなITや業務の情報が届いていますか？」
- 「その中で、判断に使いやすいものと使いにくいものはありますか？」

### Guard

Example Questionは以下を避ける。

- Survey回答をそのまま聞き直す
- Solutionを前提にする誘導質問
- 「AIを導入すべきですか」のような解決策選択
- 技術用語ありきの質問
- M01〜M06順に聞くためだけの質問

---

## 7. Lightweight Coverage Status

Coverage管理は営業の確認漏れ防止のための**軽量UI補助**に限定する。

Viewpointごとに必要なら以下の状態を持てる。

- `NOT_YET` — まだ確認していない
- `COVERED` — 会話の中で十分確認できた
- `NOT_NEEDED` — 今回は確認不要とHumanが判断

重要：

- Coverage StatusはRule Inputではない
- 全ViewpointをCOVEREDにすることをHearing完了条件にしない
- NOT_NEEDEDを自動判定しない
- Status数をスコア化しない
- 1つの会話で複数ViewpointをCOVEREDにしてよい
- Coverage Statusは顧客向けReportには直接出さない

もし初回実装でCoverage StatusがUIを重くする場合、Viewpoint一覧 + memoのみでもDesign v2の成立要件は満たせる。

---

## 8. Hearing Memo / Statement Contract

Hearing中の記録は既存HA6のappend-oriented Hearing基盤を原則再利用する。

記録対象は、会話で確認した内容・顧客発言・Operatorメモ。

最低限：

- statement / memo text
- created_at
- created_by
- case_id

既存の`hearing_statement_v2`等が持つprovenance / append-only性はKEEP候補とする。

### Important Guard

Memo / statement本文は、Systemが直接semantic codeへ変換しない。

禁止する流れ：

`Hearing memo → AI/System interpretation → Current Structured State自動更新`

Design v2の正しい流れ：

`Hearing memo → Humanが読む → Post-HearingでCurrent Structured Stateを必要箇所だけ更新`

---

## 9. Hearing Completion

Hearing終了ボタンは、固定質問の全消化を要求しない。

終了時にOperatorへ短い確認を出してよい。

例：

- 今回確認したい主な視点は十分確認できましたか
- Survey回答と認識が変わった箇所はありましたか
- まだ分からないことは残っていますか

これはchecklistであり、診断ロジックではない。

Hearing終了後はPost-Hearing Analysisへ遷移する。

---

## 10. Transition to Post-Hearing Analysis

Live Hearing終了後、画面責務を切り替える。

### Live Hearing

- Original Survey参照
- Viewpoint参照
- Memo記録
- 会話に集中

### Post-Hearing Analysis

- Original Survey
- Hearing Record
- Current Structured State編集
- Re-analysis
- Generated Narrative
- Human Edit

Live Hearing中にCurrent Structured Stateを編集させない理由は、会話と診断確定作業を分離し、Operatorの認知負荷を下げるためである。

---

## 11. HA6 Reuse / Replace Mapping

### KEEP

- `hearing_statement_v2`等のappend-oriented Hearing記録基盤
- HearingのCase紐付け
- Staff authentication / admin guard
- existing audit trail
- Survey参照UIの考え方

### ADAPT

- `public/admin/free-diagnosis-v1.html` のHearing workspace
- Hearing開始導線
- Survey表示
- memo保存UI

### REPLACE FROM CORE FLOW

- `structuredHearing.ts` のM01〜M06固定catalogをDesign v2のHearing Source of Truthとして扱うこと
- Primary / Secondary Focus別の固定questionSequence
- question completionをHearing進捗とみなす考え方
- Hearing Structured AnswerをそのままFinal Ruleへ入力する流れ

既存コードは後方互換のため残してもよいが、Design v2のLive Hearingの正本にはしない。

---

## 12. HA6-like Example

Original Survey:

- Q2: BUSINESS_GROWTH + LEAN_GROWTH
- Q3: PRODUCTIVITY + MANAGEMENT_DECISION_SUPPORT
- Q4: MANAGEMENT_DECISION
- Q5: VISIBLE_PARTIAL
- Q6: REPORTED_NOT_DECISION_USABLE
- Q7: AI

Live Hearing Viewpoints example:

1. 事業をどのように広げようとしているか
2. 少人数で成長・運営するとはどのような状態か
3. 今の仕事の進め方で、事業が増えたとき負担が増えそうなところはどこか
4. 経営にはどのようなIT・業務情報が届いているか
5. その中で、判断に使えるもの / 使いにくいものは何か
6. AI・自動化を使ってみたい具体的な業務はあるか
7. まだ経営として把握できていないことは何か

自然な会話例：

「今のやり方のまま案件が増えたら、どこが一番大変になりそうですか？」

この1問から、

- 少人数成長の具体像
- 運用負荷
- 自動化可能性
- 情報の集め方
- 管理の見え方

など複数Viewpointを同時に確認してよい。

---

## 13. Non-goals

Slice 5では以下を行わない。

- recording
- transcription
- AI note summarization
- memoからの自動semantic更新
- M01〜M06 scoring
- question completion score
- maturity / risk score
- solution recommendation
- Current Structured State編集
- Report生成

Current Structured State編集以降はSlice 4 / Slice 6以降の責務である。

---

## 14. Acceptance Conditions

Slice 5実装は最低限、以下を満たすこと。

1. Live Hearingが2-columnである
2. Original Surveyがread-onlyで見える
3. Current Structured State編集がLive Hearingに存在しない
4. 固定M01〜M06 questionSequenceを完了条件にしない
5. Analyzer由来のViewpointが短く見やすく表示される
6. Example Questionはoptionalである
7. Hearing memoを保存できる
8. MemoはRuleへ直接入力されない
9. 1つの会話で複数Viewpointを満たせる
10. Hearing終了後にPost-Hearing Analysisへ進める
11. recording関連UI / schema / APIを追加しない

---

## 15. Slice 5 Completion Gate

本Contractの確定により、Live Hearingの責務は以下に固定する。

**Original Surveyを見る**
→ **今回確認する価値があるViewpointを見る**
→ **自然に会話する**
→ **必要な内容をMemoとして残す**
→ **Post-Hearing Analysisへ渡す**

Hearing中に診断を確定しない。

次Sliceでは、Post-Hearing 3-column Analysis UXを具体化し、Original / Hearing / Current / Generated Narrativeを1画面でHumanが扱えるようにする。

この文書の時点では、production code変更、migration、test実行、HA7、build、deploy、traffic変更は行わない。
