# IT経営KAIZEN 無料診断 Design v2 — Healthy Case / Solution Hypothesis Case Validation

Status: DESIGN v2 VALIDATION CHECKPOINT / implementation not yet started
Date: 2026-10-10
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

HA6型ケースで確認したDesign v2が、問題が強く出ないHealthy Caseと、顧客が特定ソリューションに関心を持つSolution Hypothesis Caseでも破綻しないかを紙上検証する。

確認したいことは次の2点。

1. Healthy Caseで、無理に課題・改善余地・Assessment需要を作らないこと。
2. AI等の関心テーマがあっても、システムがそのソリューションを自動推薦せず、Future / Current / Hearingを基準に確認価値を整理できること。

共通前提：

- Original Surveyは顧客の回答時点の認識でありFACTではない。
- Hearing memo / recordingは診断ロジックへ直接入力しない。
- Hearing後、人間がCurrent Structured Stateを必要に応じて変更する。
- 同じDeterministic Ruleを再実行してNarrativeを再生成する。
- Human Edited Narrativeは可能だが、編集によってFACTへ昇格しない。
- 技術 / 運用 / 管理は問題分類ではなく、Futureに対する改善可能性・確認価値を見る3つのレンズ。
- Free DiagnosisはWhere should we look?まで。AssessmentはEvidenceを確認し、Human Decisionの材料を揃える。

---

# Case A — Healthy Case

## 2. Case intent

現在のIT管理・報告が比較的整っており、Futureとの大きな乖離も見えない会社を想定する。

このケースで、Design v2が「診断だから何か問題を出さなければならない」という方向へ流れないことを確認する。

## 3. Original Survey

### Q1 Company Context

- 従業員数: 51〜100人
- 主な拠点数: 2〜3か所

### Q2 Future

- 売上・事業を成長させたい
- 安心して事業を続けられる会社にしたい

Semantic State:
- BUSINESS_GROWTH
- BUSINESS_CONTINUITY

### Q3 IT Expectation

- 経営判断を支えたい
- 安心して事業を続けられるようにしたい

Semantic State:
- MANAGEMENT_DECISION_SUPPORT
- RESILIENCE

### Q4 Current Interest

- セキュリティや事業継続に関すること

Semantic State:
- SECURITY_AND_CONTINUITY

### Q5 Visibility

- 全体として把握できている

Semantic State:
- VISIBLE_FULL

### Q6 Management Connection / Decision Usability

- 経営課題や事業計画と結びつけて報告・提案され、経営判断に活用できている

Semantic State:
- STRATEGICALLY_CONNECTED

### Q7 Interest Theme

- セキュリティ
- システムの老朽化・更新

Semantic State:
- SECURITY
- SYSTEM_LIFECYCLE

## 4. Initial Analysis

### 4.1 Future

> 売上・事業の成長を進めながら、安心して事業を継続できる会社を目指している。その実現に向けて、ITには経営判断を支えることと、事業継続を支える役割を期待している。

### 4.2 Current Understanding

> 現時点では、業務・ITの状況を全体として把握できているという認識があり、ITに関する情報も経営課題や事業計画と結びつけて報告・提案され、経営判断に活用できていると捉えている。

ここでは「良好」「成熟している」と評価しない。顧客認識をそのまま現在理解として表現する。

### 4.3 技術レンズ

> セキュリティやシステム更新への関心があり、今後の事業成長と継続性を支えるうえで、現在の対策や更新計画が将来の変化にも対応できるかを確認する価値がある。一方、アンケート回答だけから新たな技術導入が必要とは判断できない。

### 4.4 運用レンズ

> 現時点の回答からは、日々の運用に明確な問題があるとは読み取れない。事業成長や環境変化があっても現在の運用を無理なく継続できるかについて、必要な範囲で確認する。

### 4.5 管理レンズ

> IT情報が経営判断へ接続しているという認識があるため、管理・報告の不足を前提とした確認は行わない。将来の事業成長や更新・セキュリティ対応まで含めて、現在の管理の仕組みが継続的に機能するかを確認する価値がある。

### 4.6 UNKNOWN

アンケートだけでは、少なくとも次はまだFACTではない。

- 実際のセキュリティ対策状況
- システム更新計画の具体性
- EoL / 保守期限 / 更新優先順位の管理実態
- 事業成長に伴う新たなリスクや負荷

ただし、これらを「問題がある」と表現しない。

