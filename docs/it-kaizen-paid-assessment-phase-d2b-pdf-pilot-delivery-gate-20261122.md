# IT経営KAIZEN 設計Assessment Phase D2b — Word正本からのPDF納品・Human Review（Pilot最小構成）

Date: 2026-11-22
Status: **PROPOSAL FOR INTERNAL PILOT / NO CUSTOMER RELEASE AUTHORIZATION**
Authority: git_KAIZEN docs/23, docs/77, docs/78, docs/75（Pilot提案のみ）
Prerequisite: Phase D1 PR #79, Phase D2 PR #83（文字数上限の修正および再検証が完了すること）
Owner: IT経営KAIZEN Business / Application Lane

## 0. 設計原則と目的

システムの機能を増やすことではなく、コンサルタントが経営判断に必要な改善計画書を簡単かつ確実に作成し、内容を人が確認して納品できることを目的とする。Canon: Word型詳細レポートを正本とし、PDFを顧客納品用とする。SlidesとEvidence Bookは同じD1文脈から作成し、独立に結論を生成しない。

D2の `renderPaidAssessmentWordDraft(input)` は **内部確認用・未承認のDOCXだけ** を返す。この状態を自動的に顧客納品可能に昇格しない。D1 `readiness` は構造的レビュー状態であり、人間の承認・FACTACT Coreによる認証・顧客のDecisionではない。

## 1. Fit / Gap（2026-11-22 Git現行照合）

- FIT: D1の読み取り専用Projection、出所・種類付き参照・reviewReasons、D2の実体DOCX生成。
- PARTIAL FIT: 既存無料診断の `diagnosisReportRepo.ts` にはHuman approve/deliverがある。ただし**無料診断の案件・版・DB状態専用**であり、有料Assessmentへそのまま接続できる承認レコードではない。原則の参考のみ。
- NOT FIT: `freeDiagnosisDesignV2ReportPdf.ts` はPlaywrightで**HTML→PDF**。Word DOCX→PDFではない。DOCXと別テンプレートを実装すると内容・改ページ・結論の二重管理になる。
- GAP: DOCX→PDFの安全で再現性ある変換と、顧客へ出す前の人による最終確認・納品記録。現段階でサーバー上のOffice/LibreOffice、専用変換API、承認DB、配信APIを追加する根拠はない。

## 2. D2b Pilot採用案（コード追加なし）

1. コンサルタントがD1の人が執筆したSections / Statements / SourceRefsを用意し、D2で内部確認DOCXを生成する。
2. `readiness` と `reviewReasons` を確認する。 `BLOCKED_BY_EVIDENCE` / `NEEDS_CONFIRMATION` はそのまま顧客納品へ進めない。 `REVIEWABLE_DRAFT` も**未承認**である。
3. 人が内容・出所・読みやすさ・表現・経営判断材料を点検し、不足があれば**D1入力を修正してD2を再生成**する。Wordだけで実質的な結論やFACTを書き換えない。
4. 内容確認済みの版から**顧客納品用の別コピー**を作る。内部レビュー状態・理由コード・追跡用の内部注記・「内部確認用・未承認」などを除き、顧客向けに必要な説明・出所の意味を残す。本文の実質変更は禁止し、必要なら3へ戻る。
5. Microsoft Wordの通常のPDF出力機能で、その顧客納品用コピーをPDFにする。外部の変換サービスへ顧客資料をアップロードしない。新しいサーバー変換バイナリは導入しない。
6. 人が**実際のPDF**を開き、体裁、ページ欠落、文字化け、内部ラベル露出、顧客名、判断候補の未承認表示、Expected/Actualの区別、出所の整合性を最終確認する。
7. 確認者が既存の社内案件管理手段へ、報告ID、版、確認者、確認日時、承認したPDFの特定情報、顧客への提出状況を記録する。**D1/D2/FACTACTへ承認権限やDecision Recordを偽装して書き込まない**。
8. 権限を持つ人が顧客へPDFを提出する。修正が必要になったら3へ戻って再承認する。Slides/D4 Evidence Bookを別内容で上書きしない。

このPilotは**運用提案**であり、本ドキュメントやD2の `REVIEWABLE_DRAFT` だけで納品を許可するものではない。

## 3. 実装禁止・再利用境界

- 新しい有料Assessment承認DB、状態機械、CMS、Document Service、汎用ワークフロー、顧客向け配信API、OfficeサーバーをD2bとして追加しない。
- 既存無料診断の承認・PDFサービスを改造しない。将来E統合で再利用可能性を改めてFit/Gapする。
- FACTACT CoreのEvidence / FACT / Decision / Work / Authorityを複製しない。
- `renderPaidAssessmentWordDraft()` の `INTERNAL_REVIEW_DRAFT` を顧客承認と解釈しない。レンダラーに `approved=true` のような自己申告引数を足して警告表示を解除しない。
- PDF出力のためだけにHTML版やSlides版へ別々の結論を執筆しない。
- AIが文言を追加、事実を認定、優先順位を決定、承認を代理しない。

## 4. Pilot受入条件（実ファイルの人手確認）

- Word出力とPDFの本文・図表・見出しの意味が一致する。
- 顧客に読みやすい日本語。説明を聞かなくても、FACT / UNKNOWN / 仮説 / 提案 / 判断候補 / 期待する変化を区別できる。
- 根拠と改善案のつながりを追跡できる。Evidenceがない箇所を事実として断定しない。
- PDFに `内部確認用・未承認`、`UPSTREAM_*` / `NO_SECTIONS` 等の内部コードや機密情報・無用な内部追跡注記が残っていない。
- 顧客のHuman Decision Recordが未成立なら、判断候補を承認済みと表示しない。
- PDFに欠落、重なり、文字化け、予期しない改ページがない。日本語フォントを確認する。
- 確認者・対象版・PDFの特定情報・提出状況を既存の社内管理で追える。
- D1/D2は変更せず、外部送信も自動化しない。Pilotで負荷とミス発生頻度を測る。

## 5. 次に判断する事項（根拠があるときだけ）

1. Pilotの実務工数・再編集回数・Word→PDFの問題を記録する。
2. 手作業変換が負荷または品質リスクと実測された場合に限り、**同じ承認済みWord内容をPDF化できる**既存実装・外部依存・OS実行環境を限定調査し、最小実装候補を比較する。
3. 自動変換する場合も、D2 Draftと顧客納品物を同一の承認済みスナップショットへ紐づけるコードレベル契約をこちらで確定させる。Codexへ設計判断を委任しない。
4. D3 Slides、D4 Evidence BookはD1共通Projectionに準拠させる。実装着手はそれぞれ独立Issue / code-level specで管理する。

## 6. STOP条件

D2修正・回帰テスト未完、根拠の不足、顧客向け情報分類の矛盾、内部レビュー注記の残存、WordとPDFの内容差、承認者不明、承認版の追跡不能、追加システムが必要との根拠不在。この段階でMerge、Migration、GCP、Production、顧客納品の自動化を承認しない。
