# IT経営KAIZEN 無料診断 Design v2 — Survey Question Contract

Status: DESIGN v2 WORKING CANONICAL CANDIDATE
Date: 2026-10-10

## 1. Purpose

本書は、無料IT経営診断 Design v2 の事前アンケート Q1〜Q7 を、Report Contract / Initial Analysis / Hearing / Post-Hearing Analysis と1対1で接続できる形に固定するための質問契約である。

前提：

- 事前アンケートは「診断結果」ではなく、顧客の回答時点の認識を記録する。
- Survey Answer は FACT ではない。
- アンケート回答は Original Survey として変更不可で保存する。
- 60分ヒアリング後、人間が同じ選択肢体系を使って Current Structured State を必要に応じて更新できる。
- Hearing memo / recording は直接Rule入力にしない。
- Human Updated State でRuleを再実行し、Current Understanding / 3レンズ / UNKNOWN / FACT Candidate / Narrativeを再生成する。
- 生成された文章はHuman Edited Narrativeとして必要に応じて編集できる。
- 選択肢の順序は成熟度スコアではない。点数化・良否判定・Risk/Maturity Scoreを行わない。

## 2. Question order

質問順は、人間が自然に考えやすい順と、既に設計上使っている意味コードを両立させる。

- Q1: Company Context
- Q2: Future
- Q3: IT Expectation
- Q4: Current Interest
- Q5: Visibility
- Q6: Management Connection / Decision Usability
- Q7: Interest Theme

Q2 / Q5 / Q6 / Q7 はDesign v2の主要な掛け合わせ軸である。

---

## Q1 会社の状況

### Question

**会社の状況について教えてください。**

### Q1-A 従業員数

- 1〜10人
- 11〜30人
- 31〜50人
- 51〜100人
- 101〜300人
- 301人以上

### Q1-B 主な拠点数

- 1か所
- 2〜3か所
- 4〜10か所
- 11か所以上

### Meaning

- Context only.
- 単独で Problem / Finding / Gap / Assessment Scope を発生させない。
- Future / Current / 3レンズの意味を解釈する補助情報としてのみ使用する。

---

## Q2 今後1〜3年で実現したい会社の未来

### Question

**今後1〜3年で、どのような会社の未来を実現したいですか？**

### Answer type

MULTI_SELECT

### Options

- 売上・事業を成長させたい
- 社員が本来の仕事に集中できる会社にしたい
- 少人数でも無理なく成長・運営できる会社にしたい
- 新しい事業・サービスや働き方に挑戦したい
- 安心して事業を続けられる会社にしたい
- 特に大きな変化は予定していない
- まだ具体的には決まっていない

### Stable semantic codes

- BUSINESS_GROWTH
- FOCUS_ON_CORE_WORK
- LEAN_GROWTH
- NEW_BUSINESS_OR_WORKSTYLE
- BUSINESS_CONTINUITY
- NO_MAJOR_CHANGE
- UNDECIDED

### Meaning

- Future Context を作る。
- Q2単独で課題を断定しない。
- 技術・運用・管理の「何が良い状態か」はFutureによって変わるため、3レンズの基準を変える上位Contextとして使用する。

### Guard

- NO_MAJOR_CHANGE / UNDECIDED は、原則として他のFuture選択肢と同時選択しない。
- Futureだけを根拠に Problem / Finding / Recommendation / Assessment Scope を生成しない。

---

## Q3 ITに期待していること

### Question

**その未来に向けて、ITに特に期待していることを選んでください。**

### Answer type

MULTI_SELECT / 原則最大2つ

### Options

- 生産性を高めたい
- 人を大きく増やさずに回せるようにしたい
- 経営判断を支えたい
- 情報をもっと活用できるようにしたい
- 事業や組織の変化に対応しやすくしたい
- 社員が働きやすい環境にしたい
- 安心して事業を続けられるようにしたい
- IT運用の負担を減らしたい
- まだ具体的には決まっていない

### Stable semantic codes

