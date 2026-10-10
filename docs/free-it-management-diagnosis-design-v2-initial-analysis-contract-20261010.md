# IT経営KAIZEN 無料診断 Design v2 — Initial Analysis Contract

Status: DESIGN CHECKPOINT / implementation not yet started
Date: 2026-10-10
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

事前アンケート回答だけで、顧客に価値のある初期分析文を確定論的に生成できる状態を作る。
60分ヒアリングは、初期分析をゼロから作り直す場ではなく、アンケートだけでは拾えないことを確認し、初期値の解像度を上げ、必要に応じて人間が現在値を更新する場とする。

## 2. Core principles

- Survey Answer は顧客の回答時点の認識であり FACT ではない。
- Original Survey は変更不可で保存する。
- Hearing Memo / Recording は Observation / reference material であり、診断ロジックへ直接入力しない。
- Hearing 後、人間が Survey の現在値を必要に応じて変更する。
- 再分析は Human Updated Structured State を入力として、Survey と同じ deterministic rule で実行する。
- System Generated Narrative は人間が編集可能。ただし編集で FACT に昇格しない。
- Human Decision を必須とする。AI/System は Suggestion / Possibility / UNKNOWN / Next FACT Candidate を提示する。
- 無料診断は Where should we look? を答える。有料 Assessment は Evidence を確認し、人間が判断できる材料を揃える。

## 3. Information flow

Original Survey (immutable)
→ Deterministic Initial Analysis
→ Initial Report Draft / Hearing Coverage
→ 60-minute Hearing (memo / optional recording, no direct rule effect)
→ Post-Hearing Analysis
→ Human updates current answer values where needed
→ Deterministic Re-analysis
→ System Generated Narrative
→ Human text edit where needed
→ Report Draft
→ Human Review / Approval
→ Customer Report

## 4. Survey semantic inputs

Question wording / order is still being finalized. Analysis semantics are defined independently of display order.

- Future: 今後1〜3年で実現したい会社の未来
- IT Expectation: その未来に対して IT に期待する役割
- Current Interest: 現在特に確認したいこと
- Visibility: 現在の業務・ITがどこまで見えているか
- Management Connection / Decision Usability: ITが管理され、経営へ報告され、経営判断に使える状態か
- Interest Theme: AI、自動化、セキュリティ、リテラシー教育等の関心テーマ
- Context: company size / sites etc. 必要に応じて補助利用

## 5. Deterministic analysis outputs

### 5.1 Future Understanding

Survey の Future と IT Expectation から直接生成する。
Survey に明示されている内容は Hearing で同じ質問を繰り返さない。
Hearing では具体像を確認する。

Example:
- Future = 事業を広げる + 少人数で成長・運営する
- IT Expectation = 生産性を高めたい + 経営判断を支えたい

Initial narrative:
「事業を拡大しながら、少人数でも無理なく成長・運営できる会社を目指している。その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待している。」

### 5.2 Current Understanding

Visibility と Management Connection / Decision Usability を中心に生成する。
ここでは「良い / 悪い」の採点をしない。

Example:
- Visibility = 分かることと分からないことがある
- Management Connection = 報告はあるが数字の羅列や専門用語が多く経営判断に使いにくい

Initial narrative:
「業務・ITについて一定の把握や報告はある一方、経営として十分に見えていない部分があり、現在の情報がそのまま経営判断に使える状態かには確認余地がある。」

## 6. Three lenses: 技術 / 運用 / 管理

3領域は固定分類ではなく、Futureに対して改善可能性・確認価値を見るための lens とする。
1つの課題に複数 lens が同時に関係してよい。

### 技術

役割:
- 自動化、効率化、AI、連携、データ活用等によって Future を支えられる可能性を見る。
- 技術的問題があると断定しない。

Example rule:
Future = 事業拡大 / 少人数運営
AND IT Expectation = 生産性向上
AND Interest Theme = AI or 自動化
→ 「自動化・効率化・AI活用など、技術を使って事業成長を支えられる可能性がある。ただし、どの業務へ適用する価値があるかは未確認。」

### 運用

役割:
- 今の仕事の進め方が Future の変化に耐えられるかを見る。
- 手作業、転記、集計、確認待ち、情報探索、属人化等は Hearing で具体化する。

Example rule:
Future = 事業拡大 or 少人数運営
→ 「現在の業務運用が、事業規模が大きくなっても無理なく回るかを確認する価値がある。」

### 管理

役割:
- ITが管理されているか
- 経営へ情報が届いているか
- その情報が経営判断に使えるか
- 会社の未来 / 事業計画と IT が接続しているか

