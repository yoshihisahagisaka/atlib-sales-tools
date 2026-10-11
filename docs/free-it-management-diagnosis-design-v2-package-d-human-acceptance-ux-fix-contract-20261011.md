# IT経営KAIZEN 無料診断 Design v2 — Package D Human Acceptance UX Fix Contract

Status: HUMAN ACCEPTANCE FAIL / UX FIX REQUIRED
Date: 2026-10-11
Target branch: `feat/free-diagnosis-design-v2-package-d`
Current reviewed HEAD: `54bb323f29fd10673513983a48adcbee24555fbd`

## 1. Human Acceptance result

Package Dの機能境界・Source Review・RegressionはPASSしているが、実画面Human Acceptanceで運用上のUX問題が確認されたため、Package DはCLOSEしない。

今回の問題は診断ロジック/API/Persistenceではなく、情報設計と表示密度である。

Human feedback:

- Live Hearingの「最初の回答」は一覧性はあるが、回答単位の視認性をもう少し上げたい。色分け等の軽い工夫は許容。
- Hearing Viewpoint 5件が画面上で何を指しているのか直感的に分からない。
- Post-Hearingは右ペインが長すぎ、必要な情報へアクセスしづらい。
- 現在の理解・分析・生成文面・顧客向け文面が一続きで積まれ、スクロール量が大きすぎる。

最終判定:

**PACKAGE D HUMAN ACCEPTANCE: FAIL / UX FIX REQUIRED**

Package Eへは進まない。

## 2. Preserve all existing product boundaries

今回のUX修正でも以下は変更しない。

- Original Survey immutable/read-only
- Live HearingはOriginal + Hearingの2-layer
- Live HearingにCurrent State editorを置かない
- Live HearingにRe-analysisを置かない
- Live HearingにNarrative editorを置かない
- Hearing memoをAnalyzer inputにしない
- Post-HearingはOriginal / Hearing Record / Current Understandingの3-layer
- Q2〜Q7のみHuman update
- Current SaveとRe-analysisは別HTTP request
- Re-analysis失敗時もHuman Currentを保持
- Generated NarrativeとHuman Edited Narrativeを分離
- Healthy Caseへ人工Gapを作らない
- InterestからSolution Recommendationを自動生成しない
- UNKNOWNを問題・欠陥扱いしない
- FACT CandidateをAssessment Scope確定扱いしない

## 3. UX principle

Design v2の情報量を減らすために診断情報を削除するのではなく、

**必要な情報へ短い操作で到達できるようにProgressive Disclosureする。**

一画面に全レイヤーを常時展開しない。

## 4. Live Hearing — Original Survey readability

左側「最初の回答」はQ1〜Q7を単なる長いテキスト列ではなく、回答単位のcompact cardとして表示する。

各card:

- Q番号
- 日本語の質問短縮label
- 現在の回答

を明確に分ける。

色は情報意味を追加しない淡いaccent/backgroundのみ使用可。
赤/黄/緑で良し悪しを示さない。

回答が複数ある場合はchip/badge等で区切ってよい。

## 5. Live Hearing — Viewpoint visibility

operator-facing primary labelとして `Viewpoint` を前面に出さない。

推奨label:

**今回確認したいこと**

または

**ヒアリングの確認ポイント**

Analysis ResultのhearingViewpoints 5件を、番号付きcompact cardとして明示する。

例:

- 1. 事業が増えたときに負担が集中する業務
- 2. AI・自動化を適用する価値がある業務
- 3. 経営判断に使う情報の作られ方・届き方

cardには原則:

- short title
- why useful（1〜2行）
- related lens badges

だけを常時表示する。

example questionsはdefaultで展開し続けず、`聞き方の例を見る` 等で開閉可能にする。

5件すべてを完了させる必要はなく、completion score/progress %は作らない。

## 6. Live Hearing — screen behavior

Desktopでは左Original / 右Hearingの2-columnを維持する。

左右それぞれをviewport内でindependent scroll可能にすることを優先する。

Hearing側では:

1. 今回確認したいこと（compact）
2. ヒアリング記録
3. memo追加

へ短距離で到達できること。

`今回確認したいこと` をsticky local headerまたは上部summaryとして維持してよい。

## 7. Post-Hearing — keep 3 layers, change right work area

概念上の3-layerは維持する。

- 左: 最初の回答
- 中央: ヒアリング記録
- 右: 現在の理解

