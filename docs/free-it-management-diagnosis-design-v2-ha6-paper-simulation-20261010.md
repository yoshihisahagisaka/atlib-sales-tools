# IT経営KAIZEN 無料診断 Design v2 — HA6 Paper Simulation

Status: DESIGN VALIDATION / PAPER SIMULATION ONLY
Date: 2026-10-10
Branch: `docs/free-diagnosis-design-v2-20261010`

## 1. Purpose

Design v2 の Survey → Initial Analysis → Hearing Coverage → Post-Hearing Human Update → Deterministic Re-analysis → Report Draft が一貫してつながるかを、HA6型ケースで紙上検証する。

本書は実装・DB・migration・deploy・traffic変更を行わない。

重要:
- Original Survey は顧客の回答時点の認識であり FACT ではない。
- Hearing memo / recording は診断Ruleへ直接入力しない。
- Hearing 後、人間が Current Structured State を更新した場合のみ、再分析結果が変わる。
- 下記の Hearing Outcome は Design 検証用の仮想値であり、実際の HA6 顧客事実ではない。

---

## 2. Original Survey — HA6-style test vector

### Q1 Company Context

- 従業員数: 51〜100人
- 主な拠点数: 2〜3か所

Q1 は Context only。単独で Problem / Finding / Scope を発生させない。

### Q2 Future

- `BUSINESS_GROWTH`: 売上・事業を成長させたい
- `LEAN_GROWTH`: 少人数でも無理なく成長・運営できる会社にしたい

### Q3 IT Expectation

- `PRODUCTIVITY`: 生産性を高めたい
- `MANAGEMENT_DECISION_SUPPORT`: 経営判断を支えたい

### Q4 Current Interest

- `MANAGEMENT_DECISION`: 経営判断に関すること

### Q5 Visibility

- `VISIBLE_PARTIAL`: 分かることと分からないことがある

### Q6 Management Connection / Decision Usability

- `REPORTED_NOT_DECISION_USABLE`: 報告・共有はあるが、数字の羅列や専門用語が多く、経営判断には使いにくい

### Q7 Interest Theme

- `AI`: AI・生成AI

注記: Q7=AI は Design v2 の新質問を検証するための仮想入力。旧HA6の自由記述Q7の実回答ではない。

---

## 3. Deterministic Initial Analysis

### 3.1 Future Understanding

**System Generated Narrative**

> 事業を拡大しながら、少人数でも無理なく成長・運営できる会社を目指している。その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待している。

この文章は Q2 + Q3 から確定論的に生成できる。

### 3.2 Current Understanding

**System Generated Narrative**

> 業務・ITについて一定の把握や報告はある一方、経営として十分に見えていない部分があり、現在の情報がそのまま経営判断に使える状態かには確認余地がある。

これは Q5 + Q6 から生成する。

ここで「何が見えていないか」「何の報告が使いにくいか」は断定しない。

### 3.3 Three-lens Initial Analysis

#### 技術

> 自動化・効率化・AI活用など、技術を使って少人数での事業成長を支えられる可能性がある。ただし、どの業務へ適用する価値があるかはまだ分からない。

根拠:
`BUSINESS_GROWTH / LEAN_GROWTH × PRODUCTIVITY × AI`

Guard:
- AI導入推奨にしない。
- 技術的問題があると断定しない。
- 適用業務は未確認とする。

#### 運用

> 現在の仕事の進め方が、事業規模が大きくなっても無理なく回るかを確認する価値がある。

根拠:
`BUSINESS_GROWTH / LEAN_GROWTH`

Guard:
- 手作業、転記、属人化等が実際に存在すると断定しない。

#### 管理

> 一定の情報は経営へ届いている一方、その情報が経営判断に使える形で整理されているかを確認する価値がある。

根拠:
`MANAGEMENT_DECISION × VISIBLE_PARTIAL × REPORTED_NOT_DECISION_USABLE`

Guard:
- 管理が悪いと評価しない。
- 「情報不足」「報告方法」「管理方法」のどこに原因があるかは未確認。

---

## 4. Initial Report Draft before Hearing

アンケート回答だけでも、レポートの骨格は以下まで作れる。

### 1. 実現したい会社の未来

> 事業を拡大しながら、少人数でも無理なく成長・運営できる会社を目指しています。その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待されています。

### 2. 現在どこまで分かっているか

> 業務・ITについて一定の把握や報告はある一方、経営として十分に見えていない部分があり、現在の情報がそのまま経営判断に使える状態かには確認余地があります。

### 3. 技術・運用・管理から見た可能性

