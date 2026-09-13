-- Slice 4: additive review entities; existing Raw Source and legacy data unchanged.
ALTER TABLE diagnosis_cases DROP CONSTRAINT diagnosis_cases_diagnosis_status_check;
ALTER TABLE diagnosis_cases ADD CONSTRAINT diagnosis_cases_diagnosis_status_check CHECK (diagnosis_status IN ('APPLICATION_STARTED','SURVEY_IN_PROGRESS','SURVEY_COMPLETED','PREPARATION_IN_PROGRESS','READY_FOR_DIAGNOSIS','DIAGNOSIS_IN_PROGRESS','HUMAN_REVIEW_REQUIRED','REPORT_REVIEW_REQUIRED'));
ALTER TABLE diagnosis_cases ADD COLUMN review_completed_at TIMESTAMPTZ;
ALTER TABLE diagnosis_cases ADD COLUMN review_completed_by_user_id TEXT;
ALTER TABLE ai_executions DROP CONSTRAINT ai_executions_process_type_check;
ALTER TABLE ai_executions ADD CONSTRAINT ai_executions_process_type_check CHECK (process_type IN ('PRE_DIAGNOSIS_ORGANIZER','INTERVIEW_ASSISTANT','POST_DIAGNOSIS_STRUCTURER'));
ALTER TABLE ai_proposals DROP CONSTRAINT ai_proposals_proposal_type_check;
ALTER TABLE ai_proposals ADD CONSTRAINT ai_proposals_proposal_type_check CHECK (proposal_type IN ('THEME','QUESTION','UNKNOWN','HYPOTHESIS','EVIDENCE_CANDIDATE','OBSERVATION','GAP_CANDIDATE','ROOT_CAUSE_HYPOTHESIS','KAIZEN_DIRECTION'));

