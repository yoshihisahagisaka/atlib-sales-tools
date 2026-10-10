# 無料IT経営診断 Design v2 — Survey Semantic / Narrative Rule

Status: DESIGN V2 WORKING CONTRACT

本書は、事前アンケート回答から初期分析文を決定論的に生成し、60分ヒアリング後に人間が現在値を更新した際も同じRuleで再分析できるようにするための設計契約である。

重要原則：

- Survey Originalは顧客が回答した初期値として変更不可で保存する。
- Survey Answer / Hearing Statement はFACTではない。
- Hearing memo / recordingは診断ロジックへ直接入力しない。
- Post-Hearing Analysisで人間がCurrent Structured Stateを更新する。
- Current Structured Stateを入力に同じ決定論Ruleを再実行する。
- System Generated NarrativeはHuman Edit可能だが、編集してもFACTへ昇格しない。
- Q2 Future単独、Q7 Interest Theme単独からProblem / Finding / Recommendationを生成しない。
- 技術・運用・管理は排他的分類ではなく、同一論点へ複数レンズを適用できる。
- 無料診断はCandidate / Possibility / UNKNOWN / Next FACT Candidateまで。有料AssessmentでEvidence→FACT/UNKNOWN→Gap/Findingを行う。

## 1. Question Role

### Q1 Context
会社規模・拠点等。診断文の主因にはせず、必要な文脈補助に使用する。

### Q2 Future
今後1〜3年で実現したい会社の未来。MULTI_SELECT。

Semantic examples:
- FUTURE_GROW_BUSINESS
- FUTURE_NEW_BUSINESS
- FUTURE_MORE_LOCATIONS
- FUTURE_GROW_WITH_SMALL_TEAM
- FUTURE_CHANGE_WORK_STYLE
- FUTURE_REVIEW_ORGANIZATION
- FUTURE_STABLE_CONTINUITY
- FUTURE_NO_MAJOR_CHANGE
- FUTURE_UNDECIDED

Direct Narrative:
- 「今後1〜3年で、事業を広げることを目指しています。」
- 「少人数でも無理なく成長・運営できる会社を目指しています。」

Guard:
- Future単独から現在の課題を断定しない。

### Q3 IT Expectation
Futureに対してITへ期待する役割。MULTI_SELECT、最大2件を想定。

Semantic examples:
- EXPECT_PRODUCTIVITY
- EXPECT_MANAGEMENT_DECISION
- EXPECT_INFORMATION_USE
- EXPECT_CHANGE_SUPPORT
- EXPECT_EMPLOYEE_EXPERIENCE
- EXPECT_SECURITY_CONTINUITY
- EXPECT_IT_OPERATION_REDUCTION
- EXPECT_UNDECIDED

Direct Narrative:
- 「その実現に向けて、ITには業務の生産性を高める役割を期待しています。」
- 「ITには経営判断を支える役割を期待しています。」

Guard:
- ExpectationはDesired StateでありCurrent Problemではない。

### Q4 Current Interest
現在特に確認したいこと。SINGLE_SELECT。

Semantic examples:
- INTEREST_MANAGEMENT_DECISION
- INTEREST_PRODUCTIVITY
- INTEREST_INFORMATION_SHARING
- INTEREST_GROWTH_CHANGE
- INTEREST_IT_OPERATION
- INTEREST_SECURITY_CONTINUITY
- INTEREST_NOT_DECIDED

Role:
- Hearing priority / viewpoint weightingに使う。
- Q4単独でGapを生成しない。

### Q5 Visibility
業務・ITの現在状態を経営としてどこまで見えていると認識しているか。SINGLE_SELECT。

Semantic examples:
- VISIBILITY_BROAD
- VISIBILITY_MIXED
- VISIBILITY_PARTIAL
- VISIBILITY_LOW
- VISIBILITY_UNKNOWN

