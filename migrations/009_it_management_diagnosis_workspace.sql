-- Slice 3: preserve all existing records and widen Diagnosis Domain constraints.
ALTER TABLE diagnosis_cases DROP CONSTRAINT diagnosis_cases_diagnosis_status_check;
ALTER TABLE diagnosis_cases ADD CONSTRAINT diagnosis_cases_diagnosis_status_check CHECK
 (diagnosis_status IN ('APPLICATION_STARTED','SURVEY_IN_PROGRESS','SURVEY_COMPLETED','PREPARATION_IN_PROGRESS','READY_FOR_DIAGNOSIS','DIAGNOSIS_IN_PROGRESS','HUMAN_REVIEW_REQUIRED'));
ALTER TABLE ai_executions DROP CONSTRAINT ai_executions_process_type_check;
ALTER TABLE ai_executions ADD CONSTRAINT ai_executions_process_type_check CHECK
 (process_type IN ('PRE_DIAGNOSIS_ORGANIZER','INTERVIEW_ASSISTANT'));

CREATE TABLE source_records (
 id UUID PRIMARY KEY,
 diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
 source_type TEXT NOT NULL CHECK (source_type IN ('INTERVIEW_STATEMENT','OPERATOR_NOTE','TRANSCRIPT','SCREEN_SHARED_INFORMATION','DOCUMENT_EXISTENCE_OBSERVED')),
 speaker_participant_id UUID,
 entered_by_user_id TEXT NOT NULL,
 content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
 occurred_at TIMESTAMPTZ,
 parent_source_record_id UUID,
 external_reference TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,diagnosis_case_id),
 FOREIGN KEY(speaker_participant_id,diagnosis_case_id) REFERENCES participants(id,diagnosis_case_id),
 FOREIGN KEY(parent_source_record_id,diagnosis_case_id) REFERENCES source_records(id,diagnosis_case_id),
 CHECK (source_type <> 'OPERATOR_NOTE' OR speaker_participant_id IS NULL)
);
CREATE INDEX source_records_case_time ON source_records(diagnosis_case_id,created_at,id);

-- Generated typed keys retain real same-case foreign keys for both source kinds.
ALTER TABLE ai_proposal_sources DROP CONSTRAINT ai_proposal_sources_source_ref_type_check;
ALTER TABLE ai_proposal_sources DROP CONSTRAINT ai_proposal_sources_source_ref_id_diagnosis_case_id_fkey;
ALTER TABLE ai_proposal_sources ADD CONSTRAINT ai_proposal_sources_source_ref_type_check CHECK (source_ref_type IN ('SURVEY_RESPONSE','SOURCE_RECORD'));
ALTER TABLE ai_proposal_sources ADD COLUMN survey_response_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='SURVEY_RESPONSE' THEN source_ref_id END) STORED;
ALTER TABLE ai_proposal_sources ADD COLUMN source_record_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='SOURCE_RECORD' THEN source_ref_id END) STORED;
ALTER TABLE ai_proposal_sources ADD FOREIGN KEY(survey_response_id,diagnosis_case_id) REFERENCES survey_responses(id,diagnosis_case_id);
ALTER TABLE ai_proposal_sources ADD FOREIGN KEY(source_record_id,diagnosis_case_id) REFERENCES source_records(id,diagnosis_case_id);
ALTER TABLE ai_proposal_sources DROP CONSTRAINT ai_proposal_sources_pkey;
ALTER TABLE ai_proposal_sources ADD PRIMARY KEY(ai_proposal_id,source_ref_type,source_ref_id,relation);

ALTER TABLE diagnosis_futures DROP CONSTRAINT diagnosis_futures_source_ref_type_check;
ALTER TABLE diagnosis_futures DROP CONSTRAINT diagnosis_futures_source_ref_id_diagnosis_case_id_fkey;
ALTER TABLE diagnosis_futures ADD CONSTRAINT diagnosis_futures_source_ref_type_check CHECK (source_ref_type IN ('SURVEY_RESPONSE','SOURCE_RECORD'));
ALTER TABLE diagnosis_futures ADD COLUMN survey_response_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='SURVEY_RESPONSE' THEN source_ref_id END) STORED;
ALTER TABLE diagnosis_futures ADD COLUMN source_record_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='SOURCE_RECORD' THEN source_ref_id END) STORED;
ALTER TABLE diagnosis_futures ADD FOREIGN KEY(survey_response_id,diagnosis_case_id) REFERENCES survey_responses(id,diagnosis_case_id);
ALTER TABLE diagnosis_futures ADD FOREIGN KEY(source_record_id,diagnosis_case_id) REFERENCES source_records(id,diagnosis_case_id);
ALTER TABLE diagnosis_futures ADD UNIQUE(id,diagnosis_case_id);
ALTER TABLE diagnosis_futures ADD COLUMN previous_future_id UUID;
ALTER TABLE diagnosis_futures ADD FOREIGN KEY(previous_future_id,diagnosis_case_id) REFERENCES diagnosis_futures(id,diagnosis_case_id);
