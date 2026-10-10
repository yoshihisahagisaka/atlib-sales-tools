# IT経営KAIZEN 無料診断 Design v2 Checkpoint

Status: **DESIGN CHECKPOINT / IMPLEMENTATION NOT STARTED**  
Date: 2026-10-10

本書は、HA6 Human Acceptance後に行った無料IT経営診断の根本再設計について、現時点で合意したProduct Designを記録する。HA6実装のFit/Gap、コード変更、migration、build、deploy、traffic変更は本書の対象外であり、まだ実施しない。

---

## 1. Product Purpose

無料診断は、ITの良し悪しや成熟度を採点するものではない。経営者が実現したい会社の未来を起点に、現在どこまで分かっているかを整理し、経営判断のために次に何を詳しく確認する価値があるのかを明らかにする60分のIT経営診断とする。

上位メッセージは以下。

- 会社の未来からITを考える。
- 未来が違えば、必要なITも違う。
- ITに多く投資すること自体がIT経営ではない。
- 何に投資し、何には投資しないかも経営判断である。
- 無料診断は「どこを見る価値があるか」を明らかにする。
- 有料Assessmentは、その論点についてFACTを確認し、人間が判断できる材料を揃える。

役割分担：

- Free Diagnosis: **Where should we look?**
- Assessment: **What is actually true?**
- Human Decision: **What should we do?**

FACTACT原則：**AI Suggests. Human Decides. Authority Governs.**

---

## 2. Free DiagnosisとAssessmentの境界

無料診断では、課題・原因・解決策をFACTとして確定しない。

無料診断が示すもの：

- Future
- Current Understanding
- 課題可能性
- 改善可能性
- UNKNOWN
- 次に確認する価値があるFACT候補
- そのFACTを確認すると何が分かりそうか

Assessmentで行うこと：

- Evidence収集
- FACT / UNKNOWN確認
- Gap / Finding整理
- 原因・影響・選択肢の整理
- 技術・運用・管理のどの方法で解くか、または何もしないかを人間が判断するための材料提示

無料診断から「AI導入が必要」「システム連携が必要」等を自動断定しない。

---

## 3. 設計順序

Design v2はアンケート起点ではなく、成果物から逆算する。

1. 顧客に返すReport Contract
2. Report作成に必要なCurrent Understanding
3. アンケートから直接取得・確定論的に導ける内容
4. アンケートだけでは導けず60分で確認・具体化する内容
5. Survey Question Set
6. Initial deterministic analysis
7. Hearing coverage
8. Post-Hearing Human Analysis
9. Report Draft / Human Review
10. Assessment FACT candidates

アンケートで既に確定論的に導ける内容は、60分で聞き直さない。

---

## 4. Report Contract v2（現時点の正式骨格）

顧客向けレポートは5章を基本とする。

### 4.1 実現したい会社の未来

SurveyのFutureとITへの期待を基に生成し、Hearingで具体化された内容を人間がCurrent Understandingへ反映する。

### 4.2 現在どこまで分かっているか

事前アンケートとHearingを通して整理した、60分終了時点のCurrent Understandingを示す。

### 4.3 技術・運用・管理から見た課題・改善可能性

3×6メソッドの3領域は以下。

- **技術**
- **運用**
- **管理**

ただし、3領域を独立した質問章として扱わない。また、一つの課題をどれか一領域へ排他的に分類しない。

同じ課題でも、技術で解ける可能性、運用で解ける可能性、管理で解ける可能性がある。3領域は「解決策」そのものではなく、課題・改善可能性を見る複数のレンズとして使う。

Q2 Futureによって各領域の意味は変わる。例：

- 事業拡大 → 拡大を支えられる技術・運用・管理か
- 少人数運営 → 自動化/AI等の技術可能性、業務運用負荷、管理・可視化
- 安心して事業継続 → EoL/セキュリティ等の技術、継続運用、更新・リスク管理

### 4.4 まだ分からないこと

Survey/Hearing後も未確認の事項を明示する。UNKNOWNは問題ではなく、次の経営判断に必要な確認事項として扱う。

### 4.5 次に確認する価値があるFACTと、それを確認すると何が分かるか

単なるToDoではなく、必ず以下を対で示す。

