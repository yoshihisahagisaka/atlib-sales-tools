# IT経営KAIZEN 無料診断 Design v2 — Golden Rule Contract

Status: DESIGN v2 GOLDEN CONTRACT / IMPLEMENTATION NOT STARTED
Date: 2026-10-11
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

本書は、Design v2 の実装に入る前に、診断Ruleが絶対に守る意味・Guard・代表ケースをGolden Contractとして固定する。

今後の実装では、コード構造より本書の期待挙動を優先する。
HA6の既存RuleやM01〜M06へ合わせて本書を曲げない。

無料診断の目的は、ITを採点することではなく、

- 実現したい会社の未来
- 現在どこまで分かっているか
- 技術 / 運用 / 管理から見た確認ポイントと改善可能性
- まだ分からないこと
- 次に確認する価値があるFACTと、そのFACTを確認すると何が分かりそうか

を整理し、経営として次にどこを見る価値があるかを明らかにすることである。

---

## 2. Non-negotiable invariants

### GR-I01 Survey is Recognition, not FACT

Survey Answerは顧客の回答時点の認識であり、FACTではない。
Survey由来Narrativeは原則「〜という認識です」「〜について確認価値があります」等の表現を使い、実態を断定しない。

### GR-I02 Original Survey is immutable after completion

回答途中はdraftとして更新可能だが、Survey Complete時点のOriginal Survey Snapshotは変更不可。
Post-Hearingで修正するのはCurrent Structured Stateであり、Originalを上書きしない。

### GR-I03 Hearing record is not direct Rule input

Hearing memoはObservation / reference materialである。
メモ本文をAIやSystemが自動解釈してCurrent Stateを書き換えない。

### GR-I04 Human updates Current Structured State

Post-Hearingで人間がQ2〜Q7相当の現在値を維持・変更する。
再分析はHuman Updated Current Structured Stateを入力として実行する。

### GR-I05 Same deterministic analysis before and after Hearing

Initial AnalysisとPost-Hearing Re-analysisは、入力Stateは異なっても同じ意味Ruleを使う。
Hearing後だけ別の診断思想に切り替えない。

### GR-I06 Future / Expectation / Interest alone never creates a Problem

Q2 Future、Q3 IT Expectation、Q7 Interest Theme単独では、Problem / Gap / Finding / Recommendation / Assessment Scopeを作らない。

### GR-I07 Interest is not Recommendation

AI、Automation、Security等への関心は確認視点を増やすだけで、導入・対策・製品選定を自動決定しない。

### GR-I08 技術 / 運用 / 管理 are multi-lens

3つは排他的分類ではない。
1つの論点へ複数lensを同時に適用できる。

### GR-I09 UNKNOWN is a valid result

分からないことを無理に推測で埋めない。
UNKNOWNは「失敗」ではなく、次に何を確認する価値があるかを作る入力である。

### GR-I10 Healthy case must remain healthy

大きな懸念が見えない場合、問題やAssessment需要を捏造しない。
継続確認やFuture readinessだけを示してよい。

### GR-I11 Free Diagnosis stops before evidence certification

無料診断はFACT Candidateまで。
Evidenceを取得してFACT / Finding / Gapを確定するのはAssessment。

### GR-I12 Human decides

Current State変更、Narrative編集、Report承認、Assessmentへ進む判断はHuman Decision。
SystemはSuggestion / Possibility / UNKNOWN / FACT Candidateを提示する。

### GR-I13 Generated and edited narrative remain separate

System Generated NarrativeとHuman Edited Narrativeは論理的に分離して保持する。
Current State更新で再生成した際、既存Human Edited Narrativeを無条件に上書きしない。

### GR-I14 No recording requirement

Design v2では録音機能を実装要件に含めない。
Hearing Recordはmemo / statementで成立する。

---

## 3. Rule precedence

Rule適用順は以下を原則とする。

1. Guard / epistemic rule
2. Direct semantic interpretation
3. Cross-combination analysis
4. 3-lens possibility / confirmation value
5. UNKNOWN generation
6. Hearing Coverage
7. FACT Candidate generation
8. Narrative assembly / duplicate suppression