- PRODUCTIVITY
- LEAN_OPERATION
- MANAGEMENT_DECISION_SUPPORT
- DATA_USE
- CHANGE_READINESS
- EMPLOYEE_EXPERIENCE
- RESILIENCE
- IT_OPERATION_EFFICIENCY
- UNDECIDED

### Meaning

- Desired IT Role / Management Intent を表す。
- Q2 Future に対してITへ何を期待しているかを表し、改善可能性の方向を作る。
- Q3単独で解決策を決めない。

---

## Q4 現在、特に確認しておきたいこと

### Question

**現在、特に確認しておきたいことに近いものを1つ選んでください。**

### Answer type

SINGLE_SELECT

### Options

- 経営判断に関すること
- 日々の業務の効率や生産性に関すること
- 情報共有やデータ活用に関すること
- 事業拡大や組織変化への対応に関すること
- ITの運用や管理体制に関すること
- セキュリティや事業継続に関すること
- 特に決まっていない

### Stable semantic codes

- MANAGEMENT_DECISION
- PRODUCTIVITY
- INFORMATION_AND_DATA
- GROWTH_AND_CHANGE
- IT_OPERATION_AND_GOVERNANCE
- SECURITY_AND_CONTINUITY
- UNDECIDED

### Meaning

- Current Interest / Conversation Entry Point。
- Q2/Q3より上位の診断軸ではなく、60分でどこから会話を始めると自然かを示す。
- Q4単独で課題・優先順位を確定しない。

---

## Q5 現在どこまで見えているか

### Question

**現在の業務やITの状況について、どの程度把握できていますか？**

### Answer type

SINGLE_SELECT

### Options

- 全体として把握できている
- おおむね把握できている
- 分かることと分からないことがある
- 担当者に確認しないと分からないことが多い
- ほとんど把握できていない
- よく分からない

### Stable semantic codes

- VISIBLE_FULL
- VISIBLE_MOSTLY
- VISIBLE_PARTIAL
- RELIES_ON_OTHERS
- LOW_VISIBILITY
- UNKNOWN

### Meaning

- Visibility / Current Recognition。
- 「どこまで見えているか」を表すが、企業実態のFACTではない。
- Q5の認識はHearingで具体化・修正される前提。

### Example

VISIBLE_PARTIAL は「一部は見えている」という顧客認識を示すだけで、何がKnown / Unknownかは60分で確認する。

---

## Q6 ITの管理・報告・経営判断への接続状態

### Question

**ITの管理状況や経営への報告について、現在の状態に最も近いものを選んでください。**

### Answer type

SINGLE_SELECT

### Options

- ほとんど管理されておらず、経営として状況を把握できていない
- 管理はされているが、経営への定期的な報告・共有はほとんどない
- 報告・共有はあるが、数字の羅列や専門用語が多く、経営判断には使いにくい
- 経営判断に必要な情報として整理され、ある程度活用できている
- 経営課題や事業計画と結びつけて報告・提案され、経営判断に活用できている
- よく分からない

### Stable semantic codes

- UNMANAGED_OR_NOT_VISIBLE
- MANAGED_NOT_REPORTED
- REPORTED_NOT_DECISION_USABLE
- DECISION_USABLE
- STRATEGICALLY_CONNECTED
- UNKNOWN

### Meaning

Q6は単なる報告有無ではなく、以下の流れのどこに現在認識があるかを表す。

Management
→ Reporting / Sharing
→ Decision Usability
→ Strategic Connection

ただし、これは成熟度スコアではない。

### Important rule

- Q6単独で「悪い」「良い」を判定しない。
- 同じQ6回答でもQ2 Futureによって意味が変わる。
- 例：現状維持を望む会社と、急速な事業拡大を望む会社では、同じ「報告はあるが判断に使いにくい」の確認価値が異なる。

---

## Q7 現在関心のあるITテーマ

### Question

**現在、関心のあるITテーマを選んでください。**

### Answer type

MULTI_SELECT / 原則最大3つ

### Options