## 5. Hearing Coverage

Healthy Caseでは、問題探しではなく、アンケートの認識がFutureに対して十分な解像度を持つかを確認する。

Glanceable viewpoints:

- 今後どのような事業成長を想定しているか
- その成長でIT環境にどんな変化が起こりそうか
- 経営へどのようなIT情報が届いているか
- セキュリティや更新予定は、どのように経営判断へ組み込まれているか
- 将来の更新・投資予定まで見通せているか
- 現時点で経営として判断に困っていることは本当にないか

固定質問ではない。1つの会話で複数視点を満たしてよい。

## 6. Hypothetical Hearing Result

営業メモ例：

- 毎月、IT責任者から障害・費用・主要リスクの報告がある。
- 半期ごとに3年先までの主要システム更新予定が提示されている。
- EoL一覧も管理され、更新予算も事業計画へ織り込んでいる。
- 新規拠点追加の計画があり、ネットワーク・認証・端末調達の標準化も検討済み。
- 経営者として、現時点でITについて特に判断できず困っている事項はない。

## 7. Post-Hearing Human Update

このケースでは、Q2〜Q7のCurrent Structured Stateを変更しない。

Original SurveyとCurrent Stateが一致していてよい。

Human Edited Narrativeとして、具体性だけ加える。

例：

> IT運用に関する主要な情報は定期的に経営へ共有されており、主要システムの更新予定やEoLも中期的に管理されている。現時点では、経営判断に必要なIT情報が大きく不足している状況は確認されなかった。

## 8. Final Report Draft

### 8.1 実現したい会社の未来

> 売上・事業の成長を進めながら、安心して事業を継続できる会社を目指している。ITには、経営判断を支えることと、事業継続を支える役割を期待している。

### 8.2 現在どこまで分かっているか

> IT運用に関する主要な情報は定期的に経営へ共有され、主要システムの更新予定やEoLも中期的に管理されている。現時点では、経営判断に必要なIT情報が大きく不足している状況は確認されなかった。

### 8.3 技術・運用・管理から見た課題・改善可能性

> 現時点のヒアリングでは、直ちに改善が必要と考えられる明確な課題は確認されなかった。今後の事業成長や新規拠点追加に伴ってIT環境が変化する場合には、現在の管理・運用・セキュリティの仕組みを継続できるかを確認していくことに価値がある。

技術・運用・管理の各レンズで「必ず1件ずつ課題を出す」ことは禁止する。

### 8.4 まだ分からないこと

> 無料診断では、実際の設定、契約、構成、ログ、更新期限等のEvidence確認までは行っていない。そのため、現在の認識と実態が一致していることをFACTとして確認したわけではない。

### 8.5 次に確認する価値があるFACT

Healthy Caseでは、Assessmentを売るために無理にFACT Candidateを増やさない。

候補例：

> 今後の拠点追加や事業拡大が具体化した時点で、現行の更新計画・セキュリティ・運用体制が新しい規模でも維持できるかを必要に応じて確認する。

「今すぐ有料Assessmentが必要」という結論は出さない。

## 9. Healthy Case Result

**PASS**

確認結果：

- 問題のない可能性をそのまま表現できる。
- 技術・運用・管理の3レンズが「課題を強制作成する箱」になっていない。
- UNKNOWNとProblemを分離できる。
- Assessmentを無理に必要扱いしない。
- Free Diagnosis単体で「現時点では大きな確認事項なし」という価値ある結果を返せる。

---

# Case B — Solution Hypothesis Case

## 10. Case intent

経営者が「AIを使いたい」と強く考えているケースを想定する。

このケースで、Q7 AIを根拠にシステムがAI導入を推薦しないこと、Hearingによって実際の課題が別の場所にあると分かった場合にCurrent State / Narrativeを人間が適切に更新できることを確認する。

## 11. Original Survey

### Q1 Company Context

- 従業員数: 31〜50人
- 主な拠点数: 1か所

### Q2 Future

- 売上・事業を成長させたい
- 社員が本来の仕事に集中できる会社にしたい

Semantic State:
- BUSINESS_GROWTH
- FOCUS_ON_CORE_WORK

### Q3 IT Expectation

- 生産性を高めたい
- 人を大きく増やさずに回せるようにしたい

Semantic State:
- PRODUCTIVITY
- LEAN_OPERATION

### Q4 Current Interest

