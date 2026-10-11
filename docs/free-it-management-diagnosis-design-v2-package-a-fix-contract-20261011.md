# IT経営KAIZEN 無料診断 Design v2 — Package A Fix Contract

Status: FIX REQUIRED BEFORE PACKAGE B
Date: 2026-10-11
Design branch: `docs/free-diagnosis-design-v2-20261010`
Authoritative Package A commit under review: `ea73cb95810bf4397b75ba738bb31652a7f40927`

## 1. Purpose

Package A Source Contract Reviewで確認された差分を、Package Bへ進む前に最小差分で修正する。

本FixはPackage A pure domain + Golden Testの修正だけを対象とする。

禁止:

- DB / migration
- API / routes / repositories
- Public/Admin UI
- Report wiring
- HA6 existing rule flowへの接続
- build/deploy/HA7/Production

## 2. Required fix 1 — UNKNOWNを構造化する

現状はQ5/Q6が明示的に`UNKNOWN`の場合だけ`UnknownItemV2`を生成しており、Package A SSOTのRule Group Eを満たしていない。

Design v2では「分からない」を問題扱いせず、次の確認価値として構造化する。

最低限、以下を`unknowns`へ生成する。

### U1 Future undecided

IF:
- Q2 includes `UNDECIDED`

THEN:
- Futureがまだ具体化されていないことを`UnknownItemV2`として表現する。
- Problem / Gap / Assessment demandにしない。

Customer-facing meaning example:

> 今後1〜3年で実現したい会社の未来は、現時点ではまだ具体化されていません。

Hearing value example:

> まず、どのような会社の状態を実現したいのかを具体化する価値があります。

### U2 Solution / theme applicability unknown

Q7のAI、Automation、Cloud等はInterestであり、適用先が確定していることを意味しない。

最低限、Q7に`AI`または`AUTOMATION`を含み、対象業務を特定できるstructured factが存在しないPackage A stateでは、次を`UnknownItemV2`として表現する。

> どの業務へAI・自動化を適用する価値があるかは未確認。

同じUnknownは、Hearing ViewpointやFACT Candidateを同時に生成してよい。

ただしUnknown = Recommendationではない。

Security / Cloud等についてもInterest単独から適用対象・Risk・必要性を断定しない。

### U3 Report / management detail unknown

Q6が`REPORTED_NOT_DECISION_USABLE`の場合、最低限次をUnknownとして表現可能にする。

- 何が経営へ届いているか
- 何が判断に使えているか
- 何が判断に使いにくいか
- 欲しいが届いていない情報は何か

Q6が`MANAGED_NOT_REPORTED`の場合、最低限次をUnknownとして表現可能にする。

- どの管理情報が経営へ届いていないか
- どの頻度・経路で共有されているか

### U4 Operation detail unknown

Future + Productivity / Lean Operation等から「事業拡大時に今の仕事の進め方を確認する価値」が生じる場合、まだ具体的な業務負荷が特定されていなければ、最低限次をUnknownとして表現可能にする。

- どの業務が事業拡大時に負担増となるか
- 手作業・転記・集計・確認待ち・情報探索・属人化の実態

### UNKNOWN invariants

- `UnknownItemV2`はProblemではない。
- `UnknownItemV2`はFACTではない。
- Hearing後にCurrent Stateが変われば、同じAnalyzerでUnknownが消える/増えることを許す。
- 同じ意味のUnknownを複数ruleが生成する場合はdedupeしてよい。

## 3. Required fix 2 — 実際の3-lens論点を実装する

型として複数Lensを持てるだけでは不十分。AnalyzerとGoldenで、1つの同じ論点に

- `TECHNOLOGY`
- `OPERATION`
- `MANAGEMENT`

の3つが同時に成立するケースを証明する。

### Canonical 3-lens scenario

Input example:

- Q2 includes `BUSINESS_GROWTH`
- Q2 includes `LEAN_GROWTH`
- Q3 includes `PRODUCTIVITY`
- Q3 includes `MANAGEMENT_DECISION_SUPPORT`
- Q4 = `MANAGEMENT_DECISION`
- Q5 in {`VISIBLE_PARTIAL`, `RELIES_ON_OTHERS`, `LOW_VISIBILITY`}
- Q6 = `REPORTED_NOT_DECISION_USABLE`
- Q7 includes `AI` or `AUTOMATION`

Same issue meaning:

> 事業拡大を少人数で支えるために、経営判断に必要な情報を「作る・届ける・使う」流れを確認する価値がある。

One `lensFinding` for this issue may contain:

- TECHNOLOGY: 集計・自動化・AI・データ活用等で情報作成を支えられる可能性
- OPERATION: 情報収集・集計・報告の仕事の進め方を見直す可能性
- MANAGEMENT: 何を経営へ届け、どう判断に使うかを整理する可能性

重要:

- 3つの別findingを作って帳尻を合わせるのではなく、Golden #13では**同一findingの`lenses`に3つが入ること**をassertする。
- AI導入、RPA導入、システム連携必要等を確定しない。

## 4. Required fix 3 — Narrative section意味を修正する

`analysis.unknowns`を顧客向けに「ITで良くできそうなこと」という見出しへ載せてはならない。

Narrativeの最低5 sectionは意味を揃える。

