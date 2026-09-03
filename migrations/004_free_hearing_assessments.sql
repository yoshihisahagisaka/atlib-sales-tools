-- 無料Gap診断（無料ヒアリング診断）の回答保存用テーブル。
-- 001_isms_diagnostic.sql の作法を踏襲（UUID PK + gen_random_uuid、TIMESTAMPTZ、enumの代わりにCHECK、
-- 回答・スコアは submit 時に計算して JSONB に凍結し質問文・選択肢ラベルまでスナップショット）。
-- pgcrypto は 001 で CREATE EXTENSION 済みのため再作成しない。
--
-- 入力は2入口（公開フォーム=見込み客自身 / 管理画面フォーム=スタッフ代理入力）だが書き込み先は本テーブル1つ。
-- input_source で区別し、staff_email / source_ip / contact項目を出し分ける。
-- 結果表（結果シート・一覧・詳細）は /admin/ 配下でスタッフのみ閲覧する運用。

CREATE TABLE free_hearing_assessments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_source             TEXT NOT NULL CHECK (input_source IN ('staff', 'prospect')),
  company_name             TEXT NOT NULL,              -- 見込み客企業名（両入口で必須）
  contact_name             TEXT,                       -- 公開フォームで取得。スタッフ入力時は任意
  email                    TEXT,                       -- 同上
  phone                    TEXT,
  hearing_date             DATE,                       -- スタッフが商談日を設定。公開入力は NULL（created_at を実施日とみなす）
  staff_email              TEXT,                       -- input_source='staff' のとき req.staffEmail。公開入力は NULL
  source_ip                TEXT,                       -- input_source='prospect' のとき req.ip
  question_set_version     TEXT NOT NULL,
  answers                  JSONB NOT NULL,             -- 19問のQ&Aスナップショット（会話prompt・選択肢ラベル・素点・接続候補サービスタグまで凍結）
  scores                   JSONB NOT NULL,             -- {axisRaw:{...}, axisNormalized:{...}, unknownCount, visibilityGapFlag, securityUrgentFlag}
  suggested_services       JSONB NOT NULL,             -- [{id,label,hitCount}] タグ出現頻度の降順
  report_path              TEXT,                       -- 当初指示書6章のデータモデル準拠。結果シートはクライアント生成DLのため通常NULL（予約列）
  converted_to_assessment  BOOLEAN NOT NULL DEFAULT false,
  assessment_case_code     TEXT,                       -- 有償ITアセスメント案件コード（asmt+6桁連番）。
                                                       -- IT_アセスメント_SensorEdge流用_設計指示書.md 入手後に書式・採番ルールを突合すること（現状は手動更新）。
  review_status            TEXT NOT NULL DEFAULT 'new' CHECK (review_status IN ('new', 'contacted', 'closed')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_free_hearing_assessments_created_at    ON free_hearing_assessments(created_at DESC);
CREATE INDEX idx_free_hearing_assessments_review_status ON free_hearing_assessments(review_status);
CREATE INDEX idx_free_hearing_assessments_input_source  ON free_hearing_assessments(input_source);
CREATE INDEX idx_free_hearing_assessments_converted     ON free_hearing_assessments(converted_to_assessment);