- 日々の業務の効率や生産性に関すること

Semantic State:
- PRODUCTIVITY

### Q5 Visibility

- おおむね把握できている

Semantic State:
- VISIBLE_MOSTLY

### Q6 Management Connection / Decision Usability

- 経営判断に必要な情報として整理され、ある程度活用できている

Semantic State:
- DECISION_USABLE

### Q7 Interest Theme

- AI・生成AI
- 業務の自動化・効率化

Semantic State:
- AI
- AUTOMATION

## 12. Initial Analysis

### 12.1 Future

> 売上・事業を成長させながら、社員が本来の仕事に集中できる会社を目指している。その実現に向けて、ITには生産性向上と、人を大きく増やさずに業務を回せる状態を支える役割を期待している。

### 12.2 Current Understanding

> 現在の業務・ITについてはおおむね把握できているという認識があり、経営判断に必要な情報も一定程度活用できていると捉えている。

### 12.3 技術レンズ

> AI・生成AIや業務自動化への関心があり、生産性向上や少人数運営を支える手段となる可能性がある。ただし、どの業務へ適用する価値があるか、AIや自動化が本当に適切な手段かはまだ分からない。

ここで「AI導入が必要」「生成AIを導入すべき」とは出さない。

### 12.4 運用レンズ

> 生産性向上を考えるうえでは、現在どの仕事に時間がかかっているか、確認・承認・転記・情報探索など業務の進め方そのものに改善余地がないかを確認する価値がある。

アンケートから「手作業が多い」と断定しない。

### 12.5 管理レンズ

> 経営判断に必要な情報は一定程度活用できているという認識があるため、管理の不足を前提にしない。AIや自動化を検討する場合には、期待する成果や対象業務を経営上どのように判断するかを整理する価値がある。

## 13. Hearing Coverage

- どの業務で「AIを使いたい」と考えているか
- 現在その業務にどのくらい時間がかかっているか
- 何が大変なのか：作成、検索、転記、確認、承認、判断、問い合わせ等
- AIを使うこと自体が目的になっていないか
- 現在の業務手順を変えるだけで改善できる余地はないか
- 必要なデータや情報はそろっているか
- AIで改善した場合、何が変われば経営上価値があるのか

これらは固定質問ではなくCoverage Viewpoint。

## 14. Hypothetical Hearing Result

営業メモ例：

- 経営者は「生成AIで見積作成を自動化したい」と考えている。
- 実際の見積作成時間は10〜15分程度。
- それよりも、営業担当から必要情報がそろうまで平均2〜3日待つことが多い。
- 必要情報がメール、チャット、口頭でばらばらに届く。
- 情報がそろえば見積作成自体は難しくない。
- 顧客別条件や値引き判断は営業責任者の確認が必要。
- 経営者はヒアリング後、「AIより先に情報の集め方を整える話かもしれない」と認識した。

重要：このメモ自体は診断を直接変更しない。

## 15. Post-Hearing Human Update

Original Surveyは保持する。

Q7のInterest Themeは、顧客が現在もAIへ関心を持っているなら変更しなくてよい。

一方、Current Understanding Narrativeは人間が次のように具体化する。

> 見積作成そのものより、作成に必要な情報が営業担当からそろうまでの待ち時間が大きいことが確認された。AI・自動化は引き続き関心テーマだが、現時点では、AI導入の前に情報収集や確認の流れを整理することで改善できる可能性もある。

必要ならQ4 Current InterestはPRODUCTIVITYのまま維持。

このケースは「AIへの関心が間違いだった」とするのではなく、Solution Hypothesisと実態を分離する。

## 16. Deterministic Re-analysis + Human Narrative

### 技術

> AI・自動化は生産性向上の選択肢になり得るが、今回の確認では、見積作成処理そのものが主な負荷であるとは確認されなかった。どの工程を技術で支援する価値があるかは、業務全体を見て判断する必要がある。

### 運用

> 見積作成に必要な情報が複数の経路から届き、情報がそろうまで待ちが発生している。情報収集・確認の進め方を整理することで、AI導入とは別に改善できる可能性がある。

### 管理

> 値引きや顧客別条件には責任者判断が必要であり、どこまでを標準化・自動化し、どこを人が判断するかを明確にすることが重要になる。

ここではAIの適否を確定しない。

## 17. Final Report Draft

### 17.1 実現したい会社の未来

