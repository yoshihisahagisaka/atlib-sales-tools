# IT経営KAIZEN 無料診断 Design v2 — Report / Current Understanding Contract

Status: DESIGN v2 WORKING CANONICAL CANDIDATE
Date: 2026-10-10
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

Survey → Initial Analysis → Hearing → Human Update → Re-analysis → Report を、同じ意味構造のまま一貫して扱うためのContractを定義する。

本Contractの中心は次の考え方である。

> アンケート回答から、最初から価値のある分析文を作る。
> 60分ヒアリングでは実態を確認し、必要な選択肢だけ人間が現在値へ修正する。
> 同じRuleで再分析すれば、ヒアリングを反映したレポートになる。
> 必要な場合だけ、人間が文章を具体化・修正する。

---

## 2. Source layers

診断では、次の情報層を混同しない。

### 2.1 Original Survey

顧客が事前アンケートで実際に回答した内容。

- immutable
- 顧客の回答時点の認識
- FACTではない
- Post-Hearingで上書きしない

### 2.2 Hearing Record

60分ヒアリングで残したメモ、必要に応じた録音、発言例、営業メモ。

- reference / observation material
- diagnosis ruleへの直接入力ではない
- 自動的にCurrent Stateを書き換えない

### 2.3 Current Structured State

Hearing後に人間が確定する「現在の理解」を、Surveyと同じ意味コード体系で表現した構造化状態。

- 初期値はOriginal Survey
- 必要な項目だけHumanが変更
- Q2〜Q7を主対象とする
- Q1 Contextも事実誤認が判明した場合はCurrent Contextとして修正可能。ただしOriginal Surveyは保持
- Deterministic Re-analysisの入力

### 2.4 System Generated Narrative

Current Structured StateからRuleで生成する分析文。

- deterministic
- reproducible
- Humanが編集する前のシステム原文
- FACTではない

### 2.5 Human Edited Narrative

System Generated Narrativeを、人間がHearing内容や顧客文脈に合わせて修正した文章。

- customer-facing wordingの候補
- FACTではない
- Human responsibility
- System Generated Narrativeを消さずに別保存

### 2.6 Approved Report

Human Reviewを通過した顧客向け最終レポート。

---

## 3. Current Structured State Contract

### 3.1 Editable semantic fields

Current Structured Stateは、Survey Question Contractの同じStable Semantic Codeを使う。

- Q2 Future
- Q3 IT Expectation
- Q4 Current Interest
- Q5 Visibility
- Q6 Management Connection / Decision Usability
- Q7 Interest Theme

Q1 Company Contextは補助Contextとして扱う。

### 3.2 Initial value

Post-Hearing Analysis開始時点では、Current Structured State = Original Survey Answer とする。

したがって、人間は「全項目を再入力」しない。

必要な項目だけ変更する。

### 3.3 Change semantics

各Current値には少なくとも次の状態を表示できることが望ましい。

- SAME_AS_SURVEY
- CHANGED_BY_HUMAN

変更理由の短いメモは任意で保持できる。

例：

Original Q5:
- VISIBLE_PARTIAL

Current Q5:
- RELIES_ON_OTHERS

Reason note:
- 「更新予定や投資情報は担当者へ都度確認していることがヒアリングで判明」

### 3.4 No automatic mutation

Hearing Record、録音文字起こし、AI要約等からCurrent Structured Stateを自動変更しない。

将来的にAIが変更候補を提示する場合も、Human approvalがなければ反映しない。

---

## 4. Re-analysis Contract

Current Structured Stateが変更されたら、Original Survey用と同じDeterministic Ruleを再実行する。

Input:

- Current Q2 Future
- Current Q3 IT Expectation
- Current Q4 Current Interest
- Current Q5 Visibility
- Current Q6 Management Connection
- Current Q7 Interest Theme
- Current Q1 Context when relevant

Output:

- Future Understanding
- Current Understanding
- 技術 lens
- 運用 lens
- 管理 lens
- UNKNOWN
- Next FACT Candidate
- Expected value of verifying each FACT