GuardとCross Ruleが衝突した場合、Guardを優先する。

例:
Q7=AI が選択されていても、AI導入推奨は生成しない。
Future=事業拡大でも、現在問題があるとは断定しない。

---

## 4. Core analysis combinations

### GR-C01 Future × Visibility × Management Connection

Q2 Future × Q5 Visibility × Q6 Management Connection

目的:
そのFutureに対して、現在どこまで見え、経営判断につながっているかを整理する。

この組合せからCurrent Understanding / Management confirmation value / UNKNOWNを作る。

### GR-C02 Future × IT Expectation × Interest Theme

Q2 Future × Q3 IT Expectation × Q7 Interest Theme

目的:
技術 / 運用 / 管理から見た改善可能性を作る。

Solution決定ではない。

### GR-C03 Current Interest × Visibility × Management Connection

Q4 Current Interest × Q5 Visibility × Q6 Management Connection

目的:
Hearingで解像度を上げる価値が高い視点を決める。

### GR-C04 Future change × operational scalability

事業拡大、少人数運営、新事業、働き方変更等のFutureがある場合、現在の仕事の進め方がその変化に耐えられるかをOperation lensで確認対象にできる。

ただしSurveyだけで「手作業が多い」「属人化している」等を断定しない。

---

## 5. Golden Cases

以下は実装後にGolden Testへ落とすべき代表ケースである。
文言は完全一致より意味一致を優先するが、禁止される結論は厳密に守る。

### GOLDEN-01 HA6-like Growth / Small Team / Management Decision / AI

Input:
- Q2: BUSINESS_GROWTH + LEAN_GROWTH
- Q3: PRODUCTIVITY + MANAGEMENT_DECISION_SUPPORT
- Q4: MANAGEMENT_DECISION
- Q5: VISIBLE_PARTIAL
- Q6: REPORTED_NOT_DECISION_USABLE
- Q7: AI

Expected:
- Future narrative: 事業拡大と少人数運営を目指す
- IT expectation: 生産性向上と経営判断支援
- Current: 一定の把握・報告はあるが、経営判断へ十分つながっているか確認余地
- 技術: AI / 自動化等の活用可能性。ただし対象業務は未確認
- 運用: 現在の仕事の進め方が拡大時にも無理なく回るか確認価値
- 管理: 何が経営へ届き、何が判断に使え / 使いにくいか確認価値
- UNKNOWNを残す
- FACT Candidateを生成できる

Must NOT:
- AI導入を推奨
- システム連携不足を断定
- 手作業過多を断定
- Assessment Scopeを自動確定

### GOLDEN-02 Healthy / Strategically Connected

Input:
- Q2: NO_MAJOR_CHANGE
- Q3: RESILIENCE or UNDECIDED
- Q4: UNDECIDED
- Q5: VISIBLE_FULL or VISIBLE_MOSTLY
- Q6: STRATEGICALLY_CONNECTED
- Q7: UNDECIDED

Expected:
- 大きな問題を強制生成しない
- 「現時点では大きな懸念は見えにくい」等の表現を許容
- Future readiness / 継続的に把握・判断できる状態か、程度の確認に留める

Must NOT:
- Gapを捏造
- Assessment必要と自動判定
- 3 lensすべてに無理な改善テーマを作る

### GOLDEN-03 AI Interest Only

Input:
- Q7: AI
- 他回答はHealthyまたは特に問題を示さない

Expected:
- AIへの関心を記載可能
- Hearing Coverageとして「どの業務で使いたいか」を追加可能

Must NOT:
- AI導入推奨
- Productivity problem生成
- System renewal / integration problem生成
- Assessment Scope変更

### GOLDEN-04 Security Interest Only

Input:
- Q7: SECURITY
- Q5/Q6はHealthy

Expected:
- SecurityはInterestとして扱う
- 「現在の対策」だけでなく「経営としてリスクや事業影響をどこまで把握・判断できるか」を確認視点にできる