1. `future`
   - 実現したい会社の未来
2. `currentUnderstanding`
   - 現在どこまで分かっているか
3. `confirmationAndImprovement`
   - 技術・運用・管理から見た確認ポイントと改善可能性
4. `unknowns`
   - まだ分からないこと / まだ確認できていないこと
5. `nextFacts`
   - 次に確認する価値があること

`unknowns` section heading candidate:

> まだ分からないこと

または

> まだ確認できていないこと

「改善可能性」は`confirmationAndImprovement`側で扱う。

## 5. Required fix 4 — Golden Guard assertionを構造的に強化する

禁止語1つの不在だけでGuard成立としない。

### 5.1 Common structural guard helper

Golden Testで、Analysis/Narrative public outputに少なくとも次の自動決定fieldが存在しないことを検証可能にする。

- `recommendation`
- `recommendedSolution`
- `solutionDecision`
- `assessmentScope`
- `problem`
- `gap`

既存`lensFindings`、`factCandidates`等の正規fieldは誤検知しないこと。

加えて、contract-criticalな禁止表現も必要最小限で確認してよい。

### 5.2 Case #2 — HA6-like + AI

最低限:

- AI related possibility / interestが出る
- AI applicability Unknownが出る
- AI related FACT CandidateまたはHearing Viewpointが出る
- 自動Recommendation/solution decision fieldがない
- 「AI導入が必要」「AIを導入すべき」等を出さない

### 5.3 Case #6 — Security interest only

Security interestを確認するケースは、できるだけneutralな他条件にして、Security interest単独がrisk assertionを作らないことを検証する。

最低限:

- Security interest / confirmation valueは表現可能
- `problem` / `gap` / `recommendation` / `recommendedSolution` / `assessmentScope` fieldなし
- Security Risk存在断定なし

### 5.4 Case #7 — Low Visibility ≠ FACT

最低限:

- Current Understandingが「認識」として表現される
- Low Visibility由来のconfirmation/unknownは可
- FACT certification fieldやProblem/Gap fieldがない
- 顧客回答をFACTとして断定しない

### 5.5 Case #11 — Future UNDECIDED

最低限:

- Future undecided `UnknownItemV2`が存在する
- Problem/Gap/Recommendationを生成しない

### 5.6 Case #12 — Q7 UNDECIDED

最低限:

- Recommendation/Solution Decisionを生成しない
- Q7 undecidedがFuture/Visibility/Management Connectionを上書きしない

### 5.7 Case #13 — 3-lens

最低限:

- 同一`lensFinding`の`lenses`がTECHNOLOGY + OPERATION + MANAGEMENTをすべて含む

### 5.8 Case #15 — UNKNOWN without Problem

最低限:

- `unknowns.length > 0`
- Unknownは構造化されている
- Problem/Gap/Recommendation fieldsなし

### 5.9 Case #16 — deterministic re-analysis

最低限:

1. 同じstateで`analyzeFreeDiagnosisV2`を2回呼び、deep equalityを確認する。
2. Current Stateを変更すると対応するanalysisが変わる。

これにより「deterministic」と「Current State re-analysis」の両方を証明する。

### 5.10 Case #19 — Interest does not override

Q7だけ変更したbefore/afterで、最低限次をdeep equalityで確認する。

- `futureUnderstanding`
- Q5/Q6由来の`currentUnderstanding`

Interest関連のlens/unknown/viewpoint/fact candidateだけが変わってよい。

### 5.11 Case #20 — no legacy contamination

代表1ケースだけでなく、Golden fixture matrixの複数caseのpublic outputをserializeし、次が出ないことを確認する。

- `M01`〜`M06`
- `Primary Focus`
- `Secondary Focus`
- `primaryFocus`
- `secondaryFocus`

静的Package A source reviewでも混入がないことは維持する。

## 6. Files allowed to change

Fixで変更してよいのは原則以下だけ。

- `src/domain/freeDiagnosisAnalysisV2.ts`
- `src/domain/freeDiagnosisNarrativeV2.ts`
- `test/freeDiagnosisDesignV2.golden.test.ts`

必要なら`src/domain/freeDiagnosisDesignV2.ts`の型を最小差分で調整してよい。

`freeDiagnosisSemanticProjectionV2.ts`は、今回の指摘に必要がない限り変更しない。

## 7. Acceptance criteria

Package A Fixは次をすべて満たしたらPASS。

1. Future `UNDECIDED`が構造化Unknownになる
2. AI/Automation等のInterest適用先未確認を構造化Unknownとして表現できる
3. Q6/operation detailの未確認事項を構造化Unknownとして表現できる
4. 同一findingに3 Lensが実在するGolden caseがある
5. Narrative `unknowns` sectionが未確認事項の意味になっている
6. Golden #2/#6/#7/#11/#12/#13/#15/#16/#19/#20が構造的assertへ強化される
7. 既存20 Goldenの意味を壊さない
8. Projection validationを維持
9. HA6 regressionがgreen
10. Package Aは引き続き既存HA6 production flowへ未接続
11. DB/API/UI/migration/cloud変更なし

## 8. STOP gate

Fix commit後にSTOPする。

Package Bへ進まない。

Source Reviewを再実行してPASSするまで、Original Survey Snapshot / Current State persistence / migration / API / UIへ進まない。
