-- 情シス カイゼン診断（corporate-site LP `/joshisu-kaizen/` 向け）の回答保存用テーブル。
-- 004_free_hearing_assessments.sql と同一カラム構成・同一作法（UUID PK + gen_random_uuid、
-- TIMESTAMPTZ、CHECK制約、回答・スコアはsubmit時に計算してJSONBに凍結）。
-- pgcrypto は 001 で CREATE EXTENSION 済みのため再作成しない。
--
-- 入力は2入口（公開フォーム=見込み客自身 / 管理画面フォーム=スタッフ代理入力）だが書き込み先は
-- 本テーブル1つ。input_source で区別し、staff_email / source_ip / contact項目を出し分ける。
-- 結果表（結果シート・一覧・詳細）は /admin/ 配下でスタッフのみ閲覧する運用。
--
-- source 列は無料Gap診断（free_hearing_assessments）には無い追加カラム。流入経路が今後
-- LP以外にも増えることを見越して、集計用に文字列で持たせる（現状は 'joshisu-kaizen-lp' 固定）。

CREATE TABLE kaizen_diagnostics (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_source             TEXT NOT NULL CHECK (input_source IN ('staff', 'prospect')),
  source                   TEXT NOT NULL DEFAULT 'joshisu-kaizen-lp', -- 流入経路（将来的な複数LP対応用）
  company_name             TEXT NOT NULL,              -- 見込み客企業名（両入口で必須）
  contact_name             TEXT,                       -- 公開フォームで取得。スタッフ入力時は任意
  email                    TEXT,                       -- 同上
  phone                    TEXT,
  hearing_date             DATE,                       -- スタッフが商談日を設定。公開入力は NULL（created_at を実施日とみなす）
  staff_email              TEXT,                       -- input_source='staff' のとき req.staffEmail。公開入力は NULL
  source_ip                TEXT,                       -- input_source='prospect' のとき req.ip
  question_set_version     TEXT NOT NULL,
  answers                  JSONB NOT NULL,             -- 12問のQ&Aスナップショット（設問文・選択肢ラベル・素点・接続候補サービスタグまで凍結）
  scores                   JSONB NOT NULL,             -- {axisRaw:{...}, axisNormalized:{...}, unknownCount, visibilityGapFlag, securityUrgentFlag}
  suggested_services       JSONB NOT NULL,             -- [{id,label,hitCount}] タグ出現頻度の降順
  converted_to_assessment  BOOLEAN NOT NULL DEFAULT false,
  assessment_case_code     TEXT,                       -- 有償ITアセスメント案件コード（asmt+6桁連番）。現状は手動更新。
  review_status            TEXT NOT NULL DEFAULT 'new' CHECK (review_status IN ('new', 'contacted', 'closed')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kaizen_diagnostics_created_at    ON kaizen_diagnostics(created_at DESC);
CREATE INDEX idx_kaizen_diagnostics_review_status ON kaizen_diagnostics(review_status);
CREATE INDEX idx_kaizen_diagnostics_input_source   ON kaizen_diagnostics(input_source);
CREATE INDEX idx_kaizen_diagnostics_converted      ON kaizen_diagnostics(converted_to_assessment);
