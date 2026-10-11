# IT経営KAIZEN 無料診断 Design v2 — Hearing → Current Understanding Bridge Decision

Status: DESIGN LOCKED / IMPLEMENTATION NOT STARTED
Date: 2026-10-11
Scope: Package D final UX refinement only

## 1. Human Acceptance finding

診断判定・分析内容・生成文面の方向性は受容済み。
残課題は、Humanがヒアリング記録からCurrent Understanding（Q2〜Q7）へ戻る際の認知負荷。

現状の共通メモ1件では、どのHearing Viewpointで得た情報かが失われ、Post-Hearingで「どのQを見直すべきか」をHumanが頭の中で再構成する必要がある。

## 2. Decision

Live HearingとPost-Hearingの間に、次の表示上のBridgeを設ける。

Hearing Viewpoint
→ ViewpointごとのHearing Memo
→ 関連するSurvey Questionへのナビゲーション
→ HumanがCurrent Understandingを必要に応じて更新
→ Re-analysis

このBridgeはHumanの判断を助けるためのUXであり、診断ルールではない。

## 3. Per-viewpoint memo

Live Hearingでは各「今回確認したいこと」カードに、そのViewpoint専用のmemo入力を配置する。

推奨Desktop配置:
- 左側: Viewpoint title / why useful / lens / optional example questions
- 右側: 当該Viewpoint専用memo

共通memoは主入力にしない。
Viewpointに属さない内容用として「その他メモ」を小さく残してよい。

Viewpoint memoはHearing Recordであり、以下を禁止する。
- Current State自動変更
- Analyzer直接入力
- memo本文からのsemantic自動抽出
- AIによる回答変更の自動決定

## 4. Hearing → Survey bridge

各Viewpointは、表示上のみ「関連する回答」を持てる。

例:
- 関連する回答: Q2 / Q3 / Q5

Post-HearingではViewpoint memo cardから関連Qへ1クリックで移動できるようにする。

右側Step 1「回答を見直す」で対象Qを自動的に開くことは許可する。
回答値の自動変更はしない。

逆方向にも、Q summaryから「関連するヒアリング記録」を参照できるようにしてよい。

この対応はmany-to-manyを許容する。
- 1 Viewpoint → 複数Q
- 1 Q → 複数Viewpoint

## 5. Mapping source

重要:
関連Q mappingをfrontendのad-hocルールやmemo本文解析で作らない。

実装前にactual source Fit/Gapを行う。

優先順位:
1. Existing deterministic provenanceから関連Qを取得可能なら再利用
2. sourceRuleIds等からserver/domain側でdeterministically導出可能なら、表示用provenance metadataとして追加
3. それでも不可能なら、診断意味を変えない明示的display mappingをDomain contractとして定義

関連Q metadataはnavigation/provenance目的であり、Analyzerの判断結果を変更しない。

## 6. Persistence source Fit/Gap

Viewpointごとのmemo保存は、既存`hearing_statement_v2`とHearing Statement APIのactual schemaを確認してから実装する。

確認対象:
- stable Viewpoint referenceを既存fieldで安全に保持できるか
- `planItemRef`等をDesign v2 Viewpoint参照として利用して意味衝突がないか
- same Case integrity
- append semantics
- authenticated actor

安全に保持できる場合はmigrationなしで再利用する。
既存fieldに意味衝突がある場合、勝手に流用しない。
新migrationが必要ならPackage D内で実施せずSTOPしてDecisionを戻す。

## 7. Live Hearing target UX

Standard desktopでは、5件前後の「今回確認したいこと」をできるだけ1画面内で把握できる密度を目標とする。

各card:
- 番号
- title
- short why useful
- lens badges
- memo
- collapsed example questions

全Viewpoint完了を要求しない。
progress scoreは作らない。

## 8. Post-Hearing target UX

LEFT:
- Original Survey

CENTER:
- Hearing RecordをViewpointごとのcompact cardで表示
- title
- memo
- related Q chips/links
- その他メモは別card

RIGHT Step 1:
- Current Q2〜Q7 compact summary
- 関連するHearing cardへの参照
- Humanが必要なQだけ「変更する」

HumanはHearingからSurveyへ戻る際に、記憶で対応付けを再構成しなくてよい。

## 9. Non-goals

このUX改善で行わない:
- Survey question変更
- Analysis Rule変更
- Narrative Rule変更
- Hearing memoをAnalyzer inputへ追加
- memoからAIが新しい回答を提案・確定
- Package E
- Report/Review/Delivery/Feedback変更
- migration追加を無断実施
- Production deploy

## 10. Acceptance

Human Acceptanceでは次を確認する。

- Viewpointごとにその場でmemoを取りやすい
- 5件程度の確認テーマを一覧把握しやすい
- Post-Hearingで各memoの文脈を失わない
- memoから関連Qへすぐ移動できる
- どのQを見直すべきかの認知負荷が下がる
- それでもHumanが最終的に回答変更を決める
- memoは診断結果を自動変更しない