- AI・生成AI
- 業務の自動化・効率化
- データ活用・見える化
- セキュリティ
- 社員のITリテラシー・教育
- システムの老朽化・更新
- クラウド活用
- ITコスト・予算
- IT運用・情シス体制
- システム間の連携
- 新しい働き方・業務環境
- 特に決まっていない

### Stable semantic codes

- AI
- AUTOMATION
- DATA_VISIBILITY
- SECURITY
- IT_LITERACY
- SYSTEM_LIFECYCLE
- CLOUD
- IT_COST
- IT_ORGANIZATION
- SYSTEM_INTEGRATION
- WORKSTYLE
- UNDECIDED

### Meaning

- Customer Interest Theme。
- Q7はSolution Recommendationではない。
- AIを選んでもAI導入を推奨しない。
- Q2/Q3と組み合わせて「どの方向に改善可能性があり得るか」「60分で何を具体化すると価値があるか」を決める。

### Guard

- UNDECIDED は他のInterest Themeと同時選択しない。
- Q7単独で Problem / Finding / Recommendation / Scope を生成しない。

---

## 3. Deterministic analysis role

主要な初期分析は、以下の掛け合わせを中心に行う。

### Future × Current

Q2 Future
× Q5 Visibility
× Q6 Management Connection / Decision Usability

→ 「そのFutureに対して、現在どこまで見え、経営判断につながっているか」を整理する。

### Future × IT Expectation × Interest Theme

Q2 Future
× Q3 IT Expectation
× Q7 Interest Theme

→ 技術・運用・管理の3レンズで改善可能性を考える方向を作る。

例：

LEAN_GROWTH × PRODUCTIVITY × AI
→ 自動化・効率化・AI活用など、技術を使って少人数での事業成長を支えられる可能性がある。ただし、どの業務へ適用する価値があるかは未確認。

### Current Interest × Visibility × Management Connection

Q4 Current Interest
× Q5 Visibility
× Q6 Management Connection

→ 60分でどこを具体化するとレポート価値が上がるかを決める。

例：

MANAGEMENT_DECISION × VISIBLE_PARTIAL × REPORTED_NOT_DECISION_USABLE
→ 一定の情報は得られている一方、何が経営判断に使え、何が使いにくいのかを具体化する価値がある。

---

## 4. Post-Hearing update contract

Post-Hearing Analysisでは、Original Surveyを上書きしない。

画面上は少なくとも以下を区別する。

- Original Survey Answer: 変更不可
- Hearing Memo / Recording: 参考材料、Rule直接入力なし
- Human Updated Structured State: 人間がQ2〜Q7の現在値を必要に応じて更新
- System Generated Narrative: Updated Stateから再生成
- Human Edited Narrative: 必要に応じて人間が文章を編集

Human Updated Structured State は、原則として本書の同じStable Semantic Code体系を使う。

これにより、アンケート回答から初期分析を作り、60分後は変更が必要な選択肢だけ更新して同じRuleを再実行できる。

---

## 5. Report linkage

この質問契約は、最終レポートの5章へ接続する。

1. 実現したい会社の未来
2. 現在どこまで分かっているか
3. 技術・運用・管理から見た課題・改善可能性
4. まだ分からないこと
5. 次に確認する価値があるFACTと、それを確認すると何が分かりそうか

Q1〜Q7だけでレポートを完成させることが目的ではない。

目的は、アンケート回答だけで高品質なInitial Report Draftを作れるところまで進め、60分ではアンケートで拾いきれない部分の確認と解像度向上に集中することである。

---

## 6. Non-goals / guards

- Survey AnswerをFACTに昇格しない。
- Q2 Futureだけで問題を作らない。
- Q7 Interestだけでツールや製品を推奨しない。
- 技術・運用・管理を相互排他的な分類にしない。
- 1つの課題・改善可能性に対し、技術・運用・管理の複数レンズが同時に成立してよい。
- 無料診断で解決策を確定しない。
- 無料診断は次に確認するFACTと、そのFACTを確認すると何が分かりそうかまでを示す。
- 有料AssessmentでEvidenceを確認し、FACT / UNKNOWN / Gap / Finding / 原因・影響・選択肢を整理して、人間のDecision材料を作る。