Must NOT:
- Security risk existsと断定
- 脆弱性があると断定
- 外部監査が必要と自動決定

### GOLDEN-05 Future change + Low Visibility

Input:
- Q2: BUSINESS_GROWTH or NEW_BUSINESS_OR_WORKSTYLE
- Q5: LOW_VISIBILITY
- Q6: UNKNOWN or MANAGED_NOT_REPORTED

Expected:
- 今後の変化に対し、現在見えていない部分が判断や運営へ影響しないか確認価値を示す
- Management / Operation lensを付与可能
- UNKNOWN / FACT Candidateへ接続

Must NOT:
- 「把握不足が問題」と断定
- 原因を属人化やシステム不備と決めつける

### GOLDEN-06 Q6 Managed but Not Reported

Input:
- Q6: MANAGED_NOT_REPORTED

Expected:
- 「管理はされているが経営へ継続的に届いていないという認識」と表現
- Management lensで、何を管理しており、何が経営に届いていないかを確認対象にできる

Must NOT:
- IT管理そのものが不十分と自動断定

### GOLDEN-07 Reported but Not Decision Usable

Input:
- Q4: MANAGEMENT_DECISION
- Q5: VISIBLE_PARTIAL
- Q6: REPORTED_NOT_DECISION_USABLE

Expected:
- 一定の情報はある
- 何が判断に使え、何が使いにくいかを具体化する価値を示す
- FACT Candidateとして報告内容・頻度・作られ方等を候補化可能

Must NOT:
- 情報不足だけが原因と決めつける
- Reporting processだけが原因と決めつける

### GOLDEN-08 Future Undecided

Input:
- Q2: UNDECIDED

Expected:
- Futureがまだ具体化していないことをそのまま表現
- Hearing Coverageとして「今後1〜3年で変えたい / 守りたいこと」を具体化する視点を作る

Must NOT:
- SystemがFutureを補完・推測
- 技術投資テーマを先に決める

### GOLDEN-09 Post-Hearing Current State Change

Original:
- Q5: VISIBLE_PARTIAL
- Q6: REPORTED_NOT_DECISION_USABLE

Hearing Record:
- 実際は定期報告がほとんどなく、必要時に担当者へ確認していることが判明

Human Updated Current State:
- Q5: RELIES_ON_OTHERS
- Q6: MANAGED_NOT_REPORTED

Expected:
- Original Surveyは変更されない
- Hearing Recordも変更されない
- Current StateのみHumanが変更
- 同じdeterministic ruleを再実行
- Narrativeは「都度確認」「経営への継続的報告がない」方向へ更新

Must NOT:
- Hearing memo本文からSystemが自動更新
- Original Surveyを上書き

### GOLDEN-10 Future itself changes after Hearing

Original:
- Q2: BUSINESS_GROWTH

Hearing:
- 「既存事業拡大というより、新規事業を立ち上げることが中心」と確認

Human Updated Current State:
- Q2: NEW_BUSINESS_OR_WORKSTYLE

Expected:
- Report FutureはUpdated Stateを使う
- Original回答は監査可能に残る
- 3 lens / UNKNOWN / FACT CandidateもUpdated Futureを基準に再分析

Must NOT:
- Originalを修正
- 「回答が間違っていた」とネガティブ評価

### GOLDEN-11 Human Edited Narrative preservation

State AからSystem Narrative Aを生成し、HumanがNarrative A'へ編集済み。
その後Current Stateを変更し、System Narrative Bを再生成。

Expected:
- A'を無条件上書きしない
- Bを新しいSystem Generated Narrativeとして保持
- Human Edited Narrativeは要再確認状態にする、または明示的Human actionでBから再編集する

### GOLDEN-12 Multi-lens Same Issue

Situation:
「経営判断に必要な情報が遅い」可能性がある。

Expected lenses:
- 技術: 自動集計・連携等の可能性
- 運用: 報告プロセス・締め・確認手順の可能性
- 管理: 何をいつ誰に報告するか、指標設計の可能性