- 次に何をFACTとして確認する価値があるか
- それを確認すると、どの判断材料が得られそうか

これを無料診断単体の価値とAssessmentへの自然な接続にする。

---

## 5. Surveyの役割

SurveyはFACTではない。**顧客の回答時点の認識（Initial Recognition / Initial State）**として固定保存する。

原則：

- Survey raw answerは変更しない。
- Survey Answer ≠ FACT。
- Surveyから確定論的に導ける内容はInitial Understanding / Initial Report Draftへ利用してよい。
- ただしSurvey回答を絶対視しない。
- Hearingで「実は違った」「より具体的に分かった」「未確認が解消した」ことをHuman Analysisで反映できる設計にする。

現時点で整理している質問の役割：

- Future
- ITへの期待
- Current Interest
- Visibility
- Management Connection / Decision Usability
- Interest Theme（AI、自動化、セキュリティ、リテラシー教育等）
- Company Context

質問順は旧番号を絶対視せず、人間が回答しやすい流れに再配置する。

想定UX順：

Future → ITへの期待 → 現在の関心 → 現在どこまで見えているか → IT管理/報告/経営判断との接続 → 関心ITテーマ → 会社属性

新Q1〜Q7の正式文言・選択肢は次Phaseで確定する。

---

## 6. Q5 / Q6 / Q7の現在の方向性

### Visibility（現Q5相当）

経営者が業務・ITの現在地をどこまで把握できているかを見る。

### Management Connection / Decision Usability（現Q6相当）

特に知りたい状態は次のような段階。

- ほとんど管理されていない
- 管理はされているが、経営への報告がない
- 報告はあるが、数字の羅列や専門用語中心で経営判断に使いにくい
- 経営判断に使える形で整理されている
- 事業計画・経営課題と結び付いた報告・提案まで行われている

Q6の目的は「IT部門を採点する」ことではなく、ITが管理され、その情報が経営に届き、経営判断に利用できる状態かを把握すること。

### Interest Theme（現Q7相当）

旧自由記述ではなく、IT関連テーマの複数選択を有力案とする。

候補例：

- AI・生成AI
- 業務自動化・効率化
- データ活用・見える化
- セキュリティ
- ITリテラシー・教育
- システム老朽化・更新
- クラウド
- ITコスト・予算
- IT運用・情シス体制
- システム連携
- 新しい働き方・業務環境
- 特に決まっていない

Interest ThemeはProblem / Finding / Recommendationを確定しない。Customer Interestとして他回答と掛け合わせ、Hearingで確認する視点を作る。

---

## 7. Deterministic Initial Analysis

特に強い組み合わせとして、以下を中核候補とする。

**Future × Visibility × Management Connection × Interest Theme**

ITへの期待、Current Interest、Company Contextも補助入力として利用する。

例：

- Future: 事業を広げる / 少人数で成長・運営する
- IT期待: 生産性向上 / 経営判断支援
- Visibility: 分かることと分からないことがある
- Management Connection: 報告はあるが判断に使いにくい
- Interest Theme: AI

この場合、Surveyだけでも以下の初期理解を導ける。

- Future: 事業拡大と少人数運営
- 技術: 自動化・効率化・AI活用によって成長を支えられる可能性。ただし適用先は未確認
- 運用: 現在の仕事の進め方が事業拡大に耐えられるか確認価値あり
- 管理: IT/業務情報が経営判断に使える形で整理・報告されているか確認価値が高い

これはあくまでInitial Understanding / Possibilityであり、FACT断定ではない。

---

## 8. Hearingの役割

Survey回答だけで初期レポートDraftに近い状態まで進めることを前提とする。

60分の役割は主に二つ。

1. Surveyだけでは拾いきれないことを確認する
2. Surveyから分かっていることの解像度を上げる

例：

- 「事業を広げる」→ 具体的にどのような事業拡大か
- 「少人数で運営」→ どのような状態を意味するか
- 「生産性を高めたい」→ どの業務か
- 「分かることと分からないことがある」→ Known / Unknownの具体化
- 「報告はあるが判断しにくい」→ 何が届き、何が使えず、何が足りないか
- 「AIに関心」→ どの仕事で何を期待しているか

### 8.1 質問集方式は採用しない

固定質問を順番に消化する方式は、営業の自由を奪い、重複質問を生みやすい。

