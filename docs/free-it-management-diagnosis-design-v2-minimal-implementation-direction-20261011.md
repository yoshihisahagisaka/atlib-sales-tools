# IT経営KAIZEN 無料診断 Design v2 — Minimal Implementation Direction

Status: DESIGN v2 IMPLEMENTATION DIRECTION / NO IMPLEMENTATION YET
Date: 2026-10-11

## 1. Decision summary

HA6 Fit/Gapの結論は、基盤を捨てて作り直すのではなく、**既存のCase / Survey入力 / Hearing記録 / Human Review / Report / Audit基盤を残し、診断の意味づけとHearing→再分析の中核だけをDesign v2へ置き換える**ことである。

Design v2の中核フローは以下をCanonical候補とする。

Original Survey Snapshot（immutable）
→ Semantic Projection
→ Initial Current Structured State
→ Deterministic Initial Analysis / Narrative
→ Hearing（memo。Ruleへ直接入力しない）
→ Post-Hearing Human Update of Current Structured State
→ Deterministic Re-analysis
→ System Generated Narrative
→ Human Edited Narrative
→ Report Draft
→ Human Review / Approval
→ Customer Report

Free DiagnosisはFACTを認定せず、Where should we look? / Next FACT Candidateまでを扱う。AssessmentでEvidenceを確認し、人間の判断材料を作る。

**Recording機能はDesign v2の対象外とする。** Hearingはmemoで成立させ、音声録音・音声ファイル保存・文字起こし・録音参照は実装しない。

## 2. HA6 Fit/Gap review

### KEEP

以下はDesign v2でも原則再利用する。

- Customer / Contact / Sales Activity / Case
- Public Customer Self / Staff Proxyの二経路
- versioned structured answer envelope / provenance
- deterministic rule execution history
- append-only Hearing Statement / memo系基盤
- UNKNOWNを問題扱いしないGuard
- Healthy Case / Solution Hypothesis Guard
- Human Review / Approval / Delivery / Feedback / Audit
- Approved Reportのimmutable snapshot / hash
- same-case integrity / typed source reference

### ADAPT

以下は骨格を残しつつ意味をDesign v2へ変更する。

- Q1〜Q7 Question Contract / semantic codes
- Semantic Projection
- Initial Rule
- Admin Hearing UI
- Report 5章
- Next Confirmation / Evidence Candidate
- Human Review UI
- Assessment接続

### REPLACE

以下はDesign v2と構造的に合わないため、中核フローから外す。

- M01〜M06を主単位にした固定Hearing catalog
- Primary / Secondary Focus中心のHearing開始構造
- 固定questionSequenceを消化するHearing
- Hearing Structured AnswerをそのままFinal Ruleへ入力する経路
- mutable upsertのIntake rowをOriginal Surveyの正本として扱う考え方

既存table/fieldを即削除することを意味しない。後方互換のため残してもよいが、Design v2のRule Source of Truthにはしない。

### ADD

- immutable Original Survey Snapshot
- Human Updated Current Structured State
- Original / Hearing / Currentの3層分離
- Updated Stateを入力にするdeterministic re-analysis
- System Generated Narrative / Human Edited Narrativeの分離
- 技術 / 運用 / 管理をmulti-lensとして持つanalysis model
- FACT Candidateごとの What / Why / What becomes knowable / lens

### EXPLICITLY NOT ADD

- Hearing recording
- 音声ファイル保存
- 自動文字起こし
- RecordingからのAI自動分析

## 3. Important correction to the Fit/Gap wording

Hearing UIのDesign v2は「3領域レイアウト」ではない。

- Live Hearing: **2 columns**
  - Left: Original Survey
  - Center: 確認したい視点 + Hearing memo
- Post-Hearing Analysis: **3 columns**
  - Left: Original Survey
  - Center: Hearing Record
  - Right: Current Structured State + Generated Narrative

「技術 / 運用 / 管理」はUIの3列ではなく、分析時に複数同時適用できるlensである。

## 4. Minimal data-model direction

### 4.1 Existing intake as draft, immutable snapshot at completion

HA6の`hearing_intake_response_v2` upsert自体は、回答途中のdraft入力としては再利用可能。

