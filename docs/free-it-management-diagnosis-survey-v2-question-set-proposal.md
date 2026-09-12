# 無料 IT経営診断 Survey v2 Question Set — SSOT追加文書案

Status: **PROPOSED IMPLEMENTATION REFERENCE — SSOT登録前**

本書は`git_KAIZEN`へ追加するための質問定義一覧であり、現時点で新たなBusiness Canonicalとして承認済みであることを意味しない。今回、`git_KAIZEN`のファイルは変更していない。

追加先候補：`git_KAIZEN/docs/26-free-it-management-diagnosis-survey-v2-question-set-v1.md`。採番・登録はSSOT側で確認する。追加する内容は下記の既存質問定義と意味境界だけであり、質問・選択肢・事業メッセージ・価格の変更は提案しない。

## 根拠・版管理

- 上位Canonical：`docs/17-it-management-kaizen-business-service-canonical-v1.md`「現在の質問構成（v2）」、文書23〜25。
- 転記元：`atlib-sales-tools/src/domain/itManagementDiagnosis.ts`の`SURVEY_QUESTIONS`。
- 質問文・選択肢はレビュー対象commit `e7ccbd6f75fe2c09ffcae4aefabf58ddb7dc2d25`の既存実装から変更しない。Survey versionのみ`2`へ整合する。
- 文書ファイル名末尾の`v1`は文書の版。質問セットの`survey_version`と各質問の`version`はすべて`2`。
- Q01〜Q09は必須、Q10は任意。すべてactive。表示順・stable question code・質問文・answer type・選択肢の順序を以下に固定する。

## 回答表現と意味境界

- `SINGLE_SELECT`：選択肢文字列1件。`MULTI_SELECT`：選択肢文字列の配列。選択肢文字列が保存値も兼ねる。
- `TEXT`：自由記述文字列（現行実装は上限4000文字）。`options_json: null`は選択肢なし。
- `is_required: true`は完了時に回答が必要、`false`は任意。途中保存時は空文字列／空配列へ変更できる。
- 「分からない」は通常の有効な選択肢。補完・採点・企業実態の断定を行わない。
- Raw SurveyResponseとして保存する。Q01からFutureを生成するのはComplete時のみで、`SURVEY_STATED`として元回答を参照する。
- 下記のJSONはレビュー可能な質問定義の転記。Golden Testで実装定義との完全一致を確認する。

## 正式質問文・選択肢の転記一覧


```json
{
  "survey_version": 2,
  "questions": [
    {
      "question_code": "Q01_FUTURE",
      "version": 2,
      "display_order": 1,
      "question_text": "今後1〜3年で、どのような会社の未来を実現したいですか？",
      "answer_type": "MULTI_SELECT",
      "options_json": [
        "売上・事業を成長させたい",
        "社員が本来の仕事に集中できる会社にしたい",
        "少人数でも無理なく事業を続けられる会社にしたい",
        "新しい事業や働き方に挑戦したい",
        "安心して事業を続けられる会社にしたい",
        "その他",
        "分からない"
      ],
      "is_required": true,
      "is_active": true
    },
    {
      "question_code": "Q02_IT_EXPECTATION",
      "version": 2,
      "display_order": 2,
      "question_text": "その未来のために、ITへどのようなことを期待していますか？",
      "answer_type": "MULTI_SELECT",
      "options_json": [
        "仕事の手間を減らすこと",
        "新しい事業・サービスを支えること",
        "経営判断に必要な情報を届けること",
        "安心して仕事を続けられること",
        "社員が働きやすくなること",
        "その他",
        "分からない"
      ],
      "is_required": true,
      "is_active": true
    },
    {
      "question_code": "Q03_IT_PLANNING",
      "version": 2,
      "display_order": 3,
      "question_text": "現在、ITの計画や改善をどのように進めていますか？",
      "answer_type": "SINGLE_SELECT",
      "options_json": [
        "会社の未来とつなげた計画で進めている",
        "個別の計画や課題に沿って進めている",
        "困りごとが起きたときに対応している",
        "進めたいが着手できていない",
        "分からない"
      ],
      "is_required": true,
      "is_active": true
    },
    {
      "question_code": "Q04_IT_VISIBILITY",
      "version": 2,
      "display_order": 4,
      "question_text": "社内のIT環境を、どの程度把握できていますか？",
      "answer_type": "SINGLE_SELECT",
      "options_json": [
        "IT環境は完全に把握できている",
        "おおむね把握できている",
        "一部は把握できている",
        "担当者に確認しないと分からない",
        "分からない"
      ],
      "is_required": true,
      "is_active": true
    },
    {
      "question_code": "Q05_DAILY_IT_OPERATION",
      "version": 2,
      "display_order": 5,
      "question_text": "日々のIT業務で、当てはまる状態を教えてください。",
      "answer_type": "MULTI_SELECT",
      "options_json": [
        "手作業や繰り返しの作業が多い",
        "特定の人に確認しないと進められない仕事がある",
        "問い合わせやトラブル対応に時間がかかる",
        "手順と実際の仕事が合っていないことがある",
        "改善に取り組む時間を取りにくい",
        "特に気になることはない",
        "分からない"
      ],
      "is_required": true,
      "is_active": true
    },
    {
      "question_code": "Q06_SECURITY_RISK",
      "version": 2,
      "display_order": 6,
      "question_text": "セキュリティやITのリスクを、経営として把握できていますか？",
      "answer_type": "SINGLE_SELECT",
      "options_json": [
        "事業への影響を含めて把握している",
        "報告は受けているが事業への影響までは分からない",
        "担当者に任せている",
        "把握する機会がない",
        "分からない"
      ],
      "is_required": true,
      "is_active": true
    },
    {
      "question_code": "Q07_AUTHORITY_RESPONSIBILITY",
      "version": 2,
      "display_order": 7,
      "question_text": "ITについて、誰が判断し責任を持っていますか？",
      "answer_type": "SINGLE_SELECT",
      "options_json": [
        "経営者・役員が判断している",
        "権限を持つ社内担当者が判断している",
        "内容によって判断する人が異なる",
        "外部の支援先と相談して判断している",
        "明確に決まっていない",
        "分からない"
      ],
      "is_required": true,
      "is_active": true
    },
    {
      "question_code": "Q08_MANAGEMENT_INFORMATION",
      "version": 2,
      "display_order": 8,
      "question_text": "ITの情報は、経営判断に使える形で届いていますか？",
      "answer_type": "SINGLE_SELECT",
      "options_json": [
        "経営判断に使える形で届いている",
        "報告はあるが判断に使いにくい",
        "必要なときに担当者へ確認している",
        "経営への報告はない",
        "分からない"
      ],
      "is_required": true,
      "is_active": true
    },
    {
      "question_code": "Q09_IT_ORGANIZATION",
      "version": 2,
      "display_order": 9,
      "question_text": "現在のIT体制を教えてください。",
      "answer_type": "MULTI_SELECT",
      "options_json": [
        "専任の社内担当者がいる",
        "他の仕事と兼任する社内担当者がいる",
        "経営者が対応している",
        "外部の支援先が対応している",
        "担当者が決まっていない",
        "分からない"
      ],
      "is_required": true,
      "is_active": true
    },
    {
      "question_code": "Q10_FREE_COMMENT",
      "version": 2,
      "display_order": 10,
      "question_text": "ITについて特に気になることがあれば教えてください。（任意）",
      "answer_type": "TEXT",
      "options_json": null,
      "is_required": false,
      "is_active": true
    }
  ]
}
```