また「テーマ別質問章」も原則採用しない。一つの会話から複数の論点・領域が分かるため。

Hearingでは、**今回の60分で確認したい視点（coverage）**を視認性高く提示する。

例：

- 事業をどう広げようとしているか
- 少人数で回すとはどんな状態か
- 今の仕事の進め方で成長を支えられそうか
- 負担が増えそうな仕事はどこか
- 経営にどのような情報が届いているか
- 何が判断に使え、何が使いにくいか
- AI・自動化を使いたい業務はあるか
- 技術・運用・管理のどこに改善可能性がありそうか
- まだ確認できていないことは何か

質問例は必要な営業担当者向けの補助表示に留める。

品質は「質問を全部聞いたか」ではなく、Report作成に必要な視点が会話で十分にカバーされたかで見る。

---

## 9. Hearing Recordは診断へ直接反映しない

Hearing中の営業担当者は会話に集中する。

記録手段：

- メモ
- 顧客発言・具体例
- 必要に応じて録音

**Hearing memo / recording / transcriptを直接Rule Inputにしない。**

将来AIを利用する場合も、AIは「Current Understanding更新候補」をSuggestできるだけとし、自動反映しない。

---

## 10. Workspace / Analysis UI

### 10.1 Hearing Workspace

**2列構成**を正式方針とする。

- 左：事前アンケート回答（read-only / immutable）
- 中央：確認したい視点 + Hearing記録

Hearing中にCurrent Understandingを確定させる右ペインは表示しない。営業担当者が会話より分析操作に意識を奪われるのを防ぐ。

### 10.2 Post-Hearing Analysis

**3列構成**を正式方針とする。

- 左：事前アンケート回答（Initial Recognition / 変更不可）
- 中央：Hearing記録（Observation / 参考材料）
- 右：Current Understanding（Human-updated）

右側は人間が更新する。Hearing記録から自動上書きしない。

Human Analysisでは少なくとも以下を吸収できるようにする。

- 初期理解のままでよい
- より具体化できた
- Survey時点の認識と異なった
- Survey時点のUNKNOWNが解消した
- 新しいUNKNOWNが判明した

原則：**入力は保持、Current Understandingは更新可能、FACT確定はAssessment。**

---

## 11. Report Source

顧客向けReport DraftはSurvey raw answerやHearing memoから直接生成しない。

参照順：

Survey Initial State
→ Hearing Record
→ **Human AnalysisによるCurrent Understanding**
→ Report Draft
→ Human Review
→ Approved Report

アンケート回答とHearing後の理解に差がある場合、必要であればその認識差自体を価値ある診断情報としてReportに反映できる。

---

## 12. Human Decision

システムが行うこと：

- SurveyからInitial Understandingを確定論的に導く
- 可能性・候補・UNKNOWNを整理する
- Hearing coverageを提示する
- 次に確認するFACT候補を提示する
- 必要に応じてHumanへの更新候補をSuggestする

人間が行うこと：

- Hearingで何を深掘りするか
- Survey認識をどのようにCurrent Understandingへ更新するか
- どの課題可能性・改善可能性を顧客へ返すか
- 次に確認すべきFACT候補を採用するか
- Report Draftの修正・承認
- Assessment後にどの手段を選ぶか

---

## 13. 現時点のRelease / Implementation Gate

- HA6 Human AcceptanceでProduct Design Gapが確認されたため、HA6をProductionへpromoteしない。
- HA7はまだ作らない。
- Design v2確定前に実装しない。
- migration / DB変更を行わない。
- deploy / traffic変更を行わない。

次工程：

1. 本Design v2をさらに仕様化
2. Report ContractとCurrent Understanding項目を1対1対応
3. 新Q1〜Q7の正式質問文・選択肢確定
4. Deterministic Rule / Hearing Coverage Contract確定
5. Post-Hearing Analysis Contract確定
6. Design v2を固定
7. その後にHA6現行ソースをread-only回収
8. Design v2対HA6の1対1 Fit/Gap
9. 変更対象ファイルを特定
10. 実装・build・regressionへ進む

Work等の実行担当へProduct Designを委ねない。現状調査・指定された実装・build・regressionを中心に使い、Product Design / Rule / UI Contract / 実装設計は本レーンで確定する。