Must NOT:
- 1つのlensへ排他的に分類
- 最初から技術解決を優先

### GOLDEN-13 UNKNOWN can resolve

Initial:
- 更新予定 / IT投資予定がUNKNOWN

After Hearing + Human Update:
- 一部は把握できているとCurrent State / clarificationで確定

Expected:
- そのUNKNOWNはcurrent analysisから外せる
- Original時点のUNKNOWNは履歴として残る

### GOLDEN-14 Known can become UNKNOWN

Initial:
- 経営として把握できている認識

Hearing:
- 実際には担当者ごとに認識が異なり、根拠が確認できない

Human Update:
- UNKNOWN / RELIES_ON_OTHERS等へ変更

Expected:
- current UNKNOWNを新たに生成可能
- 初期認識をFACTとして固定しない

### GOLDEN-15 FACT Candidate contract

任意の確認対象について、FACT Candidateは少なくとも以下を表現できる。

- What to verify
- Why it matters to Future
- What may become knowable
- Related lens(es)

Example:
「月次集計・社内確認の実態を確認することで、事業拡大時の負荷がどこで増えるのか、自動化が有効なのか、運用見直しが先なのかを判断する材料が得られそう。」

Must NOT:
- 確認前に原因や解決策を確定

### GOLDEN-16 Free Diagnosis / Assessment boundary

Expected:
Free Diagnosis:
Future → Current → Possibility / UNKNOWN → FACT Candidate

Assessment:
Evidence → Verification → FACT / UNKNOWN → Finding / Gap → Judgment Material

Must NOT:
- Free DiagnosisでFACT certification
- Free DiagnosisでSolution決定
- Free Diagnosisで価格 / Scopeを自動確定

---

## 6. Narrative assembly rules

Report / Initial Analysisの文章は以下の順序を基本とする。

1. Future
2. IT Expectation
3. Current Recognition / Current Understanding
4. 技術 / 運用 / 管理から見た確認ポイント・改善可能性
5. UNKNOWN
6. Next FACT Candidate + Expected Learning

同義文を複数Ruleから重複生成しない。
同じ意味の確認ポイントは統合してよい。

顧客向け文言では、内部semantic codeやM01〜M06等を表示しない。

---

## 7. Hearing Coverage contract

Hearingでは固定質問完了率を品質指標にしない。

生成対象は「今回確認したい視点」であり、自然な会話で複数視点を同時に満たしてよい。

Coverage例:
- Futureの具体像
- 事業変化時に負荷が増えそうな仕事
- 経営へ届く情報
- 判断に使える / 使いにくい情報
- 関心テーマをどの業務・場面で考えているか
- まだ確認できていないこと

Live Hearing UIは2列:
- Left: Original Survey
- Center: Coverage + Hearing memo

録音機能は持たない。

---

## 8. Post-Hearing Analysis contract

Post-Hearing Analysis UIは3列:
- Left: Original Survey
- Center: Hearing Record
- Right: Current Structured State + Generated Narrative

HumanがCurrent Stateを変更した後に明示的再分析を行う。

ReportのSource of TruthはOriginal SurveyでもHearing memoでもなく、Human Updated Current Structured State + Human Reviewed Narrativeである。

---

## 9. Report Golden Contract

Customer Reportは5章を基本とする。

1. 実現したい会社の未来
2. 現在どこまで分かっているか
3. 技術・運用・管理から見た確認ポイントと改善可能性
4. まだ分からないこと
5. 次に確認する価値があるFACT + そのFACTを確認すると何が分かりそうか

Healthy Caseでは第3〜5章が短くてもよい。
空欄を避けるためだけに問題を作らない。

---

## 10. Implementation acceptance gate for Slice 1

Slice 1完了条件は、少なくとも本書のGolden Casesを将来のtest fixtureへ落とせるほど入力・期待結果・Guardが明確であること。

この時点ではまだ以下を行わない。

- production code patch
- migration作成 / 適用
- HA7
- build / deploy
- Production traffic変更

次Sliceは Survey Contract / Semantic Projection / Initial Narrative の具体実装設計である。
