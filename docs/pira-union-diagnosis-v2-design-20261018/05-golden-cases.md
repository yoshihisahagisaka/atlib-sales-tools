# 05 完全一致検証仕様
本ファイルは実装前の期待値仕様。以下を実エンジンで実行したPASSではない。7ケースの意味結果と3完成本文を固定し、実装時はdeepStrictEqual相当で比較する。部分一致や「大体同じ文章」は不可。

## 共通値・展開規則
版はA=PIRA-A-2.0.0、R=PIRA-R-2.0.0、C=PIRA-C-20261018.1、N=PIRA-N-2.0.0、P=PIRA-P-2.0.0、renderer=PIRA-RENDER-DESIGN-0.1。
入力略記 R=ANSWERED/READY、P=ANSWERED/PARTIAL、D=ANSWERED/NOT_DONE、U=UNKNOWN、X=NOT_IN_POSITION_TO_ANSWER、S=SKIPPED_BY_BRANCH、NA(reason)=NOT_APPLICABLE。
C01/C02は明記した複数値。全ケース未記載キー・自由文はなし。B質問は表の通り全4枠を保持する。

|fixture|C01|C02|C03|C04|C05|C06|C07|B01|B02|B03|B04|
|---|---|---|---|---|---|---|---|---|---|---|---|
|F01 外国人材|WORKFORCE|IDENTITY,CASE_RECORD|P|D|R|R|U|D|S|S|R|
|F02 共同購買|PURCHASING|TRANSACTION|R|R|P|R|D|S|D|S|R|
|F03 会員管理|MEMBERSHIP|MEMBER_CONTACT|R|P|R|R|R|S|S|D|D|
|F04 UNKNOWN中心|WORKFORCE,PURCHASING,MEMBERSHIP|U|U|U|U|U|U|U|U|U|U|
|F05 整備済み自己申告|WORKFORCE,PURCHASING,MEMBERSHIP|IDENTITY,CASE_RECORD,MEMBER_CONTACT,TRANSACTION,OTHER_IMPORTANT|R|R|R|R|R|R|R|R|R|
|F06 複数業務・表示上限|WORKFORCE,PURCHASING,MEMBERSHIP|IDENTITY,CASE_RECORD,MEMBER_CONTACT,TRANSACTION|P|D|P|D|D|D|D|D|D|
|F07 追加確認なし・限定対象|MEMBERSHIP|MEMBER_CONTACT|NA(NO_BUSINESS_ACCOUNT)|R|NA(NO_REMOTE_ACCOUNT)|NA(NO_BUSINESS_PC)|NA(NO_IMPORTANT_DIGITAL_DATA)|S|S|R|R|

F07は紙の名簿と委託先による案内を使う架空事務局。IT全般の整備済み判定ではなく、対象外を区別して0件を返すケース。
F04はC01だけ既知で10項目が未確認。実際に旅券等を扱うと推定しない。

## 完全一致する主な配列・状態
配列順も完全一致。候補はT番号順、根拠は質問定義順。全ケースcontentCardIds=[S01,I01,I02]、nextActionIds=[SELF_REVIEW,OPTIONAL_CONSULTATION,OPTIONAL_MEMBER_INVITATION]。authorityは全7ケース[]、notApplicableはF07以外[]。
businessIds/informationIdsは上のANSWERED値を定義順でそのまま返し、C02=Uの場合informationIds=[]。currentStatesは上表の全active質問を対応する意味状態へ置換した配列。非表示SはcurrentStatesに含めずskippedQuestionIdsで保持する。

|fixture|status|candidateThemeIds|priorityThemeIds|deferredThemeIds|unknownQuestionIds|checklistIds|
|---|---|---|---|---|---|---|
|F01|ACTION_CONFIRMATION|T01,T02,T03|T01,T02,T03|[]|C07|K01,K02,K03,KU|
|F02|ACTION_CONFIRMATION|T04,T06,T07|T04,T06,T07|[]|[]|K04,K06,K07|
|F03|ACTION_CONFIRMATION|T02,T08|T02,T08|[]|[]|K02,K08|
|F04|CONFIRMATION_PENDING|[]|[]|[]|C02,C03,C04,C05,C06,C07,B01,B02,B03,B04|KU|
|F05|NO_ADDITIONAL_CONFIRMATION|[]|[]|[]|[]|K00|
|F06|ACTION_CONFIRMATION|T01,T02,T03,T04,T05,T06,T07,T08|T01,T02,T03|T04,T05,T06,T07,T08|[]|K01,K02,K03|
|F07|NO_ADDITIONAL_CONFIRMATION|[]|[]|[]|[]|K00|

