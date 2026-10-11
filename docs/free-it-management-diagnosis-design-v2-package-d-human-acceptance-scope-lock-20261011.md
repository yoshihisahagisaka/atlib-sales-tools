# Free IT Management Diagnosis Design v2 — Package D Human Acceptance Scope Lock

Status: LOGIC/CONTENT ACCEPTED / UX ONLY HOLD
Date: 2026-10-11

## 1. Human Acceptance finding

Human Acceptanceで、診断判定・分析内容・生成文面については概ね問題なしとの判断を得た。

残課題は、人が実運用で使いやすいかというUI / 情報設計に限定する。

したがって今後のPackage D UX Fixでは、診断ロジック・分析ロジック・Narrative生成内容を変更対象にしない。

## 2. Accepted / locked areas

以下はHuman Acceptance上、現時点で受容可能として固定する。

- Design v2 deterministic diagnosis / analysis semantics
- Current Understandingからのre-analysis
- 技術 / 運用 / 管理のmulti-lens表現
- UNKNOWN / まだ確認できていないことの意味
- FACT Candidate / 次に確認する価値があることの意味
- Healthy Case guard
- AI / Automation等のInterestをsolution recommendationへ直結させないこと
- System Generated Narrativeの内容方向
- Human Edited / 顧客向け文面の役割
- Original / Hearing Record / Current Stateの責任分離

新しいactual defectやHuman Acceptance上の明確な内容問題が出ない限り、上記をUX改善のために変更しない。

## 3. Remaining hold scope

残るHuman Acceptance HOLDはUI / 情報設計のみ。

主な課題:

- Original Surveyが一覧としては見えるが、回答ごとの視認性が弱い
- Hearing Viewpointがoperatorにとって「今回確認したいこと」として認識しづらい
- Live Hearing右paneが長く、必要情報とmemoへアクセスしにくい
- Post-Hearing右paneへ編集・分析・Generated Narrative・顧客向け文面を縦積みしており長すぎる
- Q2〜Q7の全選択肢常時展開で視認性が悪い
- 3-columnの責任分離は正しいが、作業導線としての情報密度が高い

## 4. UX fix principle

修正は表示・ナビゲーション・折りたたみ・compact summary・pane sizing / scrollingへ限定する。

特に:

- Original Survey: compact card / chip化
- Hearing Viewpoint: 「今回確認したいこと」として明示
- example questions: default collapsed
- Post-Hearing right pane: 「回答を見直す / 分析を確認する / 顧客向け文面を整える」のstep切替
- Q2〜Q7: current selection summaryを先に見せ、変更時のみ選択肢展開
- paneごとのlocal scroll / viewport内でのアクセス性改善

## 5. Non-goals for UX fix

UX改善を理由に以下へ戻らない。

- Survey Contract変更
- Rule / Analyzer変更
- Narrative生成ルール変更
- Package B persistence変更
- Package C API semantics変更
- Hearing memo semantics変更
- Report / Package E設計変更
- Migration / DB変更

## 6. Gate

現在の判定:

- Diagnosis / Analysis: ACCEPTED
- Narrative content direction: ACCEPTED
- Package D source / regression: PASS
- Human Acceptance UI/UX: HOLD

UX fix後に再Human Acceptanceを実施し、使いやすさが受容できればPackage DをCLOSEする。
