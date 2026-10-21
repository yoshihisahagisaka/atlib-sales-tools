# プロトタイプ検証記録
確認日：2026-10-18（日本時間）。設計基準：PR #15 / 48ef973b749021ef314cbe01ac80b210a7dac3e4。

## 結果
|検証|結果|証跡|
|---|---|---|
|診断・契約・再現性|20 PASS / 0 FAIL / 0 SKIP|evidence/diagnosis-tests.tap|
|ブラウザ操作|16 PASS / 0 FAIL|evidence/browser-results.json|
|外部通信・例外|HTTP 0件 / pageerror 0件|同上。file://のローカル読み込みのみ|
|PDF|3類型ともA4・4ページ、6章/出典URL/件数/版を確認|evidence/pdf-results.json|
|PDF目視|3類型×4ページの描画を確認。重なり・切れ・空白ページなし|evidence/print-qa-contact.jpg|
|PC|1440×1050|evidence/desktop-start.png、desktop-question.png、desktop-report-overview.png|
|スマートフォン幅|390×844、320×760で横はみ出しなし|evidence/mobile-question.png、mobile-report-overview.png、mobile-workforce-report.png|

テスト環境：Windows上のNode.js組込テスト、既存ランタイムのPlaywright/Chromium、pypdf/Poppler。追加のCloud・DB・アプリ常駐サービスは使用しない。

## 正解との照合
- PR15の展開済み期待値をtest/fixtures/expected.jsonに固定し、7ケースのstatus、関連/候補/優先/表示上限外テーマ、根拠、UNKNOWN/担当外/N/A/非表示、チェックリスト、固定事故コンテンツ、次の行動、適用ruleIdを配列順込みで完全一致比較。
- F01外国人材、F02共同購買、F03会員管理は、PR15の完成本文を独立したMarkdown fixtureへ保存し、6章全文を完全一致比較。生成結果をそのまま正解にするスナップショット更新はしていない。
- F04 UNKNOWN中心は優先0件、F05整備済みとF07限定対象は追加確認0件、F06複数業務は優先3件＋表示上限外5件。
- その他：担当外とUNKNOWNの分離、未回答/不正/矛盾/非表示の入力拒否、B01適用範囲確認、T02の根拠統合、質問に応じたチェック項目の選択、Dependencyの非増殖、同じ回答の順序差/metadata差の正規化、ハッシュ再現、固定コンテンツ版、禁止API/永続保存がないことを検証。

## 操作の確認
実際の質問画面からF01相当の回答→戻る→再進行→完了を操作。結果から編集へ戻り、業務を外国人材から会員管理へ変更すると旧B01回答は破棄され、新B03が未回答になることを確認。C01の選択を一度空にした場合は全業務別回答を破棄し、B04も再回答を要求する。

教育・研修サンプルはMEMBERSHIP分岐を使用し9問。複数業務は11問。分からないのみの項目を対策不足へ変換しない。C03アカウントなし＋C05認証使用の矛盾は、完了を止め回答画面へ戻す。キーボードで開始・選択できる。

相談/所属企業案内は説明ダイアログのみで、入力フォームや送信はない。結果記録もローカル表示。オフラインでfile://を再読込して動作し、localStorage/sessionStorageは0件、回答は初期状態へ戻る。

## 印刷確認
ブラウザ印刷と同じ印刷CSSをChromiumのpage.pdfで検証用に保存。これはテストであり、製品に専用PDF生成基盤を実装したものではない。出典URL・公表日・対象件数の意味・固定コンテンツ版を紙面にも明示。書き込み欄と次の取り組みまで確認。

- [外国人材監理・支援のレポート](evidence/workforce-report.pdf)
- [共同購買のレポート](evidence/purchasing-report.pdf)
- [会員管理のレポート](evidence/membership-report.pdf)

実ブラウザの印刷ダイアログで保存先を選ぶ操作、物理プリンター、Safari、実機スマートフォンは未検証。環境のフォント・印刷設定で改ページは変わり得る。

## 既存回帰との区別
今回の変更対象はprototypes/pira-union-diagnosis-v2/のみ。既存アプリ・DB・共同購買・ルート・依存定義・CIは変更しない。PR15に記録されたCurrent Design v1 goldenの既存2件不一致（M04にM05が追加される差）は、本件で修正・期待値更新していない。既存全テストの再実行やProduction稼働確認を実施したとは扱わない。

## データ・表示の限界
固定事故情報は、前工程で一次出典を確認した3件のみ。警察庁資料の公表日は2026年3月までの精度で日付未確認を明示。2026年の最新統計を網羅したとは表示しない。公表統計から組合個別の被害率は算出しない。

KUの位置と教育型の扱いはREADMEの「今回の指示に合わせた表示上の整理」を参照。質問ID・回答ID・分岐・判定の意味はPR15から変更していない。