CREATE TABLE diagnosis_insights (
 id UUID PRIMARY KEY, diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id), diagnosis_theme_id UUID,
 semantic_type TEXT NOT NULL CHECK (semantic_type IN ('OBSERVATION','UNKNOWN','HYPOTHESIS','GAP_CANDIDATE','ROOT_CAUSE_HYPOTHESIS','KAIZEN_DIRECTION','EVIDENCE_CANDIDATE')),
 title TEXT NOT NULL, content TEXT NOT NULL,
 unknown_type TEXT CHECK (unknown_type IN ('NOT_YET_CONFIRMED','UNRESOLVED','CONTRADICTORY','NOT_REQUIRED_NOW')),
 area_tag TEXT CHECK (area_tag IN ('技術','運用','管理')),
 improvement_lens TEXT CHECK (improvement_lens IN ('なくす','自動化する','標準化する','任せる','残す','整える')),
 review_status TEXT NOT NULL CHECK (review_status IN ('DRAFT','HUMAN_APPROVED','REJECTED','SUPERSEDED')),
 source_ai_proposal_id UUID, previous_insight_id UUID UNIQUE,
 created_by TEXT NOT NULL CHECK (created_by IN ('AI_ACCEPTED','HUMAN')), created_by_user_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,diagnosis_case_id),
 CHECK ((semantic_type='UNKNOWN' AND unknown_type IS NOT NULL) OR (semantic_type<>'UNKNOWN' AND unknown_type IS NULL)),
 FOREIGN KEY(diagnosis_theme_id,diagnosis_case_id) REFERENCES diagnosis_themes(id,diagnosis_case_id),
 FOREIGN KEY(source_ai_proposal_id,diagnosis_case_id) REFERENCES ai_proposals(id,diagnosis_case_id),
 FOREIGN KEY(previous_insight_id,diagnosis_case_id) REFERENCES diagnosis_insights(id,diagnosis_case_id)
);
CREATE TABLE insight_sources (
 diagnosis_insight_id UUID NOT NULL, diagnosis_case_id UUID NOT NULL,
 source_ref_type TEXT NOT NULL CHECK (source_ref_type IN ('SURVEY_RESPONSE','SOURCE_RECORD')), source_ref_id UUID NOT NULL,
 relation TEXT NOT NULL CHECK (relation IN ('SUPPORTS','CONTRADICTS','RELATED')),
 survey_response_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='SURVEY_RESPONSE' THEN source_ref_id END) STORED,
 source_record_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='SOURCE_RECORD' THEN source_ref_id END) STORED,
 PRIMARY KEY(diagnosis_insight_id,source_ref_type,source_ref_id,relation),
 FOREIGN KEY(diagnosis_insight_id,diagnosis_case_id) REFERENCES diagnosis_insights(id,diagnosis_case_id),
 FOREIGN KEY(survey_response_id,diagnosis_case_id) REFERENCES survey_responses(id,diagnosis_case_id),
 FOREIGN KEY(source_record_id,diagnosis_case_id) REFERENCES source_records(id,diagnosis_case_id)
);
CREATE TABLE assessment_confirmation_items (
 id UUID PRIMARY KEY, diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id), diagnosis_theme_id UUID,
 title TEXT NOT NULL, purpose TEXT NOT NULL, priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 5),
 related_insight_id UUID, related_evidence_candidate_id UUID, source_ai_proposal_id UUID,
 source_ai_execution_id UUID, source_candidate_index INTEGER CHECK (source_candidate_index>=0),
 created_by_user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','NOT_REQUIRED','HANDED_OFF')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,diagnosis_case_id), UNIQUE(source_ai_execution_id,source_candidate_index),
 CHECK ((source_ai_execution_id IS NULL) = (source_candidate_index IS NULL)),
 FOREIGN KEY(diagnosis_theme_id,diagnosis_case_id) REFERENCES diagnosis_themes(id,diagnosis_case_id),
 FOREIGN KEY(related_insight_id,diagnosis_case_id) REFERENCES diagnosis_insights(id,diagnosis_case_id),
 FOREIGN KEY(related_evidence_candidate_id,diagnosis_case_id) REFERENCES diagnosis_insights(id,diagnosis_case_id),
 FOREIGN KEY(source_ai_proposal_id,diagnosis_case_id) REFERENCES ai_proposals(id,diagnosis_case_id),
 FOREIGN KEY(source_ai_execution_id,diagnosis_case_id) REFERENCES ai_executions(id,diagnosis_case_id)
);
CREATE TABLE human_reviews (
 id UUID PRIMARY KEY, diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
 target_type TEXT NOT NULL CHECK (target_type IN ('AI_PROPOSAL','DIAGNOSIS_INSIGHT','ASSESSMENT_CONFIRMATION_ITEM')), target_id UUID NOT NULL,
 action TEXT NOT NULL CHECK (action IN ('APPROVE','APPROVE_WITH_EDIT','CONVERT_TO_UNKNOWN','REJECT','SUPERSEDE')),
 before_json JSONB, after_json JSONB, reason TEXT, reviewed_by_user_id TEXT NOT NULL, reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 proposal_id UUID GENERATED ALWAYS AS (CASE WHEN target_type='AI_PROPOSAL' THEN target_id END) STORED,
 insight_id UUID GENERATED ALWAYS AS (CASE WHEN target_type='DIAGNOSIS_INSIGHT' THEN target_id END) STORED,
 confirmation_item_id UUID GENERATED ALWAYS AS (CASE WHEN target_type='ASSESSMENT_CONFIRMATION_ITEM' THEN target_id END) STORED,
 FOREIGN KEY(proposal_id,diagnosis_case_id) REFERENCES ai_proposals(id,diagnosis_case_id),
 FOREIGN KEY(insight_id,diagnosis_case_id) REFERENCES diagnosis_insights(id,diagnosis_case_id),
 FOREIGN KEY(confirmation_item_id,diagnosis_case_id) REFERENCES assessment_confirmation_items(id,diagnosis_case_id)
);
CREATE INDEX diagnosis_insights_case_status ON diagnosis_insights(diagnosis_case_id,review_status,created_at);
CREATE INDEX human_reviews_case ON human_reviews(diagnosis_case_id,reviewed_at);
CREATE INDEX assessment_confirmation_case ON assessment_confirmation_items(diagnosis_case_id,priority);
