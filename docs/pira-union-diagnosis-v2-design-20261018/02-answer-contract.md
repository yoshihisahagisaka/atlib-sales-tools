# 02 Answer Contract
提案版：PIRA-A-2.0.0。全問選択式。自由記述、個人名、旅券番号、口座番号、会社名簿、証憑ファイルを収集しない。7＋最大4問は初期案であり、時間5–10分の達成は未検証。

## Envelope
診断全体：definitionId=PIRA_UNION_SELF_CHECK、answerContractVersion=PIRA-A-2.0.0、answerRevision=1以上、entryChannel=SELFまたはPROXY、respondentRole=OFFICE/EXECUTIVE/IT_SUPPORT/OTHER/UNKNOWN、answers配列。
各回答：questionId、responseState、optionIds、notApplicableReason。optionIdsは単一選択も配列。
- ANSWERED：定義内の非特殊選択肢のみ。単一は1個、複数は表の上限内。
- UNKNOWN：「分からない」。optionIds=[]。一部不明を既知と同時選択させず、把握できる範囲で後日新revisionへ。
- NOT_IN_POSITION_TO_ANSWER：「自分の担当ではなく回答できない」。optionIds=[]。UNKNOWNと別の確認先一覧へ。
- NOT_APPLICABLE：「該当しない」。optionIds=[]、表に指定のreason必須。対策済みと同義にしない。
- SKIPPED_BY_BRANCH：サーバ/描画内部生成のみ。非表示の業務質問。利用者入力を拒否。UNKNOWNやN/Aと区別する。
未回答はdraftのみ許可。完了時は全active質問にいずれかの状態必須。未定義ID、重複ID、未知選択肢、単一の複数値、排他違反、任意の追加キーは拒否する。UNKNOWN/N/Aを選択肢の数値へ変換しない。

## 共通7問
|ID・型|利用者向け質問|選択肢ID＝表示文|UNKNOWN/権限外|N/A|
|---|---|---|---|---|
|C01 複数1..4|事務局が現在行っている業務を選んでください|WORKFORCE＝外国人材の監理・支援 / PURCHASING＝共同購買・契約請求 / MEMBERSHIP＝会員管理・会報や研修案内 / OTHER＝その他の事務局業務|可/可|不可|
|C02 複数1..6|現在扱っている情報の種類を選んでください。実物の入力は不要です|IDENTITY＝旅券・在留資格等の本人確認情報 / CASE_RECORD＝面談・訪問・相談記録 / MEMBER_CONTACT＝会員の担当者・連絡先 / TRANSACTION＝契約・請求・取引情報 / OTHER_IMPORTANT＝その他の重要情報 / NONE＝いずれも扱っていない|可/可|不可。NONEは他と排他|
|C03 単一|退職・異動した人の業務アカウント権限を解除する手順はありますか|READY＝対象と担当を決め運用 / PARTIAL＝一部だけ運用 / NOT_DONE＝手順を設けていない|可/可|NO_BUSINESS_ACCOUNT＝業務アカウントなし|
|C04 単一|重要情報を外部へ送る前に、宛先と送信する内容を確認する手順を運用していますか|READY / PARTIAL / NOT_DONE（表示は対象確認手順に合わせる）|可/可|NO_EXTERNAL_TRANSFER＝重要情報を外部へ送らない|
|C05 単一|外部から利用できる業務アカウントで、多要素認証を使っていますか|READY＝対象で使用 / PARTIAL＝一部対象のみ / NOT_DONE＝使用していない|可/可|NO_REMOTE_ACCOUNT＝外部利用アカウントなし|
|C06 単一|業務で使うパソコンのOS更新を行う担当と手順を決め、更新していますか|READY＝決めて更新 / PARTIAL＝一部のみ / NOT_DONE＝決めていない|可/可|NO_BUSINESS_PC＝業務用パソコンなし|
|C07 単一|重要な電子データをバックアップから戻せるか、復元確認をしていますか|READY＝対象を決め復元確認済み / PARTIAL＝一部のみ確認 / NOT_DONE＝復元確認していない|可/可|NO_IMPORTANT_DIGITAL_DATA＝重要な電子データなし|