RuleはSurvey時とPost-Hearing時で別物にしない。

---

## 5. Narrative lifecycle

### 5.1 Generate

Current Structured StateからSystem Generated Narrativeを生成する。

### 5.2 Human edit

人間は必要に応じて文章を具体化・修正できる。

例：

System:
> ITや業務について一定の情報は得られている一方、経営判断に使える形へ十分に整理されているか確認余地がある。

Human edit:
> IT費用や障害情報は経営へ共有されている一方、主要システムの更新予定や今後必要となるIT投資については、担当者へ確認しないと把握しにくい状態である。

### 5.3 Structured State changed after manual edit

Human Edited Narrativeが存在した後にCurrent Structured Stateを変更した場合、既存Human Edited Narrativeを自動で消さない。

ただし、System Generated Narrativeは再生成し、Human Edited Narrativeを **要再確認 / STALE** として扱う。

理由：

- 人間の文章をシステムが勝手に上書きしない
- 古いStateを前提にした文章がそのままReportへ流れるのを防ぐ

Humanは、新しいSystem Narrativeを確認したうえで、既存編集文を維持・修正・破棄する。

### 5.4 Customer-facing priority

Report Draftでは、各項目について以下の優先順位を使う。

1. Human Edited Narrative（最新Stateに対して確認済み）
2. System Generated Narrative

Human Edited NarrativeがSTALEの場合は、そのまま最終Reportへ確定できない。

---

## 6. Report Contract

顧客向け無料診断レポートは5章とする。

### Section 1 — 実現したい会社の未来

Purpose:

- Q2 FutureとQ3 IT Expectationを中心に、経営者が何を実現したいのかを整理する。
- ITの話から始めず、会社の未来を起点にする。

Example:

> 事業を拡大しながら、少人数でも無理なく成長・運営できる会社を目指している。その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待している。

### Section 2 — 現在どこまで分かっているか

Purpose:

- Q5 VisibilityとQ6 Management Connectionを中心に、経営として現在どこまで見えているかを整理する。
- 良い / 悪いを採点しない。
- Survey初期認識ではなく、Post-HearingのCurrent Understandingを使う。

### Section 3 — 技術・運用・管理から見た確認ポイントと改善可能性

Customer-facing headingは、従来候補の「課題・改善可能性」から中立化する。

理由：

- Healthy Caseでは明確な課題が存在しないことがある。
- 3レンズは問題を強制的に発見する箱ではない。
- Current Futureに対して、確認価値や改善可能性を見るためのレンズである。

#### 技術

自動化、AI、連携、データ活用、システム変更等でFutureを支えられる可能性を見る。

#### 運用

仕事の進め方、情報の流れ、確認、承認、属人化、手作業等がFutureを支えられるかを見る。

#### 管理

IT管理、経営報告、意思決定、責任、投資・更新計画、Futureとの接続を見る。

Rules:

- 1つの論点に複数lensが関係してよい。
- 各lensに必ず1件のProblemを出す必要はない。
- Healthy Caseでは「現時点で明確な改善事項は確認されなかった」と表現してよい。

### Section 4 — まだ分からないこと

Purpose:

- 60分終了時点でも判断材料が不足していることを明示する。
- UNKNOWNを欠点扱いしない。
- 「確認できていない」ことと「問題がある」ことを分ける。

Example:

> 現在の報告内容は確認できたが、その情報がどのデータから、どの程度の手作業で作られているかは今回のヒアリングでは確認していない。

### Section 5 — 次に確認する価値があるFACT

Purpose:

無料診断の最終価値を、単なる「課題一覧」ではなく「次に何を確認すれば経営判断が進むか」へつなげる。

Each FACT Candidate contains:

- What to verify
- Why it matters to the Future
- What may become knowable after verification
- Related lens: 技術 / 運用 / 管理（複数可）

Example:

> 月次集計に必要な作業時間と情報収集経路を確認することで、事業拡大時の主なボトルネックがどこにあるか、自動化・AI・運用見直しのどれを検討する価値があるかを判断する材料が得られそう。

