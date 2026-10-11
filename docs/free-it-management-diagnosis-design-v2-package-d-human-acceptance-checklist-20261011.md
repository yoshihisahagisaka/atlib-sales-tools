# IT経営KAIZEN 無料診断 Design v2 — Package D Human Acceptance Checklist

Status: HUMAN ACCEPTANCE READY
Date: 2026-10-11
Target runtime HEAD: `54bb323f29fd10673513983a48adcbee24555fbd`

## Purpose

Package DはSource ReviewまでPASS済み。ここではコード品質ではなく、実際の営業・診断オペレーションとして使えるかをHuman Acceptanceする。

Human Acceptanceは以下の3判定のいずれかとする。

- PACKAGE D HUMAN ACCEPTANCE: PASS
- PACKAGE D HUMAN ACCEPTANCE: PASS WITH MINOR UX FIX
- PACKAGE D HUMAN ACCEPTANCE: FAIL / UX FIX REQUIRED

## Local acceptance target

Human Acceptance環境はProductionではなくlocal/test-onlyを使用する。

- Local URL: `http://127.0.0.1:4310`
- Case ID: `73b563b7-4635-4b8e-a2b4-a4cac2bd091e`
- Live Hearing: `/admin/free-diagnosis-v2-hearing.html?caseId=73b563b7-4635-4b8e-a2b4-a4cac2bd091e`
- Post-Hearing: `/admin/free-diagnosis-v2-analysis.html?caseId=73b563b7-4635-4b8e-a2b4-a4cac2bd091e`

Reported setup facts:

- local/test-only PGlite
- no Production connection
- HTTP 200
- freshness CURRENT
- Hearing Viewpoint 5件
- UNKNOWN 3件
- FACT Candidate 5件

## A. Live Hearing Human Acceptance

### A1. Immediate comprehension

画面を開いた時に、説明を読まずとも以下が理解できるか。

- 左 = 最初の回答
- 右 = ヒアリングの補助
- 顧客との会話が主であり、画面が主役ではない

### A2. Survey readability

Original Surveyを見て、顧客が何を望み・何に関心を持ち・どこまで把握していると答えたかを短時間で把握できるか。

確認:
- 日本語が自然か
- 情報量が多すぎないか
- raw/internal code感がないか
- 顧客との会話中に視線移動が負担にならないか

### A3. Hearing Viewpoint quality

Viewpoint 5件が「固定質問票」ではなく会話の補助として機能するか。

確認:
- 同じ話を複数Viewpointで繰り返し聞く感覚がないか
- Why Usefulが会話の意図を理解する助けになるか
- 聞き方の例が、そのまま読み上げる質問集ではなく自然な深掘りのヒントになっているか
- 技術 / 運用 / 管理のlensがscoreや分類強制に見えないか

### A4. Memo operation

実際に2〜3件のメモを入力する。

確認:
- 会話を止めずに記録できるか
- 入力欄や保存動作が重くないか
- メモ履歴が会話の邪魔をしないか
- 顧客発言とoperator解釈を混同しそうなUIになっていないか

### A5. Transition

全Viewpointを埋めなくても、自然に「ヒアリング後の整理」へ進めるか。

「未完了だから進めない」という感覚がないこと。

## B. Post-Hearing Human Acceptance

### B1. Three-layer comprehension

最初の回答 / ヒアリング記録 / 現在の理解、の違いが直感的に分かるか。

特に:
- 左は過去のOriginal
- 中央は情報源
- 右だけがHumanが更新するCurrent

という責任分界が説明なしで理解できるか。

### B2. Current update

Q2〜Q7のうち、実際に1〜2項目を変更してみる。

確認:
- 何を変更すべきか分かるか
- Originalを上書きしているように見えないか
- 「変更なし / ヒアリング後に変更 / 追加 / 外した項目」が自然に理解できるか
- validationが邪魔ではなく補助として機能するか

### B3. Save and re-analysis

「現在の理解を保存して再分析」相当の操作を行う。

確認:
- 保存と再分析という内部2段階を意識させすぎないか
- 正常時に操作が自然か
- 再分析後に何が変わったか理解できるか

### B4. Current Analysis

以下を読む。

- 実現したい会社の未来
- 現在どこまで分かっているか
- 技術・運用・管理から見た確認ポイントと改善可能性
- まだ確認できていないこと
- 次に確認する価値があること

確認:
- 診断が「採点」に見えないか
- Surveyだけで問題確定しているように見えないか
- 技術 / 運用 / 管理が単独solutionカテゴリに見えないか
- UNKNOWNが欠陥や失敗に見えないか
- FACT Candidateが有料Assessmentの強制Scopeに見えないか
- AI/AUTOMATION interestからsolution recommendationしているように見えないか

### B5. Narrative layers

「分析から作成した文面」と「顧客向け文面」を確認する。

確認:
- 両者の役割が明確か
- Generated側を誤って編集しそうにならないか
- 顧客向け文面は必要な箇所だけHumanが直せそうか
- operatorがゼロからReport文章を書く負担に戻っていないか

### B6. Information density

3-column desktop UIを実際に操作し、情報量を評価する。

確認:
- 横に広すぎないか
- 縦スクロールが多すぎないか
- どこを見ればよいか迷わないか
- Current update → Analysis → Narrativeの順序が自然か

## C. Acceptance questions

Human Acceptanceでは最終的に次を判断する。

1. 実際の60分ヒアリングで使いたいと思えるか。
2. 顧客との会話より画面操作に意識を奪われないか。
3. Post-Hearing整理に、手作業のReport作成より明確な価値があるか。
4. ITの良し悪し採点ではなく「次に何を知る価値があるか」が出ているか。
5. Assessmentへ無理に誘導する圧力がないか。
6. 内部用語・開発者向け構造がoperator-facing UIへ漏れていないか。

## Human Acceptance output

結果は以下の形で記録する。

```
PACKAGE D HUMAN ACCEPTANCE: PASS | PASS WITH MINOR UX FIX | FAIL / UX FIX REQUIRED

Live Hearing:
- 良かった点:
- 気になった点:

Post-Hearing:
- 良かった点:
- 気になった点:

必須修正:
- なし / 内容

軽微修正:
- なし / 内容

Package Eへ進めるか:
- YES / NO
```

## STOP

Human Acceptance完了まで以下は禁止。

- Package E
- Migration 033 Production適用
- HA7
- deploy
- Production traffic