C03は退職異動の権限解除、C05は多要素認証、C06はPCのOS更新、C07は復元確認だけを扱う。パスワード、ウイルス対策、暗号化、バックアップの隔離、VPN、紙の保管などを同時に評価しない。C07=NOT_DONEから「バックアップなし」とは言わない。C06=READYから「全端末安全」とは言わない。

## 業務別 最大4問（複数業務でも合計上限4）
|ID・分岐|質問|単一選択|N/A|
|---|---|---|---|
|B01 C01にWORKFORCE|監理・支援に伴う本人確認資料や相談記録について、保管期限を決め、期限後の処理を行っていますか|READY＝期限と処理を決め運用 / PARTIAL＝一部のみ / NOT_DONE＝期限後処理を決めていない|NO_WORKFORCE_RECORD＝該当する資料・記録なし|
|B02 C01にPURCHASING|振込先変更の依頼を受けたとき、依頼メール等とは別の既知の連絡先で確認する手順はありますか|READY＝別経路確認を運用 / PARTIAL＝一部のみ / NOT_DONE＝手順なし|NO_BANK_TRANSFER＝振込を扱わない|
|B03 C01にMEMBERSHIP|会員向け一斉案内で、送信前にテスト送信し宛名差込と配布対象を確認していますか|READY＝テストで確認 / PARTIAL＝一部のみ / NOT_DONE＝実施していない|NO_BULK_NOTICE＝一斉案内をしない|
|B04 C01がANSWEREDで1業務以上|情報の誤送信・不審アクセス・端末紛失を見つけたとき、最初の連絡先を決めていますか|READY＝連絡先を決め周知 / PARTIAL＝一部のみ / NOT_DONE＝決めていない|不可（稼働中の事務局を対象）|

B01–B04ともUNKNOWNとNOT_IN_POSITION_TO_ANSWER可。WORKFORCE/PURCHASING/MEMBERSHIPの3問＋B04で最大4。OTHERだけならB04のみ。C01がUNKNOWN/権限外ならB01–B04は非表示、業務未確認として扱う。分岐を変えた場合、旧branch回答を現在入力から除外してSKIPPEDへ置換する。旧revisionは残す。

## 整合・誤判定防止
- C03=N/A(NO_BUSINESS_ACCOUNT)かつC05=ANSWEREDは矛盾：完了を止め利用者に確認する。NO_REMOTE_ACCOUNTとの併用は可。
- B01=N/AかつC02がIDENTITYまたはCASE_RECORDを含む場合、その情報が監理支援由来かは自動推測しない。「別業務由来／回答を見直す」の確認を求める。別業務由来は追加診断問にせず整合確認reason=OTHER_WORKFLOWとして記録。解消まで完了不可。
- C02=NONEと他の情報種類の混在は拒否。NONEと外部送信/復元のREADY等の回答は、情報の対象を再確認し矛盾解消まで完了不可。
- 休止中の事務局を診断対象にする場合は別途契約を拡張する。本版ではB04=N/Aを拒否する。
- N/Aは本人の適用範囲申告であり、業務実態の証明ではない。理由の妥当性をAIで判定しない。
- 11問では情報管理全般を網羅しない。紙、委託先、国外共有、持出端末、クラウド詳細等は本診断の評価範囲外。チェックリスト内でも対策不足と断定しない。

## 正規化・再現性
質問はC01..C07,B01..B04固定順。複数回答は選択肢定義順へ並べ替え、重複は拒否。文字コードUTF-8、IDはASCII、自由文なし、時刻はUTC ISO8601をmetadataだけに保持。意味入力は回答と契約版のみ。日時・UUID・組合名・流入元・相談同意・価格・注文履歴をルール入力にしない。
完了snapshotは変更不可。訂正は新answerRevisionにする。同じ意味入力とルール/コンテンツ/表示版は、同じ結果JSON・本文になる。PDFバイナリは作成時刻/フォント等により一致しない可能性があるので、本文正本hashとPDFbytes hashを別に記録する。