Important:

「このFACTを確認すればこのSolutionが正しい」とは書かない。

---

## 7. Report item cardinality

レポートを機械的に埋めることを禁止する。

- Section 1: 1 narrative
- Section 2: 1 narrative
- Section 3: lensごとに0..n item
- Section 4: 0..n UNKNOWN
- Section 5: 0..n FACT Candidate

Healthy CaseではSection 4 / 5が少なくてもよい。

Paid Assessmentへの営業都合だけでFACT Candidateを増やさない。

---

## 8. Human control over report content

Human Reviewでは、System提案に対して少なくとも以下を可能とする。

- wording edit
- specific detail addition based on Hearing Record
- omit
- keep
- FACT Candidateの表現修正
- 明らかに不要なFACT Candidateの除外

Humanが新しい確認事項を追加する場合も可能とするが、Hearing Record等の根拠を持つHuman judgmentとして扱い、System由来と区別できることが望ましい。

Systemは、Human Edited NarrativeをFACTとして扱わない。

---

## 9. Healthy output contract

Free Diagnosisは、必ず問題を発見するサービスではない。

次のようなReportも正しい。

> 現時点では、経営判断に必要なIT情報が大きく不足している状況や、直ちに改善が必要な明確な課題は確認されなかった。今後の事業計画やIT環境の変化に応じて、現在の管理・運用が継続できるかを確認していくことに価値がある。

この場合、Assessmentを強く推奨する必要はない。

---

## 10. Solution interest guard

Q7のAI、Automation、Cloud、Security等はInterestであり、Recommendationではない。

Example:

Q7 = AI

Allowed:
> AI・自動化が生産性向上の選択肢となる可能性がある。どの業務へ適用する価値があるかは確認が必要。

Not allowed:
> AI導入が必要です。

Hearingで別の運用問題が見えても、顧客のAI関心を「間違い」と扱わない。

「Interest」と「合理的な適用先が確認できたか」を分離する。

---

## 11. Post-Hearing Analysis UI contract

### Left — Original Survey

- read only
- Original answer
- semantic label

### Center — Hearing Record

- memo
- optional recording reference
- optional transcript / summary in future
- direct rule inputではない

### Right — Current Understanding

上から順に：

1. Current Q2〜Q7 selections
2. changed / unchanged indication
3. Re-analysis action
4. Generated Future / Current Narrative
5. 技術 / 運用 / 管理 lens outputs
6. UNKNOWN
7. Next FACT Candidate
8. Human text edit
9. Report Draft preview

営業はHearing中にこの3列を操作しない。
Post-Hearing Analysisで行う。

---

## 12. Audit / provenance principles

最低限、後から次を区別できる状態を保つ。

- 顧客が最初に何を回答したか
- HumanがどのCurrent valueへ変更したか
- Systemが何を生成したか
- Humanが文章をどう編集したか
- 最終的に何を顧客へ出したか

これにより、Human Decidesと再現性を両立する。

---

## 13. Validation status

本Contractは以下3ケースの紙上検証を通過した設計を前提とする。

- HA6-style case: partial visibility / decision usability issue / AI interest
- Healthy Case: high visibility / strategic connection / no forced problem
- Solution Hypothesis Case: AI interest but actual bottleneck may be operation / management

上位構造はPASS。

---

## 14. Gate / next phase

Design v2の上位Contractとして、以下が揃った。

- Survey Question Contract
- Semantic / Narrative Rule
- Initial Analysis Contract
- HA6 paper simulation
- Healthy / Solution Hypothesis validation
- Report / Current Understanding Contract

次工程は **現行HA6実装の事実取得 → Design v2との1:1 Fit/Gap** とする。

この段階ではまだ以下を行わない。

- implementation change
- DB schema change
- migration
- build
- HA7 creation
- deploy
- Production traffic change

Fit/Gap後に、最小差分のImplementation Contractを作ってから実装へ進む。