Initial Narrative examples:
- BROAD: 「現在の業務・ITについて、全体として把握できているという認識です。」
- MIXED: 「現在の業務・ITについて、分かることと分からないことがあるという認識です。」
- PARTIAL: 「現在の業務・ITについて、把握できている範囲は一部に限られているという認識です。」
- LOW: 「現在の業務・ITについて、経営として十分に把握できていないという認識です。」

Guard:
- Survey時点では「認識」と表現し、事実断定しない。

### Q6 Management Connection / Decision Usability
ITの状況が管理され、経営へ届き、経営判断に使える形になっているか。SINGLE_SELECT。

Working Semantic categories:
- MGMT_UNMANAGED
- MGMT_MANAGED_NO_REPORT
- MGMT_REPORTED_NOT_USABLE
- MGMT_USABLE
- MGMT_STRATEGICALLY_CONNECTED
- MGMT_UNKNOWN

Working option meaning:
- ほとんど管理されていない
- 管理はされているが、経営への報告・共有がほとんどない
- 報告はあるが、数字の羅列や専門用語が多く、経営判断には使いにくい
- 経営判断に必要な情報として整理され、ある程度活用できている
- 事業計画と結びつけて報告・提案され、経営判断に活用できている
- よく分からない

Initial Narrative examples:
- UNMANAGED: 「ITの状況について、経営として十分に管理・把握できていないという認識です。」
- MANAGED_NO_REPORT: 「ITの管理は行われている一方、その情報が経営へ継続的に届く状態にはなっていないという認識です。」
- REPORTED_NOT_USABLE: 「ITに関する報告はあるものの、経営判断に使える形へ十分に整理されていないという認識です。」
- USABLE: 「ITに関する情報は、経営判断に使える形である程度整理・活用されているという認識です。」
- STRATEGICALLY_CONNECTED: 「ITに関する情報や提案が、事業計画と結びついた形で経営判断に活用されているという認識です。」

### Q7 Interest Theme
現在関心のあるITテーマ。MULTI_SELECT、最大3件程度を想定。

Semantic examples:
- THEME_AI
- THEME_AUTOMATION
- THEME_DATA_VISUALIZATION
- THEME_SECURITY
- THEME_IT_LITERACY
- THEME_SYSTEM_RENEWAL
- THEME_CLOUD
- THEME_IT_COST
- THEME_IT_OPERATION
- THEME_INTEGRATION
- THEME_WORK_ENVIRONMENT
- THEME_NOT_DECIDED

Role:
- Customer Interest / Hearing Viewpointを追加する。
- Q7単独ではRecommendation / Finding / Scopeを生成しない。

Direct Narrative:
- 「AI・生成AIに関心があります。」
- 「業務の自動化・効率化に関心があります。」

## 2. Cross Combination Rules

単一設問の回答ではなく、複数回答を掛け合わせることで初期分析文を生成する。

### Rule A — Growth × Small Team × Productivity
IF:
- Q2 includes FUTURE_GROW_BUSINESS
- Q2 includes FUTURE_GROW_WITH_SMALL_TEAM
- Q3 includes EXPECT_PRODUCTIVITY

THEN:
- Operation Lens: OPPORTUNITY / CONFIRMATION_VALUE
- Narrative:
  「事業を拡大しながら少人数で運営するという将来像に対して、現在の仕事の進め方が事業規模の拡大にも無理なく対応できるかを確認する価値があります。」

UNKNOWN to clarify:
- どの業務が事業拡大時に負担増となるか
- 手作業・転記・集計・確認待ち・情報探索・属人化の実態

### Rule B — Growth × Small Team × AI / Automation Interest
IF:
- Q2 includes FUTURE_GROW_BUSINESS or FUTURE_GROW_WITH_SMALL_TEAM
- Q3 includes EXPECT_PRODUCTIVITY
- Q7 includes THEME_AI or THEME_AUTOMATION

