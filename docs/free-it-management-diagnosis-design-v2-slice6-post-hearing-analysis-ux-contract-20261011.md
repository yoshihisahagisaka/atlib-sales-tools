# IT経営KAIZEN 無料診断 Design v2 — Slice 6 Post-Hearing Analysis UX Contract

Status: DESIGN v2 IMPLEMENTATION CONTRACT / NO IMPLEMENTATION YET
Date: 2026-10-11
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

本書は、60分Hearing後に営業担当者が「顧客が最初に答えたこと」「Hearingで確認したこと」「現在の理解」を混同せずに見比べ、必要なStructured StateだけをHuman Decisionで更新し、同じdeterministic analyzerを再実行できるPost-Hearing Analysis画面のUX契約を定義する。

この画面はAI要約画面ではない。

目的は、Hearingの記録からSystemが自動判断することではなく、人間がHearing Recordを読んでCurrent Structured Stateを必要な箇所だけ更新し、その結果として診断文を再生成することである。

---

## 2. Core principle

Post-Hearing Analysisは以下の3層を同時に見せる。

1. Original Survey
2. Hearing Record
3. Current Structured State + Analysis / Narrative

これらを一つの情報として混ぜない。

Original Survey = 顧客の回答時点の認識

Hearing Record = 会話で得られた発言・メモ

Current Structured State = Hearingを踏まえてHumanが現在の理解として採用したStructured Answer

System Generated Narrative = Current Structured Stateからdeterministicに生成した文章

Human Edited Narrative = 生成文をHumanが顧客向けに必要な範囲で編集した文章

---

## 3. Screen layout

Post-Hearing AnalysisのDesktop標準UIは3-columnとする。

### Left column — Original Survey

目的:
- 顧客が最初に何と答えたかを常に確認できる
- Hearing後の理解との差分を見失わない
- Originalを誤って上書きしない

表示内容:
- Q1 Company Context
- Q2 Future
- Q3 IT Expectation
- Q4 Current Interest
- Q5 Visibility
- Q6 Management Connection / Decision Usability
- Q7 Interest Theme

状態:
- Read only
- 編集操作なし
- 「元の回答」等、顧客向けではないがOperatorが誤解しない日本語表示にする

Original Surveyには「正しい／誤り」の表示をしない。

---

### Center column — Hearing Record

目的:
- Human Updateの判断材料を確認する
- 顧客発言や営業メモをCurrent Stateと混同しない

表示内容:
- Hearing memo / statements
- 時系列または入力順
- 必要に応じて発言・メモの区別
- Live Hearingで使用したViewpointの参照

重要:
- Hearing Recordはread-only reviewを基本とする
- Post-Hearing Analysis画面でHearing Recordを修正してCurrent Stateへ変換する操作は持たない
- Hearing Recordの文面自体をRuleへ直接渡さない
- 自動semantic extractionを行わない
- 録音・文字起こしは対象外

---

### Right column — Current Understanding

右列がHuman Decisionの作業領域である。

右列は少なくとも以下の2 sectionに分ける。

#### A. Current Structured State

- Q2 Future
- Q3 IT Expectation
- Q4 Current Interest
- Q5 Visibility
- Q6 Management Connection / Decision Usability
- Q7 Interest Theme

Q1 Company Contextは原則OriginalをそのままContextとして参照し、通常のPost-Hearing更新対象にはしない。

各設問はDesign v2 Question Contractと同じStable Semantic Code / 選択肢を使用する。

Humanは:
- Originalのまま維持
- Single selectを変更
- Multi selectを追加 / 削除

できる。

自由文Hearing memoをStructured Stateの代わりにしない。

#### B. Current Analysis / Narrative

Current Structured Stateに対する最新analysisを表示する。

表示対象:
- 実現したいFutureの理解
- 現在どこまで見えているか
- 技術Lens
- 運用Lens
- 管理Lens
- UNKNOWN
- Next FACT Candidate
- System Generated Narrative
- Human Edited Narrative

---

## 4. Difference-first UX

Post-Hearing Analysisでは、全項目を毎回再入力させない。

初期Current Structured StateはOriginal Surveyから作成されるため、最初はOriginal = Currentである。

Operatorは差異がある項目だけ変更する。

各Current項目にはOriginalとの差分状態を表示できる。

Recommended internal diff states:
- UNCHANGED
- CHANGED
- ADDED
- REMOVED

ただし顧客向けの点数や良否表示にはしない。

例:

Original Q5:
`VISIBLE_PARTIAL`
「分かることと分からないことがある」