- 技術: 自動化・効率化・AI活用で事業成長を支えられる可能性。ただし適用業務は未確認。
- 運用: 現在の仕事の進め方が事業拡大・少人数運営に耐えられるか確認価値あり。
- 管理: 経営へ情報は届いているが、経営判断に使える形か確認価値あり。

### 4. まだ分からないこと

- 事業をどのように広げる計画か。
- 少人数で無理なく回る状態とは具体的に何か。
- 現在の業務で、事業拡大時に負担が増える箇所があるか。
- 経営に何が届き、何が判断に使え、何が使いにくいか。
- AI・自動化を使いたい具体的業務があるか。

### 5. 次に確認する価値があるFACT

この段階では FACT Candidate を確定しすぎない。
Hearing で解像度を上げた後に、人間が Current Structured State を更新し、候補を再生成する。

---

## 5. Hearing Coverage — 質問集ではなく視点

60分で固定質問を順番に消化しない。
アンケートで既に分かっていることは聞き直さず、以下の視点のうち不足しているものを会話で確認する。

### 視点A — Futureの具体像

- 事業をどのように広げようとしているか
- 少人数で無理なく運営できる状態とは何か
- 成長したときに、今と何が変わる想定か

Optional example questions:
- 「事業を広げるというのは、具体的にはどのような展開をお考えですか？」
- 「少人数で無理なく運営できている状態は、御社ではどんな状態ですか？」

### 視点B — Current Operation

- 今の仕事の進め方で事業拡大を支えられそうか
- 負担が増えそうな業務はあるか
- 必要な場合のみ、手作業 / 転記 / 集計 / 確認待ち / 情報探索 / 属人化等へ具体化

Optional example question:
- 「今の仕事の進め方のまま事業が広がった場合、どこが大変になりそうですか？」

### 視点C — Management Connection

- 経営にはどのようなIT・業務情報が届いているか
- 何が経営判断に使えているか
- 何が使いにくいか
- 欲しいが届いていない情報はあるか

Optional example question:
- 「アンケートでは報告はあるが判断に使いにくいとのことでした。実際にはどのような情報が届いていますか？」

### 視点D — AI / Automation Interest

- AIに関心を持った背景
- どの業務で使えたら価値がありそうと考えているか
- その業務の現在の進め方

Optional example question:
- 「AIに関心があるとのことですが、どのような仕事で使えたらよいと考えていますか？」

### Coverage rule

- 一つの会話・発言から複数視点を確認してよい。
- 視点ごとの質問数・完了ノルマを持たない。
- 営業は顧客との会話を優先する。
- Hearing memo / recording は Reference Material であり、直接Rule入力にしない。

---

## 6. Simulated Hearing Outcome for Design Validation

以下は UI / Rule の動きを検証するための仮想ヒアリング結果。実際のHA6事実ではない。

### Hearing memo — Future

- 既存事業の顧客数を増やすことを中心に考えている。
- 人員は大幅には増やさず、現在のチームを中心に対応できる状態を目指している。

### Hearing memo — Operation

- 事業が増えた場合、月次集計と社内確認の負担が増えそうという認識がある。
- ただし、現時点で具体的な作業時間や件数までは確認していない。

### Hearing memo — Management

- 経営にはIT費用と障害に関する情報は届く。
- 担当者に確認しないと、システム更新予定や今後必要となるIT投資は把握しにくい。
- 経営判断に使えている情報と、使えていない情報が混在している。

### Hearing memo — AI

- AIそのものを導入したいというより、集計や情報整理などの負担を減らす手段として関心がある。
- 具体的な適用可否は未確認。

---

## 7. Post-Hearing Human Update

Post-Hearing Analysis は3列:

- Left: Original Survey / immutable
- Center: Hearing memo / recording / observations
- Right: Current Structured State / generated narrative

人間が Hearing memo を見て Current State を更新する。

### Human update decision

#### Q2 Future

Original:
- BUSINESS_GROWTH
- LEAN_GROWTH

Updated:
- 変更なし

補足 Narrative:
> 既存事業の顧客数を増やしながら、大幅な人員増に依存せず現在のチームを中心に運営できる状態を目指している。

#### Q3 IT Expectation

Original:
- PRODUCTIVITY
- MANAGEMENT_DECISION_SUPPORT

Updated:
- 変更なし

#### Q4 Current Interest

Original:
- MANAGEMENT_DECISION

Updated:
- 変更なし

#### Q5 Visibility

Original:
- VISIBLE_PARTIAL

Updated:
- `RELIES_ON_OTHERS`

Human reason:
> IT費用や障害情報は把握できている一方、更新予定や今後のIT投資は担当者へ確認しないと分かりにくいことがヒアリングで確認されたため。

Important:
- Original Surveyは変更しない。
- HumanがCurrent valueを変更する。

#### Q6 Management Connection

