-- Additive hearing records. Never update survey_responses from this feature.
CREATE TABLE diagnosis_hearing_records (
 id UUID PRIMARY KEY,
 diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
 question_code TEXT NOT NULL,
 question_version INTEGER NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
 answer_json JSONB,
 statement TEXT NOT NULL DEFAULT '',
 unknown_note TEXT NOT NULL DEFAULT '',
 created_by_user_id TEXT NOT NULL,
 updated_by_user_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(diagnosis_case_id,question_code,question_version),
 FOREIGN KEY(question_code,question_version) REFERENCES survey_questions(question_code,version)
);
CREATE TABLE diagnosis_hearing_record_revisions (
 id UUID PRIMARY KEY,
 hearing_record_id UUID NOT NULL REFERENCES diagnosis_hearing_records(id),
 diagnosis_case_id UUID NOT NULL REFERENCES diagnosis_cases(id),
 version INTEGER NOT NULL CHECK(version > 0),
 operation TEXT NOT NULL CHECK(operation IN ('CREATE','CORRECT')),
 previous_json JSONB,
 current_json JSONB NOT NULL,
 reason TEXT,
 actor_user_id TEXT NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(hearing_record_id,version),
 CHECK ((operation='CREATE' AND previous_json IS NULL AND reason IS NULL) OR (operation='CORRECT' AND previous_json IS NOT NULL AND length(btrim(reason)) > 0))
);
CREATE INDEX diagnosis_hearing_records_case_idx ON diagnosis_hearing_records(diagnosis_case_id,question_code);
CREATE INDEX diagnosis_hearing_revisions_case_idx ON diagnosis_hearing_record_revisions(diagnosis_case_id,recorded_at);