relevanceThemeIdsも完全一致：
- F01=[T01,T02,T03,T04,T05,T08]。C07 UNKNOWNはT06関連性を作らない。
- F02=[T02,T03,T04,T05,T06,T07,T08]
- F03=[T02,T03,T04,T05,T06,T08]
- F04=[T01,T02,T07,T08]。WORKFORCE/MEMBERSHIP/PURCHASINGの関連だけで候補は作らない。
- F05/F06=[T01,T02,T03,T04,T05,T06,T07,T08]
- F07=[T02,T08]

themeEvidence（候補について全件）：
- F01={T01:[B01],T02:[C04],T03:[C03]}
- F02={T04:[C05],T06:[C07],T07:[B02]}
- F03={T02:[C04,B03],T08:[B04]}
- F04/F05/F07={}
- F06={T01:[B01],T02:[C04,B03],T03:[C03],T04:[C05],T05:[C06],T06:[C07],T07:[B02],T08:[B04]}
各根拠に対応するR-TxxをsourceRuleIdsへ1件付与する。
F07 notApplicableQuestionIds=[C03,C05,C06,C07]。
skippedQuestionIdsはF01=[B02,B03]、F02=[B01,B03]、F03/F07=[B01,B02]、F04/F05/F06=[]。

appliedRuleIdsの完全一致は固定順G01,G02,G03,G04,D01,REL01,R-T01..08,DEP01,DEP02,SEL01,KSEL01,H01..03のうち実際に出力を作るものだけ：
- 全正常ケース：G01,D01,REL01,SEL01,KSEL01
- G02：F01/F04のみ。G03：7ケースではなし。G04：SまたはN/AのあるF01/F02/F03/F07。
- R-Txx：candidateThemeIdsと1対1。DEP01：F03/F06。DEP02：F06のみ。
- H01：F05/F07。H02：F04。H03：F01/F02/F03/F06。
G01は正常な検証実行も監査記録する。失敗時はG01だけ、以降実行なし。

## 本文一致と再現性のテスト
- F01–F03は06文書の各サンプル全文を固定期待本文として保存。実装時は表示用装飾を除いたUTF-8本文とReportContent JSONの両方を完全一致比較する。空白/改行正規化の許容はLFだけ。
- F04はS4のH02固定文とKUだけ。F05/F07はH01固定文とK00だけ。F06はS3に表示上限外5テーマを明示しS4は3件、S5はK01/K02/K03だけ。
- 実装SHA未確定のため期待hash値を今作らない。将来のfixture JSONを確定した時点で正規化bytesと期待hashを固定し、自己計算したhashだけを正解にしない。
- C01/C02選択順を逆転しても正規化結果・意味JSON・本文hashが一致する。
- 回答revision metadataだけを変えても意味結果は同じ。inputHash対象にanswerRevisionを含めない（snapshot identityは別）。
- 同回答でR/C/N/P版のいずれかを変えるとexecutionKeyが変わる。旧snapshotの再表示は変化しない。
- PDFは意味本文と元ReportContent hashの一致を検証し、バイナリ完全一致は要求しない。

## 追加境界fixture（実装時必須）
1. F01のC07 U→X：unknown=[]、authority=[C07]、優先3とK01/K02/K03/KUは維持。UNKNOWNと担当外の文言は異なる。
2. C01 U、C02 U、C03..07 U：B01..04 S、候補[]、unknown=[C01..C07]、relevance=[]、KU、H02。
3. F03のC04 READY・B03 PARTIAL：T02根拠=[B03]、K02は差込テストだけ。外部送信手順不足を出さない。
4. F06のC03 READY：候補T01,T02,T04,T05,T06,T07,T08、優先T01,T02,T04、deferred T05..T08。DEP02なし。
5. C03 N/A＋C05 READY、NONEと他情報併記、UNKNOWN＋optionIds非空、未定義ID、重複値、無効branch回答、未回答完了はINVALID_INPUT、S1..S6を生成しない。
6. B01/B02非該当→業務追加でactive化した場合、未回答のまま完了不可。旧版を黙って再利用しない。
7. 全UNKNOWNから任意相談・商品推薦・事故確率を生成しない。相談同意のON/OFFは意味出力へ影響しない。
8. 細工したHTML/URL/超過サイズの持込snapshotは拒否または安全escape。固定版の出典URL以外をPDFへ外部読込しない。

## 展開済みの期待値（意味結果部分）
以下は上表を人手指定の期待値から展開した設計fixtureであり、診断ルールを実行して得た結果ではない。currentStates/businessIds/informationIdsと版metadataは冒頭の入力表・展開規則を併せて比較する。