Example rule:
Current Interest = 経営判断
AND Management Connection = 報告はあるが判断しにくい
→ 「IT・業務情報が経営判断に使える形で管理・報告されているかについて確認価値が高い。」

## 7. UNKNOWN handling

UNKNOWN は固定しない。
Survey 時点で不明なことが Hearing で明らかになることがある。
逆に Survey で分かっていると思われたことが Hearing で不明確になることもある。

Post-Hearing では Human Updated Structured State により current UNKNOWN を更新する。
Original Survey は保持する。

## 8. Hearing role

Hearing は固定質問集を消化する場ではない。
質問やテーマを章ごとに分ける必要もない。
1つの会話で複数の視点を確認してよい。

Hearing Workspace:
- 左: Original Survey (read only)
- 中央: 今回確認したい視点 / optional example questions / memo / recording

主な目的:
1. Survey だけでは分からないことを確認する
2. Survey で分かっていることを具体化する
3. Survey 認識の差異を発見する
4. レポートに必要な解像度を上げる

Hearing result itself does not directly mutate diagnosis.

## 9. Post-Hearing Analysis

3-column UI:
- Left: Original Survey (immutable)
- Center: Hearing memo / recording / observations
- Right: Current Structured State / generated narrative

Human action:
1. Survey current values をそのまま維持するか、選択肢を変更する
2. deterministic re-analysis を実行
3. Future / Current / 技術 / 運用 / 管理 / UNKNOWN / Next FACT Candidate を再生成
4. 必要なら文章自体を編集

System-generated text と Human-edited text は分離して保持する。
Human-edited narrative も FACT ではない。

## 10. Report Contract

Customer report should contain:

1. 実現したい会社の未来
2. 現在どこまで分かっているか
3. 技術・運用・管理から見た課題・改善可能性
4. まだ分からないこと
5. 次に確認する価値があるFACT + そのFACTを確認すると何が分かりそうか

Report is generated from the Human Updated Current State, not directly from Original Survey.

## 11. Next FACT Candidate contract

無料診断は FACT を確認しない。
無料診断では、次に確認すべき FACT Candidate と、その確認価値を示す。

Each candidate should contain:
- What to verify
- Why it matters to the customer's Future
- What may become knowable after verification
- Related lens: 技術 / 運用 / 管理 (multi-select allowed)

Example:
「経営へ報告されているIT・業務情報の内容と作られ方を確認することで、情報そのものが不足しているのか、報告方法に問題があるのか、管理方法に改善余地があるのかを判断する材料が得られそう。」

## 12. Assessment boundary

Free Diagnosis:
Future
→ Current Understanding
→ Possibility / UNKNOWN
→ Where to look
→ FACT Candidate + expected decision value

Paid Assessment:
Evidence
→ Verification
→ FACT / UNKNOWN
→ Gap / Finding
→ causes / impact / options
→ materials for Human Decision

System/AI does not make the final Decision.

## 13. HA6-style sample

Input example:
- Future: 事業を広げる / 少人数で成長・運営する
- IT Expectation: 生産性を高めたい / 経営判断を支えたい
- Current Interest: 経営判断
- Visibility: 分かることと分からないことがある
- Management Connection: 報告はあるが判断に使いにくい
- Interest Theme: AI

Initial analysis example:

Future:
「事業を拡大しながら、少人数でも無理なく成長・運営できる会社を目指している。ITには業務生産性向上と経営判断支援を期待している。」

技術:
「自動化・効率化・AI活用など、技術を使って少人数での事業成長を支えられる可能性がある。ただし、どの業務へ適用する価値があるかはまだ分からない。」

運用:
「現在の仕事の進め方が、事業規模が大きくなっても無理なく回るかを確認する価値がある。」

管理:
「一定の情報は経営へ届いている一方、その情報が経営判断に使える形で整理されているかを確認する価値がある。」

Hearing coverage example:
- どのような事業拡大を考えているか
- 少人数で運営できる状態とは具体的に何か
- 今の仕事の進め方で負担が増えそうな部分は何か
- 経営に何が届き、何が判断に使え、何が使いにくいか
- AI / 自動化を使いたい具体的な業務はあるか

The Hearing coverage is guidance, not a fixed question sequence.

## 14. Explicit non-goals at this checkpoint

- Q1〜Q7の最終質問文・選択肢確定
- HA6 source Fit/Gap
- DB schema change
- migration
- implementation
- build/deploy/traffic change
- AI auto-interpretation of hearing recording

These follow only after Design v2 is fixed.
