# IT経営KAIZEN 無料診断 Design v2 — Hearing to Narrative Traceability Decision

Status: DESIGN DECISION
Date: 2026-10-11

## 1. Decision

Post-Hearingで人が再分析結果と顧客向け文面を精査しやすくするため、Hearing ThemeからCustomer-facing Narrativeまでの参照関係をUI上で追跡可能にする。

ただし、Hearing memo本文そのものをAnalyzer inputへ渡さない既存境界は維持する。

## 2. Traceability chain

UI上で追える関係は以下。

Hearing Viewpoint
→ Related Survey / Current Questions
→ Related Analysis Items
→ Generated Narrative Section
→ Human Edited Narrative Section

これは provenance / review support であり、memo本文から診断結果を自動生成する因果関係ではない。

## 3. Live Hearing

各「今回確認したいこと」カードに以下を表示可能とする。

- Viewpoint title
- why useful
- lenses
- related Q chips
- viewpoint-specific memo
- example questions（collapsed）

related Qは既存のrule/provenanceから取得し、memo本文をAI推論して決めない。

## 4. Post-Hearing Step 1 — 回答を見直す

各Hearing memo cardから関連Qへ直接移動できる。

例:

- 関連する回答: Q2 / Q3 / Q7
- Q7を押す → Step 1へ切替 → Q7だけ展開

逆方向にも、各Qから「関連するヒアリング記録」を表示できる。

HumanがOriginal / Hearing Recordを見てCurrent answerを更新する。

SystemはmemoからCurrent answerを自動変更しない。

## 5. Post-Hearing Step 2 — 分析を確認する

各Analysis Itemに、関連するHearing Theme / Qをreview supportとして表示できる。

例:

- 関連確認テーマ: #2 自動化・AI活用の確認価値
- 関連回答: Q3 / Q7

これにより、なぜこの確認ポイント・UNKNOWN・FACT Candidateが表示されているかを人が辿れる。

## 6. Post-Hearing Step 3 — 顧客向け文面を整える

Generated Narrativeはsection単位で、関連するAnalysis Item / Hearing Theme / Qを表示できる。

例:

`確認ポイントと改善可能性`
- 関連確認テーマ: #1 / #2
- 関連回答: Q2 / Q3 / Q7
- 関連分析: finding-xxx / unknown-yyy

operator-facing UIではinternal IDを主表示せず、日本語label/chipを使う。

Human Edited Narrativeにも同じsection-level referenceを表示してよい。

ただしHumanが文面を編集した後、その文章の一文一文が自動的に特定Hearing Theme由来であると断定しない。

Traceabilityはsection-level review contextとして扱う。

## 7. Provenance principle

優先するSource:

- Hearing Viewpoint.sourceRuleIds
- Analysis Item.sourceRuleIds
- FACT Candidate.sourceRuleIds
- Deterministic Narrative generatorが保持できるanalysis item / section reference

memo本文のsemantic解析でrelationを作らない。

既存provenanceだけでrelated Q / analysis / narrative relationを復元できない場合はFit/GapでGAPとして報告し、勝手に推測ロジックを追加しない。

## 8. UX goal

operatorは次を双方向に辿れること。

- このヒアリングテーマは、どの回答を見直す話か
- この回答変更は、どのヒアリング記録と関係するか
- この分析結果は、どの確認テーマと関係するか
- この顧客向け文面は、どの分析・確認テーマを踏まえているか

これにより、再分析後の文面精査を「生成文面を読むだけ」から「根拠となる確認テーマ・回答・分析を見ながら整える作業」へ変える。

## 9. Boundary

このDecisionはUI review support / provenance visibilityの追加であり、以下は変更しない。

- Hearing memoはAnalyzer inputではない
- HumanがCurrent answerを更新する
- HumanがCustomer-facing Narrativeを編集する
- AI/SystemはFACTを自動確定しない
- Human Edited Narrativeをevidence-based FACTとして扱わない
- Assessment Scopeを自動確定しない