THEN:
- Technology Lens: OPPORTUNITY
- Narrative:
  「事業を広げながら少人数で運営するという将来像に対して、自動化・効率化・AI活用など、技術を使って事業成長を支えられる可能性があります。ただし、どの業務へ適用する価値があるかは現時点では分かっていません。」

Guard:
- AI導入が必要、RPAが必要、システム連携が必要とは言わない。

### Rule C — Management Interest × Mixed Visibility × Report Not Usable
IF:
- Q4 = INTEREST_MANAGEMENT_DECISION
- Q5 in {VISIBILITY_MIXED, VISIBILITY_PARTIAL, VISIBILITY_LOW}
- Q6 = MGMT_REPORTED_NOT_USABLE

THEN:
- Management Lens: HIGH_CONFIRMATION_VALUE
- Narrative:
  「ITや業務について一定の情報は得られている一方、その情報が経営判断に使える形へ十分に整理されているかについて確認価値があります。」

UNKNOWN to clarify:
- 何が経営に届いているか
- 何が判断に使えているか
- 何が判断に使いにくいか
- 欲しいが届いていない情報は何か

### Rule D — Future Change × Limited Visibility
IF:
- Q2 includes any material Future Change
- Q5 in {VISIBILITY_MIXED, VISIBILITY_PARTIAL, VISIBILITY_LOW}

THEN:
- Management + Operation Lens: CONFIRMATION_VALUE
- Narrative:
  「今後の会社の変化に対して、現在把握できていない部分が事業拡大や運営上の判断に影響しないかを確認する価値があります。」

Guard:
- 「把握不足が問題」と断定しない。

### Rule E — Strategic Connection Healthy Case
IF:
- Q5 = VISIBILITY_BROAD
- Q6 in {MGMT_USABLE, MGMT_STRATEGICALLY_CONNECTED}
- Q2 = FUTURE_NO_MAJOR_CHANGE or limited change

THEN:
- NO_IMPORTANT_GAP_IDENTIFIED candidate
- Narrative:
  「現時点では、ITの把握や経営への接続について大きな懸念は見えにくい状態です。今後も事業環境の変化に応じて継続的に把握・判断できる状態かを確認します。」

Guard:
- Healthyでもゼロ確認にはしない。Future readinessのみ確認可能。

### Rule F — Security Interest
IF:
- Q7 includes THEME_SECURITY

THEN:
- Technology + Management Lens: INTEREST / POSSIBLE_CONFIRMATION
- Narrative:
  「セキュリティに関心があります。現在の対策内容そのものだけでなく、経営としてリスクや事業への影響をどこまで把握・判断できているかを確認する価値があります。」

Guard:
- Security risk existsとは断定しない。

### Rule G — IT Literacy Interest
IF:
- Q7 includes THEME_IT_LITERACY

THEN:
- Operation + Management Lens: INTEREST / POSSIBLE_CONFIRMATION
- Narrative:
  「社員のITリテラシーや教育に関心があります。どのような場面で知識・ルール・判断のばらつきが事業や日常業務に影響しているかを確認することで、教育の必要性や対象を考える材料になります。」

Guard:
- 教育不足とは断定しない。

## 3. Narrative Assembly Order

Initial Report Draftは以下の順に組み立てる。

1. Future Direct Narrative（Q2）
2. IT Expectation Direct Narrative（Q3）
3. Current Recognition Narrative（Q5/Q6）
4. Cross-derived 3-lens Possibility Narrative
5. UNKNOWN / Hearing Coverage
6. Next FACT Candidate + Expected Learning

重複文は抑制し、同じ意味を複数テーマで繰り返さない。

## 4. Hearing Coverage Generation

Hearingでは固定質問セットを生成しない。

生成対象は「未確認」「解像度を上げたい視点」である。

Example for HA6-like state:
- 事業をどのように広げようとしているか
- 少人数で運営できる状態とは具体的にどのような状態か
- 今の仕事の進め方でその成長を支えられそうか
- 負担が増えそうな業務はどこか
- 経営には現在どのような情報が届いているか
- 何が判断に使えて、何が使いにくいか
- AI・自動化をどの業務で使いたいと考えているか
- まだ確認できていないことは何か