Current Q5:
`RELIES_ON_OTHERS`
「担当者に確認しないと分からないことが多い」

UIでは「変更あり」を視覚的に識別できればよい。

重要:
- 差分そのものを問題・Gap扱いしない
- 「顧客が間違っていた」と表現しない
- Hearingにより現在理解が具体化した、という扱いにする

---

## 5. Save and re-analysis interaction

Current State編集とAnalysis再実行は、ユーザーが何が起きるか理解できる操作にする。

Recommended primary action:

**現在の理解を保存して再分析**

処理順:

1. Current Structured State validation
2. new Current State revision save
3. deterministic analyzer run
4. new Analysis Result save
5. new System Generated Narrative save
6. UI refresh

保存と再分析を裏で曖昧に一体化しない。

状態表示例:
- 変更なし
- 未保存の変更あり
- 保存済み / 再分析済み
- Current State保存済み / 再分析失敗

再分析失敗時もHumanが入力したCurrent State revisionを消さない。

---

## 6. Structured State validation

保存前にQuestion Contract上のGuardを適用する。

Examples:
- Q2 NO_MAJOR_CHANGEと他Futureを原則同時選択不可
- Q2 UNDECIDEDと他Futureを原則同時選択不可
- Q3 UNDECIDEDと具体Expectationの同時選択不可
- Q7 UNDECIDEDと具体Themeの同時選択不可
- Q3は原則最大2
- Q7は原則最大3

Guard違反時はCurrent Stateを保存しない。

Validation messageは内部コードではなく自然な日本語にする。

---

## 7. Narrative interaction

System Generated NarrativeはCurrent Stateから再生成される。

Human Edited Narrativeは別レイヤーとして表示する。

基本UI:

- 「システム生成文」 read-only
- 「顧客向け文面」 editable

Human Edited Narrativeが存在しない場合:
- 顧客向け文面の初期表示はSystem Generated Narrativeをコピーして編集開始できる

Human Edited Narrativeが存在する状態でCurrent Stateを変更し、新しいGenerated Narrativeが作成された場合:
- 古いHuman Edited Narrativeを削除しない
- `STALE_REVIEW_REQUIRED` として扱う
- 「現在の分析が更新されています。編集済み文面を確認してください」等の警告を表示する

Operatorは:
- 新しいGenerated Narrativeへ戻す
- 既存Human Editを見ながら再編集

できる。

Systemが自動マージして確定しない。

---

## 8. Narrative edit scope

Human Editの目的は顧客向けに具体性・読みやすさを高めることである。

Allowed examples:
- Hearingで確認した具体的な業務名を補足
- 「IT情報」など曖昧な名詞を、確認済みの範囲で具体化
- 冗長な文章の整理
- 顧客のFutureに合わせた表現の調整

Human Editによって行ってはいけないこと:
- Evidence未確認事項をFACTと断定
- System / SaaS / AI導入を確定
- Assessment Scopeを自動確定
- Original Surveyを書き換える
- Current Structured Stateと矛盾する意味変更を無意識に行う

Current Stateと大きく意味がずれる文章編集を完全自動で禁止する必要はないが、Human Reviewで確認可能にする。

---

## 9. Analysis presentation

技術 / 運用 / 管理は3列にしない。

Right column内のAnalysis sectionとして表示する。

一つの論点に複数lensが同時に付くことを視覚的に表現できる。

Example:

「経営判断に必要な情報が遅い」

Related lenses:
- 技術
- 運用
- 管理

これは3つの別問題という意味ではない。

---

## 10. UNKNOWN presentation

UNKNOWNは「不足点」「悪い状態」ではなく、現時点で判断材料が足りない論点として表示する。

Recommended Japanese labels:
- まだ確認できていないこと
- 追加で確認すると判断しやすくなること

避ける:
- 欠陥
- 不備
- リスク確定
- 問題点

Hearingで確認できたことはCurrent State更新またはNarrative具体化によりUNKNOWNから外れる。

逆にHearingによって「実は分かっていなかった」と判明した論点は、新たにUNKNOWNとなってよい。

---

## 11. FACT Candidate presentation

FACT CandidateはPost-Hearing画面でも確認できる。

各Candidateは少なくとも以下を表示する。

- 次に何を確認するか
- なぜそのFutureに関係するか
- 確認すると何が分かりそうか
- 関連lens

Example:

### 確認すること
経営へ共有されているIT・業務情報の内容、頻度、作成元

### なぜ確認するか
少人数で事業を拡大する中で、経営判断に必要な情報が継続的に得られるかを確認するため

### 確認すると分かりそうなこと
情報そのものが不足しているのか、報告方法や管理方法に改善余地があるのかを判断する材料が得られそう