Original:
- REPORTED_NOT_DECISION_USABLE

Updated:
- 変更なし

補足 Narrative:
> IT費用や障害に関する報告はある。一方、システム更新や将来投資に関する情報は経営判断に十分使える状態か確認余地がある。

#### Q7 Interest Theme

Original:
- AI

Updated:
- AI
- AUTOMATION

Human reason:
> AI自体より、集計・情報整理等の負担軽減への関心が具体化したため、自動化・効率化もCurrent Interest Themeとして追加。

Guard:
- AI / AUTOMATION が選択されたことはRecommendationを意味しない。

---

## 8. Deterministic Re-analysis after Human Update

### 8.1 Future Understanding

System regenerated:

> 事業を拡大しながら、少人数でも無理なく成長・運営できる会社を目指している。その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待している。

Human edited narrative:

> 既存事業の顧客数を増やしながら、大幅な人員増に依存せず、現在のチームを中心に無理なく運営できる会社を目指している。その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待している。

### 8.2 Current Understanding

Q5 が `RELIES_ON_OTHERS` に更新されたため、初期文から変化する。

System regenerated:

> ITや業務に関する情報の一部は経営へ届いている一方、状況を把握するために担当者への確認が必要な領域があり、経営判断に必要な情報が継続的に得られる状態かには確認余地がある。

Human edited narrative:

> IT費用や障害に関する情報は経営へ共有されている。一方、システムの更新予定や今後必要となるIT投資については、担当者へ確認しないと把握しにくい状態である。

### 8.3 Three lenses

#### 技術

System regenerated:

> AI・自動化・効率化などの技術を使って、少人数での事業成長を支えられる可能性がある。ただし、どの業務へ適用する価値があるか、その方法が合理的かはまだ確認できていない。

#### 運用

System regenerated:

> 事業拡大時に月次集計や社内確認の負担が増える可能性があるため、現在の業務の流れと実際の作業量を確認する価値がある。

注記:
この文の「月次集計や社内確認」は Human Edited Narrative で加えた具体化であり、選択肢だけから自動断定しない。

#### 管理

System regenerated:

> IT情報の一部は経営へ報告されている一方、将来の更新やIT投資を含め、経営判断に必要な情報が継続的に届く状態かを確認する価値がある。

---

## 9. UNKNOWN after Hearing

Hearingで解像度が上がっても、無料診断ではまだ次がUNKNOWNとして残る。

- 月次集計・社内確認が実際に何時間・何件発生しているか
- 負担の原因が技術、運用、管理のどこにあるか
- AI / Automation の適用価値が高い業務はどこか
- 既存システムで対応できるのか、変更が必要なのか
- システム更新予定、契約、EoL、投資計画の実態
- 現在の報告情報がどのデータから、どのように作られているか

これらは Hearing で確認できなかった失敗ではなく、Assessmentで Evidence を確認する候補になり得る。

---

## 10. Next FACT Candidates

### Candidate A — 月次集計・社内確認の実態

**What to verify**
- 対象業務
- 作業手順
- 担当者
- 件数 / 頻度 / 作業時間
- 使用システム / Excel等

**Why it matters**
少人数で事業を拡大するFutureに対して、業務量増加時のボトルネック候補だから。

**What may become knowable**
- 実際に改善価値の高い業務か
- 技術で自動化する価値があるか
- 運用変更で解決できるか
- 両方必要か

**Lens**
技術 / 運用

### Candidate B — 経営へ届くIT情報の内容と作られ方

**What to verify**
- 報告項目
- 頻度
- 作成元データ
- 作成者
- 経営での利用場面
- 欠けている情報

**Why it matters**
事業拡大やIT投資を経営判断する際の材料が十分かを判断するため。

**What may become knowable**
- 情報そのものが不足しているのか
- 報告方法の問題か
- 管理方法の問題か
- 技術的なデータ連携の問題か

**Lens**
管理 / 技術 / 運用

### Candidate C — システム更新・IT投資の管理実態

**What to verify**
- 主要システム / 契約
- 更新時期
- EoL
- 今後の投資予定
- 事業計画との対応

**Why it matters**
事業拡大時に、必要なIT投資を事前に判断できる状態か確認するため。

**What may become knowable**
- 将来投資を計画的に判断できる材料が揃っているか
- 管理情報があるが経営へ届いていないのか
- そもそも管理されていない情報があるのか

**Lens**
管理 / 技術

---

## 11. Customer Report Draft after Hearing

### 1. 実現したい会社の未来

> 御社では、既存事業の顧客数を増やしながら、大幅な人員増に依存せず、現在のチームを中心に無理なく運営できる会社を目指しています。その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待されています。

### 2. 現在どこまで分かっているか

