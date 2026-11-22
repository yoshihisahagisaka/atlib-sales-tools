# IT経営KAIZEN 設計Assessment Phase D4 — Evidence Book Fit/Gap（最小実装判定）

Date: 2026-11-22
Status: **FIT/GAP DESIGN PROPOSAL — NO CODE IMPLEMENTATION AUTHORIZED**
Authority: git_KAIZEN docs/23, docs/77, docs/78, docs/87; D1 PR #79 HEAD `9493792615a3a5b55e818bffc33abd28aadef07a`, D2 PR #83 HEAD `39aa53c11e8ff6da752cf06a57e145ca726bc903`.
Scope: IT経営KAIZEN 設計Assessment（FACTACTのCoreデータは再実装しない）。

## 1. 現行実装の事実

- D1 `buildPaidAssessmentDeliverableProjection()` は、すべての人が記述したStatementについて `evidenceIndex: {statementId, kind, sources[]}[]` を返す。Sourceは `kind/id/version/hash?` の**参照情報**であり、Evidenceの実体やCoreの認証結果ではない。
- D1 `sections[].statements[]` にはSourceRefと種類付き`relatedRefs`が含まれ、元の分類と順序を保持する。参照を持たないUNKNOWNを自動的にFACTへ昇格しない。
- D2 `renderPaidAssessmentWordDraft()` はWord下書き末尾に「判断の根拠・参照一覧」を既に生成する。D1の全Statementを、本文のSectionに登場しないものも含めて出力する。Sourceのkind/id/versionを示し、hashやEvidence bytesを文書へ露出しない。
- D2のWord下書きは「内部確認用・未承認」であり、顧客へそのまま納品するものではない。
- Canonical docs/78のEvidence Bookは、実際の調査・分析（システム構成、資産・権限・費用、業務Flow、原資料等）の裏付けを必要に応じて含む**調査・分析編**であり、単なるEvidence参照ID一覧とは同一ではない。
- docs/87の初期FACTは既存FACTACT構造への検証・登録を前提とする。Evidence Book用に独自のFACT永続化や自動認証を作らない。

## 2. FIT / GAP / UNKNOWN

| 対象 | 判定 | 最小対応 |
|---|---|---|
| Reportの全Statementの根拠参照一覧 | FIT（D1 + D2） | D2の末尾のEvidence Indexを使用。D4用の同内容DOCXレンダラーは**作らない** |
| Sourceの種別・ID・Version、FACT/UNKNOWN分類 | FIT | D1の型とD2表示を再利用。出所ハッシュの顧客表示やCore認証の推定を行わない |
| Slidesから根拠を追うためのNotes | PLANNED（D3 Issue #85） | D1のSourceRefをそのままノートに載せる。追加の正本は作らない |
| 実資料・分析根拠・添付データを含むEvidence Book本体 | GAP / UNKNOWN | 今はD1/D2に入力がない。FACTACTが所有するEvidenceと人の調査結果の受け渡し契約を、E統合のFit/Gapで確認してから設計する |
| 顧客に何を開示するか、マスキングと編集履歴 | BUSINESS/OPERATION DECISION | Pilotで必要性と運用を確認。専用権限機構やCMSを先に実装しない |

## 3. 今回の決定候補（コード変更なし）

1. **D4a：Evidence Index** はD1/D2で実現済みとして再利用する。重複したレポート・テーブル・DB・Exportを実装しない。
2. **D4b：調査・分析編本体** は、必要な実資料とFACTACTの正式参照契約が揃うまで未着手。空の付録や、出所がない「確認済み事実」を生成しない。
3. 当面のPilotでは、Wordの参照一覧を使い、人が参照元の資料を確認できるかを検証する。資料の確認・入手ができない場合はUNKNOWNとして残す。外部納品の可否は別途Human Reviewを必要とする。
4. より詳細なEvidence Bookが実際の顧客案件で必要と判明したら、**元のEvidenceへのリンクまたは最小の参照用表形式**を優先する。D1のStatementやFACTACTのEvidenceをコピーして別の正本にしない。

## 4. D4受入チェック（内部Pilot）

- D1に供給したStatement数とD2末尾のEvidence Index件数が一致する。未配置Statementも失われない。
- 同一種類のSource kind/id/versionが一致する。UNKNOWNは「未確認」、Core由来を示す参照は**未認証のcaller assertion**として扱う。
- 重要な改善案からD1のtyped relatedRefsとSourceRefsへ戻れる。
- Customer-facing PDFを作る場合、内部コード・個人/機密データの開示を人が確認する。既存のWord/PDF承認ゲートを通す。
- Evidenceの実体・発言・観察・仮説を混同しない。添付資料がなくても「証拠を確認済み」と表示しない。

## 5. STOP / Next

- D2 PR #83の文字数上限修正・全回帰テストが完了していないため、D3実装開始はSTOP。
- 追加Evidence Bookレンダラーは、D1/D2と同じ一覧を再生成するだけなら作成禁止。
- 新しいFACTACT API/DB/Entityや承認状態を仮定してD4を実装しない。
- E統合では初めに「どの既存オブジェクトからSourceRefを解決できるか」を限定調査する。未認可のCore accessを追加しない。
- この文書は正本のEvidence Book完成、Pilot実施、顧客納品の証跡ではない。