Related lenses:
- 管理
- 運用

FACT CandidateはそのままAssessment Scope確定ではない。

---

## 12. Healthy Case behavior

Healthy Caseでも同じ3-column画面を使用する。

Current Stateが良好な認識の場合、Analysisは無理に問題を生成しない。

Example:
- Visibility = VISIBLE_FULL / VISIBLE_MOSTLY
- Q6 = DECISION_USABLE / STRATEGICALLY_CONNECTED
- Future change limited

表示例:
「現時点では、ITの把握や経営判断への接続について大きな懸念は見えにくい状態です。」

Next FACT Candidateがゼロまたは少数でもよい。

Assessmentへ誘導するためにGapを人工的に作らない。

---

## 13. Solution Interest behavior

Q7 AI / AUTOMATION / CLOUD / SECURITY等があっても、Right columnにSolution Recommendationを表示しない。

表示できるのは:
- 関心テーマ
- Futureとの関係
- 改善可能性
- UNKNOWN
- 次に確認するFACT

Example:
「AI導入を推奨します」ではなく、
「AI・自動化によって少人数での成長を支えられる可能性があります。ただし、どの業務へ適用する価値があるかは未確認です。」

---

## 14. Human responsibility / audit

Current State変更はHuman Decisionである。

最低限保持したい情報:
- who changed
- when changed
- previous revision
- new revision

Narrative editも同様にHuman操作として追えることが望ましい。

この画面でSystemが勝手にCurrent Stateを変更する機能は持たない。

---

## 15. Navigation

Live Hearing終了後の主要導線:

Live Hearing
→ Post-Hearing Analysis
→ Current State必要箇所更新
→ Save + Re-analyze
→ Narrative確認 / 必要ならHuman Edit
→ Report Draft

戻り導線を持つ。

Post-Hearing Analysisから:
- Hearing Record確認へ戻る
- Case一覧へ戻る
- Report Draftへ進む

ことができる。

「次へ」を押すと前画面へ戻れない構造にしない。

---

## 16. UX language

内部用語をそのまま表示しない。

Avoid customer/operator-facing raw labels:
- Semantic Projection
- Current Structured State
- Generated Narrative
- Rule Result
- UNKNOWN Code

Recommended UI labels:
- 最初の回答
- ヒアリング記録
- 現在の理解
- 再分析結果
- 顧客向け文面
- まだ確認できていないこと
- 次に確認する価値があること

必要なら開発用data attribute / codeとして内部名を保持してよい。

---

## 17. Non-goals

Slice 6では以下を設計対象外とする。

- recording
- transcription
- AI hearing summary
- AI semantic update
- AI narrative rewrite
- drag & drop report builder
- Assessment execution UI
- pricing / proposal automation
- dashboard score
- maturity score

---

## 18. Acceptance contract for implementation

実装時、最低限以下が成立すればSlice 6 UXはPASSとする。

1. Original Surveyがread-onlyで見える
2. Hearing Recordが別列で見える
3. Current Q2〜Q7をHumanが編集できる
4. OriginalとCurrentの差分が分かる
5. Current保存でnew revisionが作られる
6. 同じdeterministic analyzerで再分析される
7. Hearing memoはRuleへ直接入力されない
8. Generated NarrativeとHuman Edited Narrativeが分離して見える
9. Current更新後の旧Human Editが無条件上書きされない
10. 技術 / 運用 / 管理をmulti-lensとして表示できる
11. UNKNOWNが問題認定されない
12. FACT CandidateがWhat / Why / Expected Learning / lensesを持つ
13. Healthy Caseで無理なGapを作らない
14. Q7 InterestからSolution Recommendationを作らない
15. 前画面へ戻れる

---

## 19. Relationship to HA6

HA6のAdmin画面、Case navigation、Hearing record、Review / Report基盤は再利用対象。

ただし以下はDesign v2のPost-Hearing AnalysisのSource of Truthにしない。

- M01〜M06別のHearing完了状態
- Hearing Structured Answerを直接Final Ruleへ入れる流れ
- Primary / Secondary Focusを中心にした最終判断

Design v2では:

Original Survey
+ Hearing Record
→ Human updates Current Structured State
→ deterministic re-analysis

が唯一の再分析レーンとなる。

---

## 20. STOP gate

この文書の時点では以下を行わない。

- production code変更
- migration作成 / 適用
- test実行
- HA7
- build
- deploy
- Cloud Run変更
- Production traffic変更

次工程はSlice 7 Report / FACT Candidate / Human Review接続Contractである。
