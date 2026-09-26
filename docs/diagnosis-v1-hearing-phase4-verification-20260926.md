# 無料IT経営診断V1 — 専用ヒアリングUI Phase 4 検証記録

日付：2026-09-26
対象ブランチ：feat/free-diagnosis-sales-launch
追加テストコミット：2cbba02af04e3a1f56d71f6b9e320a30320a2e63

## 1. 位置づけ

本書は、既存の入力・分析・レポーティングDecisionを変更せず、専用ヒアリングUIのブラウザ検証結果を記録する。

Web事前回答とヒアリング記録は別々に保持する。事前回答がない場合も、正規の案件作成と顧客同意を経てヒアリングを開始できることを確認する。

## 2. 検証対象

既存実装：

- public/admin/it-management-diagnosis-hearing.html
- public/js/it-management-diagnosis-hearing.js
- public/admin/it-management-diagnosis-detail.html
- public/js/it-management-diagnosis-admin.js
- src/routes/diagnosisHearing.ts
- src/services/diagnosisHearingRepo.ts

ブラウザテスト：

- test/diagnosisHearing.browser.test.ts
- test/diagnosis-hearing.playwright.config.ts
- test/support/diagnosisHarness.ts

今回の追加変更は test/diagnosisHearing.browser.test.ts のみ。アプリ本体の変更はない。

## 3. ブラウザ検証結果

Playwright：8 PASS / 0 FAIL
Desktop：4 PASS
Mobile：4 PASS

確認したシナリオ：

1. 他の設問の未保存入力は、1設問を保存しても消えない。
2. 保存成功後の再取得失敗を保存失敗と表示しない。
3. 初回記録と訂正履歴を保持し、元のWeb回答を変更しない。
4. 事前Web回答なしでも案件概要からヒアリングを開始できる。

4番目のシナリオでは、営業会話を保存し、顧客同意を記録して案件を作成した。営業会話の事前回答は空とし、案件概要からヒアリング画面へ移動して初回記録を保存した。

API再取得で次を確認：

- originalResponses：0件
- hearing：1件
- 初回記録のversion：1
- 顧客発言原文と未確認事項：保存内容と一致

顧客同意を省略したSALES_VISIT案件の直接作成は、既存の業務ルールにより409で拒否される。テストを正規フローへ修正し、業務ルールは変更していない。

## 4. 静的検証

- npx.cmd tsc --noEmit：PASS
- git diff --check：PASS
- ブラウザテスト追加コミット：2cbba02

検証には使い捨てPGliteデータベースとローカルHTTPサーバーを使用した。

## 5. Phase 3からの進捗と未実施事項

Phase 3文書に記載された未実施事項のうち、次をPhase 4で検証した。

- 専用ヒアリングUIの画面動作
- Web事前回答あり／なしの両入口
- 初回記録・訂正履歴・元のWeb回答を分離した表示と保存
- 案件概要から専用ヒアリング画面への導線

引き続き未実施：

- Human Reviewから版管理レポート・PDFまでのE2E確認
- 明示的opt-inを要するAIライブテスト
- 本番migration、deploy、本番動作確認

Phase 4の検証完了は、無料IT経営診断V1全体の完成・本番公開を意味しない。

## 6. 作業境界

本検証では本番DB、本番環境、実顧客データを変更していない。push・deploy・本番migrationは実施していない。

未追跡のsrc/server.ts.backup-20260925-131908は既存の保護対象として維持し、変更・削除・stageしない。
