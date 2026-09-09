-- 情シスKAIZEN｜60分無料診断（V5診断エンジン）。
-- 人（atLIB担当者）が対話でヒアリングし、AIが会話から事実抽出・一次判定・レポート下書きを補助する。
-- 004/005 と同じ作法（UUID PK + gen_random_uuid、TIMESTAMPTZ、enum の代わりに CHECK、
-- 事前アンケート・ブリーフ・構造化結果・レポートは JSONB スナップショットで凍結）。
-- pgcrypto は 001 で CREATE EXTENSION 済みのため再作成しない。
--
-- 既存 kaizen_diagnostics（LP の自己採点12問）は本マイグレーションでは一切変更しない。
-- V5 は入口・テーブル・管理画面すべて別系統（別スラッグ kaizen-assessment）。
--
-- 設計の要点:
--  * 親テーブル kaizen_assessments に JSONB スナップショットを集約（既存3診断機能と同じ「凍結」規約）。
--  * 唯一の正規化テーブル kaizen_assessment_facts は「担当者編集 vs AI再解析の競合回避」と
--    「未確認事実数の集計」のためだけに切り出す。AI層(ai_*)は再解析で上書き、担当者層(handler_*)は
--    AIが絶対に触らない。最終値(確定診断)は保存せず repo で算出する。
--  * 反映事項A: 全31項目を空行で先出しはしない。AIが focusItems に挙げた項目＋必須項目のみ upsert。
--  * 反映事項B: role_gap は強制100%正規化しない（aiRaw / aiEstimate / handler を層分離）。
--  * 反映事項C: fact に ai_evidence_source_type（transcript / handler_memo / none）を持たせる。
--  * 反映事項G: businesses[] に将来拡張フィールドの器（remoteOperability 等）を持つ。

CREATE TABLE kaizen_assessments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_source             TEXT NOT NULL CHECK (input_source IN ('staff', 'prospect')),
  source                   TEXT NOT NULL DEFAULT 'joshisu-kaizen-lp-v5', -- 流入経路（将来の複数LP対応用）
  company_name             TEXT NOT NULL,
  contact_name             TEXT,
  email                    TEXT,
  phone                    TEXT,
  employee_band            TEXT,                        -- 事前アンケートQ1（従業員数）を一覧フィルタ用に非正規化。NULL 可
  hearing_date             DATE,                        -- スタッフが60分診断の実施日を設定
  staff_email              TEXT,                        -- input_source='staff' のとき req.staffEmail
  source_ip                TEXT,                        -- input_source='prospect' のとき req.ip

  catalog_version          TEXT NOT NULL,               -- domain の CATALOG_VERSION を打刻
  pre_survey               JSONB NOT NULL,              -- 8問のQ&Aスナップショット（設問文・選択肢ラベル・選択値まで凍結）+ preSurveyVersion
  ai_pre_brief             JSONB,                       -- 9ブロックのブリーフ + {model, promptVersion, generatedAt}。生成前は NULL
  interview                JSONB NOT NULL
                             DEFAULT '{"transcript":"","handlerMemo":"","navHistory":[],"lastAnalyzedAt":null,"aiRunSeq":0}'::jsonb,
  businesses               JSONB NOT NULL DEFAULT '[]'::jsonb,   -- 代表業務（最大~15）。各要素に ai/handler サブ + ordinal + handlerStatus + 将来拡張フィールド
  role_gap                 JSONB,                       -- {aiRaw, aiEstimate, handler, diff, evidenceSufficiency, status, currentSum, idealSum, note}
  maturity                 JSONB,                       -- {areas:[{areaId,label,aiScore,handlerScore,anchorMet,evidence}], overallGap, source}
  kaizen_hypotheses        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- 最大~10。各要素 isHypothesis:true 固定
  report_draft             JSONB,                       -- {operatingModelHypothesis, blocks:{b01..b06}, generatedAt, model, promptVersion, handlerEditedAt}
  ai_run_log               JSONB NOT NULL DEFAULT '[]'::jsonb,   -- 追記のみ [{step, model, at, durationMs, ok, error?}]

  workflow_stage           TEXT NOT NULL DEFAULT 'pre_survey'
                             CHECK (workflow_stage IN
                               ('pre_survey','briefed','interviewing','items_review','structured','report_draft','report_final')),
  review_status            TEXT NOT NULL DEFAULT 'new'
                             CHECK (review_status IN ('new','contacted','closed')),
  converted_to_assessment  BOOLEAN NOT NULL DEFAULT false,
  assessment_case_code     TEXT,                        -- 有償「情シスKAIZEN 設計アセスメント」案件コード（現状は手動更新）
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kaizen_assessments_created_at    ON kaizen_assessments(created_at DESC);
CREATE INDEX idx_kaizen_assessments_review_status ON kaizen_assessments(review_status);
CREATE INDEX idx_kaizen_assessments_workflow      ON kaizen_assessments(workflow_stage);
CREATE INDEX idx_kaizen_assessments_input_source  ON kaizen_assessments(input_source);
CREATE INDEX idx_kaizen_assessments_converted     ON kaizen_assessments(converted_to_assessment);

