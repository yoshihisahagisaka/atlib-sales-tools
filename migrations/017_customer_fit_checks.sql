-- IT経営KAIZEN 顧客適合性チェック（営業が無料診断を提案する前に使う適合性確認）の保存用テーブル。
-- 001_isms_diagnostic.sql / 004_free_hearing_assessments.sql の作法を踏襲（UUID PK + gen_random_uuid、
-- TIMESTAMPTZ、enumの代わりにCHECK）。pgcrypto は 001 で作成済みのため再作成しない。
--
-- 無料診断・設計Assessment・FACTACTとは連携しない（新規テーブルとして疎結合に実装。organizations等の
-- 既存テーブルは参照しない）。7項目それぞれについて FACT / UNKNOWN / 営業仮説 を列レベルで分離し、
-- 混同を構造で防ぐ。A/B/C/D（Human Decision）は自動算出せず、常に人が選択した値をそのまま保存する。
--
-- 項目マスタ（軸名・確認文・判定上の意味）は更新頻度が低いため、DBに持たず
-- src/domain/customerFitCheck.ts の定数として保持する。

CREATE TABLE customer_fit_checks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name           TEXT NOT NULL,                 -- 顧客名
  sales_rep_email         TEXT NOT NULL,                  -- 営業担当（staff認証のemail）
  checked_on              DATE NOT NULL,                  -- 確認日
  decision_maker_context  TEXT,                           -- 経営者／決裁者の状況
  engagement_context      TEXT,                           -- 接点・商談状況
  source_context          TEXT,                           -- 情報源・確認状況（例: 経営者1on1で本人確認）
  overall_facts           TEXT,                           -- 全体整理: 確認できたFACT
  overall_unknowns        TEXT,                           -- 全体整理: UNKNOWN
  overall_hypotheses      TEXT,                           -- 全体整理: 営業仮説（FACTと混ぜない）
  next_actions            TEXT,                           -- 次に確認すること
  human_decision          TEXT CHECK (human_decision IN ('A', 'B', 'C', 'D')), -- NULL = 未確定（下書き保存可）
  decision_reason         TEXT,                           -- 判断理由
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_fit_check_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id         UUID NOT NULL REFERENCES customer_fit_checks(id) ON DELETE CASCADE,
  item_no          SMALLINT NOT NULL CHECK (item_no BETWEEN 1 AND 7),
  answer           TEXT NOT NULL CHECK (answer IN ('YES', 'NO', 'UNKNOWN')),
  fact_note        TEXT,                                  -- 確認できたFACT
  unknown_note     TEXT,                                  -- UNKNOWN／追加確認
  hypothesis_note  TEXT,                                  -- 営業仮説・メモ（FACTと混ぜない）
  UNIQUE (check_id, item_no)
);

CREATE INDEX idx_customer_fit_checks_checked_on     ON customer_fit_checks(checked_on DESC);
CREATE INDEX idx_customer_fit_checks_human_decision ON customer_fit_checks(human_decision);
CREATE INDEX idx_customer_fit_check_items_check_id  ON customer_fit_check_items(check_id);