ただし、右列へ全コンテンツを一続きに常時展開する現状を廃止する。

右列は**作業ステップ切替型**にする。

推奨3ステップ:

1. **回答を見直す**
2. **分析を確認する**
3. **顧客向け文面を整える**

operatorは上部tab/segmented navigationで切り替える。

同時に3ステップ全内容を縦に積まない。

## 8. Post-Hearing — Step 1 回答を見直す

Q2〜Q7は、全選択肢を常時展開しない。

Default compact view:

- Question label
- 現在選択されている回答（chips/text）
- diff status
- `変更する` action

`変更する` を押したquestionだけ選択肢を展開する。

変更があるquestionは視認できるよう軽くhighlightしてよい。

Difference-first:

- 変更なし
- ヒアリング後に変更
- 追加
- 外した項目

は維持する。

`現在の理解を保存して再分析` はこのStepに置く。

## 9. Post-Hearing — Step 2 分析を確認する

以下を表示:

- 実現したい会社の未来
- 現在どこまで分かっているか
- 技術・運用・管理から見た確認ポイント
- まだ確認できていないこと
- 次に確認する価値があること

一画面で非常に長くならないよう、section card / accordion / local navigationを利用してよい。

各finding/fact candidateはcompact cardにする。

技術・運用・管理はbadgeとして扱い、score/column化しない。

FACT Candidateの表示意味は:

- 何を確認するか
- なぜ確認するか
- 何が分かりそうか
- 関連lens

を維持する。

## 10. Post-Hearing — Step 3 顧客向け文面を整える

このStepで:

- 分析から作成した文面（read-only reference）
- 顧客向け文面（editable）

を扱う。

Generatedを常時大きく展開する必要はない。
`分析から作成した文面を見る` 等の折りたたみを許容する。

顧客向け文面editorを主作業領域とする。

REANALYSIS_REQUIRED中の編集保存禁止/stale warningは維持する。

## 11. Desktop layout

Desktopの3-columnは維持するが、幅は均等である必要はない。

推奨:

- Original: 20〜25%
- Hearing Record: 20〜25%
- Current work area: 50〜60%

各columnはviewport内でindependent scrollを基本とする。

Page全体を数画面分スクロールしないと主要機能へ到達できない構造を避ける。

## 12. Mobile/narrow

縦積みは継続可。

ただしPost-Hearingでは右作業ステップ navigationを維持し、全Stepを一度に縦積みしない。

Original / Hearing Record / Current Understandingの区別は維持する。

## 13. Terminology

operator-facingで以下を使用しない:

- Viewpoint（主見出しとして）
- Semantic Projection
- Current Structured State
- Generated Narrative
- Rule Result
- M01〜M06
- Primary / Secondary Focus

推奨日本語:

- 最初の回答
- 今回確認したいこと
- ヒアリング記録
- 現在の理解
- 回答を見直す
- 分析を確認する
- 顧客向け文面を整える
- 現在の分析
- まだ確認できていないこと
- 次に確認する価値があること

## 14. Test acceptance additions

Browser Acceptanceへ最低限追加する。

- Live Originalがcompact cardで判別可能
- `今回確認したいこと` 5件が番号付きで明確に認識可能
- example questions default collapsed / explicit expand action
- Liveの主要3領域へ過度なpage scrollなしで到達できること（DOM/layout assertion可能範囲）
- Post-Hearing右側に3つの作業step navigation
- defaultでは1 stepのみ表示
- Step 1でQ2〜Q7 compact summary
- `変更する` で該当questionだけ展開
- Step 2でAnalysis
- Step 3でGenerated reference + Human edit
- Save/Re-analysis boundary維持
- stale/freshness guard維持
- Desktop independent scroll container
- Mobileでもstep switching維持

## 15. Forbidden

今回禁止:

- Design v2 domain変更
- Package A analyzer変更
- Package B persistence変更
- Package C API semantics変更
- migration 027〜033変更
- 新migration
- Production DB
- Public Survey変更
- Package E Report/Review/Delivery/Feedback実装
- KPI実装
- HA7
- deploy
- Production traffic

## 16. Closure gate

UX fix後:

1. Regression
2. Source Review
3. Human Acceptance再実施

Human Acceptanceで実際の60分会話・Post-Hearing整理に耐えることを確認してからPackage DをCLOSEする。
