-- Phase 3: pin hearing citations to the immutable revision used at decision time.
-- Existing SURVEY_RESPONSE and SOURCE_RECORD citations remain revision-less.
ALTER TABLE diagnosis_hearing_records ADD CONSTRAINT diagnosis_hearing_records_id_case_key UNIQUE (id, diagnosis_case_id);
ALTER TABLE diagnosis_hearing_record_revisions ADD CONSTRAINT diagnosis_hearing_revisions_id_case_record_key UNIQUE (id, diagnosis_case_id, hearing_record_id);

ALTER TABLE ai_proposal_sources DROP CONSTRAINT ai_proposal_sources_pkey;
ALTER TABLE ai_proposal_sources DROP CONSTRAINT ai_proposal_sources_source_ref_type_check;
ALTER TABLE ai_proposal_sources ADD COLUMN source_revision_id UUID;
ALTER TABLE ai_proposal_sources ADD COLUMN hearing_record_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='HEARING_RECORD' THEN source_ref_id END) STORED;
ALTER TABLE ai_proposal_sources ADD COLUMN source_revision_identity UUID GENERATED ALWAYS AS (COALESCE(source_revision_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;
ALTER TABLE ai_proposal_sources ADD CONSTRAINT ai_proposal_sources_source_ref_type_check CHECK (source_ref_type IN ('SURVEY_RESPONSE','SOURCE_RECORD','HEARING_RECORD'));
ALTER TABLE ai_proposal_sources ADD CONSTRAINT ai_proposal_sources_revision_shape_check CHECK ((source_ref_type='HEARING_RECORD') = (source_revision_id IS NOT NULL));
ALTER TABLE ai_proposal_sources ADD CONSTRAINT ai_proposal_sources_hearing_record_case_fkey FOREIGN KEY (hearing_record_id,diagnosis_case_id) REFERENCES diagnosis_hearing_records(id,diagnosis_case_id);
ALTER TABLE ai_proposal_sources ADD CONSTRAINT ai_proposal_sources_hearing_revision_case_record_fkey FOREIGN KEY (source_revision_id,diagnosis_case_id,hearing_record_id) REFERENCES diagnosis_hearing_record_revisions(id,diagnosis_case_id,hearing_record_id);
ALTER TABLE ai_proposal_sources ADD PRIMARY KEY(ai_proposal_id,source_ref_type,source_ref_id,relation,source_revision_identity);

ALTER TABLE insight_sources DROP CONSTRAINT insight_sources_pkey;
ALTER TABLE insight_sources DROP CONSTRAINT insight_sources_source_ref_type_check;
ALTER TABLE insight_sources ADD COLUMN source_revision_id UUID;
ALTER TABLE insight_sources ADD COLUMN hearing_record_id UUID GENERATED ALWAYS AS (CASE WHEN source_ref_type='HEARING_RECORD' THEN source_ref_id END) STORED;
ALTER TABLE insight_sources ADD COLUMN source_revision_identity UUID GENERATED ALWAYS AS (COALESCE(source_revision_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;
ALTER TABLE insight_sources ADD CONSTRAINT insight_sources_source_ref_type_check CHECK (source_ref_type IN ('SURVEY_RESPONSE','SOURCE_RECORD','HEARING_RECORD'));
ALTER TABLE insight_sources ADD CONSTRAINT insight_sources_revision_shape_check CHECK ((source_ref_type='HEARING_RECORD') = (source_revision_id IS NOT NULL));
ALTER TABLE insight_sources ADD CONSTRAINT insight_sources_hearing_record_case_fkey FOREIGN KEY (hearing_record_id,diagnosis_case_id) REFERENCES diagnosis_hearing_records(id,diagnosis_case_id);
ALTER TABLE insight_sources ADD CONSTRAINT insight_sources_hearing_revision_case_record_fkey FOREIGN KEY (source_revision_id,diagnosis_case_id,hearing_record_id) REFERENCES diagnosis_hearing_record_revisions(id,diagnosis_case_id,hearing_record_id);
ALTER TABLE insight_sources ADD PRIMARY KEY(diagnosis_insight_id,source_ref_type,source_ref_id,relation,source_revision_identity);