> IT費用や障害に関する情報は経営へ共有されています。一方、システムの更新予定や今後必要となるIT投資については、担当者へ確認しないと把握しにくい状態であることが今回のヒアリングで整理されました。

### 3. 技術・運用・管理から見た課題・改善可能性

**技術**

> AI・自動化・効率化などの技術を使って、少人数での事業成長を支えられる可能性があります。ただし、どの業務へ適用する価値があるか、どの方法が合理的かは現時点では確認できていません。

**運用**

> 事業が拡大した場合、月次集計や社内確認の負担が増える可能性があります。実際の業務フローや作業量を確認することで、どこに改善価値があるかをより具体的に判断できそうです。

**管理**

> IT情報の一部は経営へ報告されています。一方、将来のシステム更新やIT投資を含め、事業計画に必要な情報が経営判断へ継続的に届く状態かについては、確認する価値があります。

### 4. まだ分からないこと

> 今回の60分では、事業の方向性、現在の情報共有、今後負担が増えそうな業務について整理しました。一方、実際の作業量、報告情報の作られ方、システム更新・契約・投資計画の実態までは確認していません。そのため、課題の原因が技術・運用・管理のどこにあるのか、またどの改善方法が合理的かはまだ判断できません。

### 5. 次に確認する価値があるFACTと、そのFACTを確認すると何が分かりそうか

**月次集計・社内確認の実態**

> 実際の業務フロー、担当者、作業時間、使用システムを確認することで、事業拡大時のボトルネックになる業務があるか、自動化・AI等の技術活用が合理的か、あるいは運用見直しが先かを判断する材料が得られそうです。

**経営へ届くIT情報の内容と作られ方**

> 報告内容、頻度、元データ、経営での利用場面を確認することで、経営判断に必要な情報そのものが不足しているのか、報告方法・管理方法・データ連携のどこに改善余地があるのかを判断する材料が得られそうです。

**システム更新・IT投資の管理実態**

> 主要システムの契約・更新時期・EoL・投資予定と事業計画との関係を確認することで、今後必要なIT投資を先回りして計画・判断できる状態かを確認する材料が得られそうです。

---

## 12. Assessment connection

無料診断で示したのは、Solution / Recommendation / Findingではない。

このケースでは、Paid Assessmentで以下をEvidenceベースで確認する価値がある可能性がある。

- 実業務フロー / 作業量
- 報告資料 / 管理資料
- 元データ / システム間の情報流れ
- 契約 / 更新 / EoL / 投資計画

Assessment:
Evidence
→ Verification
→ FACT / UNKNOWN
→ Gap / Finding
→ 原因 / 影響 / 選択肢
→ Human Decision Material

最終Decisionは人間が行う。

---

## 13. Validation Result

### PASS — Survey → Initial Analysis

アンケート回答だけで、Future / Current / 3レンズ / Hearing Coverage の大半を高品質に生成できる。

### PASS — Initial Analysis → Hearing

Hearingは固定質問集ではなく、初期分析から「不足している情報」と「解像度を上げたい視点」を提示できる。

### PASS — Hearing → Human Update

Hearing memo自体をRule入力にせず、人間がQ2〜Q7のCurrent valueを必要に応じて変更できる。
Original Surveyは保持される。

### PASS — Human Update → Re-analysis

更新後のStructured Stateに同じDeterministic Ruleを再適用することで、初期分析の価値を残したままヒアリング後の実態へ近づけられる。

### PASS — Re-analysis → Report

再生成文をHumanが必要に応じて具体化・編集することで、ゼロからレポートを書くことなく、ヒアリングを反映した顧客向けレポートを作れる。

### PASS — Free Diagnosis → Assessment

「次に確認するFACT」と「確認すると何が分かりそうか」を示すことで、無料診断単体の価値を保ちながら、Assessmentの必要性を自然に説明できる。

---

## 14. Design observations / remaining work

1. Survey Current value の更新は Human action のみとする。
2. Hearing memo / recording から自動的にCurrent valueを書き換えない。
3. Human Edited Narrative はStructured Stateを上書きしない。
4. Original Survey / Updated State / System Narrative / Human Narrative を分離して保持する。
5. 3レンズは顧客との会話を分断する章ではなく、分析とレポートのレンズとして扱う。
6. Next FACT Candidateは複数Lensに属してよい。
7. Healthy Case と Solution Hypothesis Caseでも同じContractが破綻しないか紙上検証する。
8. その後でDesign v2を固定し、HA6現行実装を取得して1対1 Fit/Gapへ進む。

## 15. Gate

この時点では実装しない。
HA7を作らない。
Production migration / deploy / traffic変更を行わない。

次の設計作業は Healthy Case / Solution Hypothesis Case のPaper Simulation とする。