ただしDesign v2では、Survey Complete時に別のimmutable snapshotを作り、それをOriginal Surveyの正本とする。

これにより既存入力フローを大きく壊さず、Original Survey immutable要件を満たす。

既存migration 027〜032は編集・再実行しない。必要なschema追加は、実装時にmain / Production Canonicalを再確認したうえで**次の未使用migration番号**を使う。

### 4.2 Current Structured State

Original Surveyとは別に、Hearing後にHumanが更新できるCurrent Structured Stateを持つ。

- 初期値はOriginal Survey / Semantic Projectionから生成
- Q2〜Q7相当の現在値をHumanが変更可能
- Hearing memoからSystemが自動変更しない
- Human Update後に同じdeterministic analysis ruleを再実行
- Original Surveyは常に保持

Current Stateは履歴を追えるversioned / append-oriented構造を優先する。

### 4.3 Narrative separation

少なくとも論理的に以下を分離する。

- System Generated Narrative
- Human Edited Narrative

Structured Stateを変更して再生成した際、既存Human Edited Narrativeを無条件上書きしない。再確認対象として扱う。

## 5. Deterministic analysis direction

主要Ruleは以下の組合せを中心に再構築する。

- Q2 Future × Q5 Visibility × Q6 Management Connection
  - Futureに対して現在どこまで見え、経営判断につながっているか
- Q2 Future × Q3 IT Expectation × Q7 Interest Theme
  - 技術 / 運用 / 管理から見た改善可能性
- Q4 Current Interest × Q5 Visibility × Q6 Management Connection
  - Hearingで解像度を上げる価値が高い視点

Q7 Interest ThemeはRecommendationではない。AI選択からAI導入を決定しない。

## 6. Hearing direction

HearingはQuestion completionではなくCoverage completionで扱う。

- Surveyで既に分かっていることを聞き直さない
- 1つの会話で複数のcoverage / lensを満たしてよい
- M01〜M06を顧客会話の章にしない
- memo / statementはObservationであり、Rule Sourceではない
- optional example questionsは営業支援として表示してよいが、必須sequenceにはしない

HA6の`hearing_statement_v2`等は記録基盤として再利用可能だが、`structured_answer_json`をDesign v2のFinal Ruleへ直接流す経路は外す。

## 7. Report direction

Design v2 Customer Reportの5章:

1. 実現したい会社の未来
2. 現在どこまで分かっているか
3. 技術・運用・管理から見た確認ポイントと改善可能性
4. まだ分からないこと
5. 次に確認する価値があるFACT + そのFACTを確認すると何が分かりそうか

Healthy Caseでは問題・Gap・Assessment需要を強制作成しない。

FACT Candidateは少なくとも以下を持つ。

- What to verify
- Why it matters to Future
- What may become knowable
- Related lenses（複数可）

## 8. Assessment boundary

HA6のAssessment Structure / Scope資産は完全削除せず、Free Diagnosisの自動結論から切り離す方向とする。

無料診断のReportが自動で製品・Scope・価格を決定しない。
Assessmentへ進むか、どの範囲を確認するかはHuman Decisionを介する。

## 9. Implementation order after approval

実装開始時は次の順序を原則とする。

1. Design v2 golden cases / rule contractをtestとして固定
2. Survey Contract / Semantic Projection / Initial Narrativeを更新
3. immutable Original Survey Snapshot + Current Structured State + Narrative separationをadditiveに追加
4. Post-Hearing Human Update / deterministic re-analysis APIを追加
5. Hearing UIを2-column coverage型へ変更
6. Post-Hearing Analysisを3-columnへ追加
7. Report 5章 / FACT Candidateへ接続
8. Human Review / Approval / Feedbackを既存基盤へ接続
9. full regression
10. その後に初めてcandidate build / HA7可否を判断

## 10. STOP gate

この文書の時点では、以下を行わない。

- code patch
- migration作成 / 適用
- HA7
- build / test execution
- deploy
- Cloud Run traffic change
- Production変更

次の工程は、実装前の最終Contract確認と、最小差分実装単位の切り分けである。