```json
[
  {
    "fixture": "F01",
    "status": "ACTION_CONFIRMATION",
    "relevanceThemeIds": [
      "T01",
      "T02",
      "T03",
      "T04",
      "T05",
      "T08"
    ],
    "candidateThemeIds": [
      "T01",
      "T02",
      "T03"
    ],
    "priorityThemeIds": [
      "T01",
      "T02",
      "T03"
    ],
    "deferredThemeIds": [],
    "themeEvidence": {
      "T01": [
        "B01"
      ],
      "T02": [
        "C04"
      ],
      "T03": [
        "C03"
      ]
    },
    "unknownQuestionIds": [
      "C07"
    ],
    "authorityQuestionIds": [],
    "notApplicableQuestionIds": [],
    "skippedQuestionIds": [
      "B02",
      "B03"
    ],
    "checklistIds": [
      "K01",
      "K02",
      "K03",
      "KU"
    ],
    "contentCardIds": [
      "S01",
      "I01",
      "I02"
    ],
    "nextActionIds": [
      "SELF_REVIEW",
      "OPTIONAL_CONSULTATION",
      "OPTIONAL_MEMBER_INVITATION"
    ],
    "appliedRuleIds": [
      "G01",
      "G02",
      "G04",
      "D01",
      "REL01",
      "R-T01",
      "R-T02",
      "R-T03",
      "SEL01",
      "KSEL01",
      "H03"
    ]
  },
  {
    "fixture": "F02",
    "status": "ACTION_CONFIRMATION",
    "relevanceThemeIds": [
      "T02",
      "T03",
      "T04",
      "T05",
      "T06",
      "T07",
      "T08"
    ],
    "candidateThemeIds": [
      "T04",
      "T06",
      "T07"
    ],
    "priorityThemeIds": [
      "T04",
      "T06",
      "T07"
    ],
    "deferredThemeIds": [],
    "themeEvidence": {
      "T04": [
        "C05"
      ],
      "T06": [
        "C07"
      ],
      "T07": [
        "B02"
      ]
    },
    "unknownQuestionIds": [],
    "authorityQuestionIds": [],
    "notApplicableQuestionIds": [],
    "skippedQuestionIds": [
      "B01",
      "B03"
    ],
    "checklistIds": [
      "K04",
      "K06",
      "K07"
    ],
    "contentCardIds": [
      "S01",
      "I01",
      "I02"
    ],
    "nextActionIds": [
      "SELF_REVIEW",
      "OPTIONAL_CONSULTATION",
      "OPTIONAL_MEMBER_INVITATION"
    ],
    "appliedRuleIds": [
      "G01",
      "G04",
      "D01",
      "REL01",
      "R-T04",
      "R-T06",
      "R-T07",
      "SEL01",
      "KSEL01",
      "H03"
    ]
  },
  {
    "fixture": "F03",
    "status": "ACTION_CONFIRMATION",
    "relevanceThemeIds": [
      "T02",
      "T03",
      "T04",
      "T05",
      "T06",
      "T08"
    ],
    "candidateThemeIds": [
      "T02",
      "T08"
    ],
    "priorityThemeIds": [
      "T02",
      "T08"
    ],
    "deferredThemeIds": [],
    "themeEvidence": {
      "T02": [
        "C04",
        "B03"
      ],
      "T08": [
        "B04"
      ]
    },
    "unknownQuestionIds": [],
    "authorityQuestionIds": [],
    "notApplicableQuestionIds": [],
    "skippedQuestionIds": [
      "B01",
      "B02"
    ],
    "checklistIds": [
      "K02",
      "K08"
    ],
    "contentCardIds": [
      "S01",
      "I01",
      "I02"
    ],
    "nextActionIds": [
      "SELF_REVIEW",
      "OPTIONAL_CONSULTATION",
      "OPTIONAL_MEMBER_INVITATION"
    ],
    "appliedRuleIds": [
      "G01",
      "G04",
      "D01",
      "REL01",
      "R-T02",
      "R-T08",
      "DEP01",
      "SEL01",
      "KSEL01",
      "H03"
    ]
  },
  {
    "fixture": "F04",
    "status": "CONFIRMATION_PENDING",
    "relevanceThemeIds": [
      "T01",
      "T02",
      "T07",
      "T08"
    ],
    "candidateThemeIds": [],
    "priorityThemeIds": [],
    "deferredThemeIds": [],
    "themeEvidence": {},
    "unknownQuestionIds": [
      "C02",
      "C03",
      "C04",
      "C05",
      "C06",
      "C07",
      "B01",
      "B02",
      "B03",
      "B04"
    ],
    "authorityQuestionIds": [],
    "notApplicableQuestionIds": [],
    "skippedQuestionIds": [],
    "checklistIds": [
      "KU"
    ],
    "contentCardIds": [
      "S01",
      "I01",
      "I02"
    ],
    "nextActionIds": [
      "SELF_REVIEW",
      "OPTIONAL_CONSULTATION",
      "OPTIONAL_MEMBER_INVITATION"
    ],
    "appliedRuleIds": [
      "G01",
      "G02",
      "D01",
      "REL01",
      "SEL01",
      "KSEL01",
      "H02"
    ]
  },
  {
    "fixture": "F05",
    "status": "NO_ADDITIONAL_CONFIRMATION",
    "relevanceThemeIds": [
      "T01",
      "T02",
      "T03",
      "T04",
      "T05",
      "T06",
      "T07",
      "T08"
    ],
    "candidateThemeIds": [],
    "priorityThemeIds": [],
    "deferredThemeIds": [],
    "themeEvidence": {},
    "unknownQuestionIds": [],
    "authorityQuestionIds": [],
    "notApplicableQuestionIds": [],
    "skippedQuestionIds": [],
    "checklistIds": [
      "K00"
    ],
    "contentCardIds": [
      "S01",
      "I01",
      "I02"
    ],
    "nextActionIds": [
      "SELF_REVIEW",
      "OPTIONAL_CONSULTATION",
      "OPTIONAL_MEMBER_INVITATION"
    ],
    "appliedRuleIds": [
      "G01",
      "D01",
      "REL01",
      "SEL01",
      "KSEL01",
      "H01"
    ]
  },
  {
    "fixture": "F06",
    "status": "ACTION_CONFIRMATION",
    "relevanceThemeIds": [
      "T01",
      "T02",
      "T03",
      "T04",
      "T05",
      "T06",
      "T07",
      "T08"
    ],
    "candidateThemeIds": [
      "T01",
      "T02",
      "T03",
      "T04",
      "T05",
      "T06",
      "T07",
      "T08"
    ],
    "priorityThemeIds": [
      "T01",
      "T02",
      "T03"
    ],
    "deferredThemeIds": [
      "T04",
      "T05",
      "T06",
      "T07",
      "T08"
    ],
    "themeEvidence": {
      "T01": [
        "B01"
      ],
      "T02": [
        "C04",
        "B03"
      ],
      "T03": [
        "C03"
      ],
      "T04": [
        "C05"
      ],
      "T05": [
        "C06"
      ],
      "T06": [
        "C07"
      ],
      "T07": [
        "B02"
      ],
      "T08": [
        "B04"
      ]
    },
    "unknownQuestionIds": [],
    "authorityQuestionIds": [],
    "notApplicableQuestionIds": [],
    "skippedQuestionIds": [],
    "checklistIds": [
      "K01",
      "K02",
      "K03"
    ],
    "contentCardIds": [
      "S01",
      "I01",
      "I02"
    ],
    "nextActionIds": [
      "SELF_REVIEW",
      "OPTIONAL_CONSULTATION",
      "OPTIONAL_MEMBER_INVITATION"
    ],
    "appliedRuleIds": [
      "G01",
      "D01",
      "REL01",
      "R-T01",
      "R-T02",
      "R-T03",
      "R-T04",
      "R-T05",
      "R-T06",
      "R-T07",
      "R-T08",
      "DEP01",
      "DEP02",
      "SEL01",
      "KSEL01",
      "H03"
    ]
  },
  {
    "fixture": "F07",
    "status": "NO_ADDITIONAL_CONFIRMATION",
    "relevanceThemeIds": [
      "T02",
      "T08"
    ],
    "candidateThemeIds": [],
    "priorityThemeIds": [],
    "deferredThemeIds": [],
    "themeEvidence": {},
    "unknownQuestionIds": [],
    "authorityQuestionIds": [],
    "notApplicableQuestionIds": [
      "C03",
      "C05",
      "C06",
      "C07"
    ],
    "skippedQuestionIds": [
      "B01",
      "B02"
    ],
    "checklistIds": [
      "K00"
    ],
    "contentCardIds": [
      "S01",
      "I01",
      "I02"
    ],
    "nextActionIds": [
      "SELF_REVIEW",
      "OPTIONAL_CONSULTATION",
      "OPTIONAL_MEMBER_INVITATION"
    ],
    "appliedRuleIds": [
      "G01",
      "G04",
      "D01",
      "REL01",
      "SEL01",
      "KSEL01",
      "H01"
    ]
  }
]
```