-- AI抽出項目マスター（F01–F06 / P01–P13 / T01–T03 / I01–I03）の抽出結果 + 担当者確認。
-- 1 assessment × 1 item_code で UNIQUE。今回対象（AIが focus に挙げた項目＋必須）だけ行を作る。
CREATE TABLE kaizen_assessment_facts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id         UUID NOT NULL REFERENCES kaizen_assessments(id) ON DELETE CASCADE,
  item_code             TEXT NOT NULL,                -- 'F01'..'I03'
  catalog_version       TEXT NOT NULL,

  -- ===== AI抽出レイヤー（再解析のたびに上書き。handler_* は絶対に触らない）=====
  ai_value              TEXT,                          -- 抽出値（生テキスト）。抽出不能なら NULL
  ai_standard_code      TEXT,                          -- 標準分類コード（AUTH01-05/99, MGT01-07/99, WORK01-04/99, DEP01-04/99, FLOW01-05/99）。NULL 可
  ai_confidence         TEXT CHECK (ai_confidence IN ('high','mid','low')),
  ai_evidence_quote     TEXT,                          -- 根拠発言（逐語引用）。無ければ '不明'
  ai_evidence_source_type TEXT CHECK (ai_evidence_source_type IN ('transcript','handler_memo','none')),
  ai_flag               TEXT CHECK (ai_flag IN ('ok','unknown','conflict','needs_confirmation')),
  ai_followup_question  TEXT,                          -- 追加確認質問
  ai_in_focus           BOOLEAN NOT NULL DEFAULT false, -- AIが今回の診断で重点と判断したか（反映事項A）
  ai_focus_reason       TEXT,
  ai_extracted_at       TIMESTAMPTZ,
  ai_run_seq            INT NOT NULL DEFAULT 0,         -- 何回目の analyze で得たか

  -- ===== 担当者確認レイヤー（AI が触らない）=====
  handler_status        TEXT NOT NULL DEFAULT 'pending'
                          CHECK (handler_status IN ('pending','approved','revised','hold')),
  handler_value         TEXT,                          -- 修正値
  handler_standard_code TEXT,
  handler_note          TEXT,
  handler_by            TEXT,                          -- staff email
  handler_at            TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, item_code)
);

CREATE INDEX idx_kaizen_assessment_facts_assessment ON kaizen_assessment_facts(assessment_id);
CREATE INDEX idx_kaizen_assessment_facts_pending
  ON kaizen_assessment_facts(assessment_id) WHERE handler_status = 'pending';
CREATE INDEX idx_kaizen_assessment_facts_focus
  ON kaizen_assessment_facts(assessment_id) WHERE ai_in_focus;