> 売上・事業を成長させながら、社員が本来の仕事に集中できる会社を目指している。ITには、生産性向上と、人を大きく増やさずに業務を回せる状態を支える役割を期待している。

### 17.2 現在どこまで分かっているか

> 見積業務については、見積書を作成する作業そのものよりも、必要な情報がそろうまでの待ち時間が大きいことが確認された。情報はメール、チャット、口頭など複数の経路から届き、条件によっては責任者判断も必要となっている。

### 17.3 技術・運用・管理から見た課題・改善可能性

> AI・自動化は引き続き検討可能な選択肢だが、現時点ではAI導入だけで解決すべき課題とは判断できない。情報収集・確認の流れを整理する運用面と、標準化できる範囲・人が判断する範囲を明確にする管理面をあわせて確認する価値がある。

### 17.4 まだ分からないこと

- 情報待ち時間の実測値と発生頻度
- どの情報項目が不足しやすいか
- 顧客別条件・値引き判断のパターン
- 情報収集方法を変えた場合の改善余地
- そのうえでAI / 自動化を適用する価値が残るか

### 17.5 次に確認する価値があるFACT

Candidate 1:

> 見積作成依頼から必要情報がそろうまでの実際の時間と、不足しやすい情報項目を確認する。

Expected value:

> これを確認することで、主なボトルネックが見積作成処理そのものなのか、情報収集・確認の流れなのかを判断する材料が得られそう。

Related lens:
- 運用
- 管理
- 技術

Candidate 2:

> 見積条件のうち、標準ルールで処理できるものと、責任者判断が必要なものを確認する。

Expected value:

> これを確認することで、自動化できる範囲と人間が判断すべき範囲を整理し、AIや他の技術を使う場合の適用価値を判断する材料が得られそう。

Related lens:
- 技術
- 管理

## 18. Solution Hypothesis Case Result

**PASS**

確認結果：

- Q7 AIはInterestとして扱われ、Recommendationへ自動変換されない。
- AIを使いたいという顧客意向を否定せず、仮説として保持できる。
- Hearingによって、より大きい運用上の論点が見えた場合にNarrativeを人間が修正できる。
- 技術 / 運用 / 管理の複数レンズを同時に使える。
- 「AIか業務改善か」の二者択一ではなく、確認すべきFACTを示せる。
- Assessmentは「AI導入可否判定」ではなく、ボトルネックと適用範囲をEvidenceで確認する工程として自然につながる。

---

# 19. Cross-case findings

HA6型、Healthy、Solution Hypothesisの3ケースを通した結果、Design v2の上位構造は整合している。

### Confirmed principles

1. Surveyだけで価値あるInitial Analysisを生成できる。
2. Hearingは診断ロジックの直接入力ではなく、Human Updateのための確認材料である。
3. HumanがCurrent Structured Stateを変更し、同じRuleを再実行する。
4. System Generated NarrativeをHumanが必要に応じて編集できる。
5. Healthy Caseでは課題を強制生成しない。
6. Interest ThemeをSolution Recommendationへ変換しない。
7. 技術 / 運用 / 管理は排他的分類ではなく複数適用可能なレンズである。
8. Free DiagnosisはProblem / Solutionを確定せず、Possibility / UNKNOWN / Next FACT Candidateを返す。
9. Assessmentは、そのFACT CandidateをEvidenceで確認してHuman Decision材料へ変える。

## 20. Design issue found during validation

上位構造はPASSだが、実装前に1点を明示的に固定する必要がある。

### Report section 3 wording

現在の仮タイトル：

> 技術・運用・管理から見た課題・改善可能性

Healthy Caseでは「課題」が存在しないことがあるため、顧客向け見出しは次のような中立表現の方がDesign v2に適合する可能性が高い。

Candidate:

> 技術・運用・管理から見た確認ポイントと改善可能性

or

> 技術・運用・管理から見た現在の整理

内部ContractではProblemがないことを許容しているため、顧客向け見出しも課題存在を前提にしないことが望ましい。

この見出しは次のReport Contract確定時にDecisionする。

## 21. Gate

このCheckpointでは以下を行わない。

- HA6 source change
- DB schema change
- migration
- implementation
- build
- deploy
- HA7 creation
- Production traffic change

次工程はDesign v2 Report Contract / Current Understanding Contractの確定。その後、現行HA6実装を事実ベースで取得し、1:1 Fit/Gapへ進む。