一つの会話・発言が複数視点を同時に満たしてよい。Theme単位の完了管理は必須にしない。

## 5. Post-Hearing Human Update

Post-Hearing Analysisでは、Survey Originalを左、Hearing Recordを中央、Current Structured Stateを右に表示する。

Human may:
- 初期選択を維持する
- 選択肢自体を変更する
- MULTI_SELECTを追加・削除する
- 補足文章を追加する
- System Generated Narrativeを編集する

例：
Original Q6:
- MGMT_REPORTED_NOT_USABLE

Hearingで判明:
- 実際には必要時に担当者へ確認するだけで定期報告はない

Human Updated Q6:
- MGMT_MANAGED_NO_REPORT

Rule再実行後 Narrative:
- 「ITの管理は行われている一方、その情報が経営へ継続的に届く状態にはなっていないという理解です。」

## 6. Initial vs Post-Hearing Wording

Initial Survey-derived narrative:
- 「〜という認識です」
- 「〜と回答されています」
- 「〜の可能性があります」
- 「〜を確認する価値があります」

Post-Hearing Human-updated narrative:
- 「60分のヒアリングを通して、〜と整理されました」
- 「現在は〜という理解です」
- 「〜についてはまだ確認できていません」

Evidence未確認のため、Post-HearingでもFACT断定にはしない。

## 7. Next FACT Candidate Rule

Current Understandingから、Assessment候補として以下の形式で出す。

- FACT Candidate: 何を確認するか
- Expected Learning: それを確認すると何が分かりそうか
- Related Lens: 技術 / 運用 / 管理（複数可）
- Related Future: どのQ2 Futureに関係するか

Example:
FACT Candidate:
- 経営に報告されているIT・業務情報の内容、頻度、作成元

Expected Learning:
- 情報そのものが不足しているのか、報告方法に問題があるのか、管理方法を見直すべきなのかを判断する材料が得られる。

Guard:
- Assessment Scopeへ自動昇格させない。Human Reviewが必要。

## 8. HA6-like Example

Input:
- Q2: 事業を広げる / 少人数で成長・運営する
- Q3: 生産性を高めたい / 経営判断を支えたい
- Q4: 経営判断に関すること
- Q5: 分かることと分からないことがある
- Q6: 報告はあるが、そのままでは経営判断に使いにくい
- Q7: AI・生成AI

Initial Narrative:

「今後、事業を広げながら、少人数でも無理なく成長・運営できる会社を目指しています。その実現に向けて、ITには業務の生産性向上と経営判断を支える役割を期待しています。

現在の業務・ITについては、分かることと分からないことがあるという認識です。また、ITに関する報告はあるものの、その情報が経営判断に使える形へ十分に整理されていないという認識があります。

事業を拡大しながら少人数で運営するという将来像に対して、運用面では現在の仕事の進め方が事業規模の拡大にも無理なく対応できるかを確認する価値があります。技術面では、自動化・効率化・AI活用などによって事業成長を支えられる可能性がありますが、どの業務へ適用する価値があるかはまだ分かっていません。管理面では、ITや業務に関する情報が経営判断に使える形で整理・報告されているかを具体的に確認する価値があります。」

This narrative is not FACT. It is deterministic Initial Analysis from Survey Recognition.

## 9. STOP / Safety Rules

- Survey answerを自動で訂正しない。
- Hearing memo / transcriptから自動でCurrent Stateを書き換えない。
- AIがCurrent Structured Stateを確定しない。
- Q7 interestからsolution recommendationを作らない。
- 3-lens scoreを作らない。
- Future aloneからProblem / Gap / Assessment Scopeを作らない。
- Human Edited NarrativeからFACTを作らない。
- Assessment Scope CandidateはHuman Review前に確定しない。
