import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { CurrentStructuredStateV2, FreeDiagnosisNarrativeV2 } from '../src/domain/freeDiagnosisDesignV2';
import {
  DESIGN_V2_ANALYZER_VERSION,
  DESIGN_V2_RULE_SET_VERSION,
  FreeDiagnosisDesignV2PersistenceError,
  FreeDiagnosisDesignV2PersistenceRepo,
  type DesignV2CurrentStateFields,
} from '../src/services/freeDiagnosisDesignV2PersistenceRepo';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

const root = path.resolve(__dirname, '..');

function survey(overrides: Partial<CurrentStructuredStateV2> = {}): CurrentStructuredStateV2 {
  return {
    q1CompanyContext: { employeeRange: '11-30', siteRange: 'ONE' },
    q2Future: ['BUSINESS_GROWTH', 'LEAN_GROWTH'],
    q3ItExpectations: ['PRODUCTIVITY', 'MANAGEMENT_DECISION_SUPPORT'],
    q4CurrentInterest: 'MANAGEMENT_DECISION',
    q5Visibility: 'VISIBLE_PARTIAL',
    q6ManagementConnection: 'REPORTED_NOT_DECISION_USABLE',
    q7InterestThemes: ['AI'],
    ...overrides,
  };
}

function fields(value: CurrentStructuredStateV2): DesignV2CurrentStateFields {
  const { q1CompanyContext: _q1, ...current } = value;
  return current;
}

function edited(content: FreeDiagnosisNarrativeV2, marker: string): FreeDiagnosisNarrativeV2 {
  return { ...content, currentUnderstanding: { ...content.currentUnderstanding, entries: [...content.currentUnderstanding.entries, marker] } };
}

test('Package B persistence acceptance (23 required contracts)', async t => {
  const h = await createFreeDiagnosisRuleBasedV1Harness();
  try {
    await h.db.exec(fs.readFileSync(path.join(root, 'migrations/033_free_diagnosis_design_v2_persistence.sql'), 'utf8'));
    const repo = new FreeDiagnosisDesignV2PersistenceRepo(h.pool);
    const activityA = await h.launcher.createSalesActivity({
      name: 'Design V2 A', contact: { name: 'A' }, selectedService: 'IT_KAIZEN',
    }, 'operator@atlib.jp');
    const caseA = await h.cases.createCase(activityA.companyId, activityA.contactId, activityA.salesActivityId, 'operator@atlib.jp');
    const activityB = await h.launcher.createSalesActivity({
      name: 'Design V2 B', contact: { name: 'B' }, selectedService: 'IT_KAIZEN',
    }, 'operator@atlib.jp');
    const caseB = await h.cases.createCase(activityB.companyId, activityB.contactId, activityB.salesActivityId, 'operator@atlib.jp');

    const initializedA = await repo.initializeDesignV2FromCompletedSurvey({
      caseId: caseA.id, answers: survey(), surveyVersion: 'design-v2-test', entryChannel: 'CUSTOMER_SELF',
      answeredByRole: 'OWNER', actor: 'public-customer-self',
    });
    const initializedB = await repo.initializeDesignV2FromCompletedSurvey({
      caseId: caseB.id, answers: survey({ q5Visibility: 'VISIBLE_MOSTLY' }), surveyVersion: 'design-v2-test',
      entryChannel: 'STAFF_PROXY', answeredByRole: 'MANAGER', enteredByUserId: 'operator@atlib.jp', actor: 'operator@atlib.jp',
    });

    await t.test('1 Original Snapshot is exactly one per Case', async () => {
      await assert.rejects(repo.initializeDesignV2FromCompletedSurvey({
        caseId: caseA.id, answers: survey(), surveyVersion: 'duplicate', entryChannel: 'CUSTOMER_SELF', answeredByRole: 'OWNER', actor: 'public',
      }), (error: unknown) => error instanceof FreeDiagnosisDesignV2PersistenceError && error.code === 'DESIGN_V2_ALREADY_INITIALIZED');
      assert.equal((await h.pool.query('SELECT count(*)::int n FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [caseA.id])).rows[0].n, 1);
    });

    await t.test('2 Original Snapshot rejects UPDATE and DELETE', async () => {
      await assert.rejects(h.pool.query("UPDATE it_management_diagnosis_original_survey_snapshot_v2 SET survey_version='changed' WHERE case_id=$1", [caseA.id]));
      await assert.rejects(h.pool.query('DELETE FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [caseA.id]));
    });

    await t.test('3 Initial Current State is revision 1 and contains Q2-Q7 only', () => {
      assert.equal(initializedA.currentStructuredState.revisionNo, 1);
      assert.equal(initializedA.currentStructuredState.sourceType, 'INITIAL_FROM_ORIGINAL');
      assert.equal('q1CompanyContext' in initializedA.currentStructuredState.state, false);
    });

    const edit1 = await repo.appendDesignV2HumanEditedNarrative({
      caseId: caseA.id, generatedNarrativeId: initializedA.latestGeneratedNarrative.id,
      content: edited(initializedA.latestGeneratedNarrative.content, 'human edit 1'), actor: 'reviewer@atlib.jp', editReason: 'customer wording',
    });
    const edit2 = await repo.appendDesignV2HumanEditedNarrative({
      caseId: caseA.id, generatedNarrativeId: initializedA.latestGeneratedNarrative.id,
      content: edited(initializedA.latestGeneratedNarrative.content, 'human edit 2'), actor: 'reviewer@atlib.jp',
    });

    await t.test('4 Human Edit appends revisions', () => {
      assert.equal(edit1.revisionNo, 1); assert.equal(edit2.revisionNo, 2);
    });
    await t.test('5 Human Edit requires generated narrative id', async () => {
      await assert.rejects(repo.appendDesignV2HumanEditedNarrative({
        caseId: caseA.id, generatedNarrativeId: randomUUID(), content: initializedA.latestGeneratedNarrative.content, actor: 'reviewer@atlib.jp',
      }), (error: unknown) => error instanceof FreeDiagnosisDesignV2PersistenceError && error.code === 'STALE_GENERATED_NARRATIVE');
    });
    await t.test('6 Latest generated Human Edit derives CURRENT', async () => {
      assert.equal((await repo.getPostHearingAnalysisView(caseA.id)).humanEditedNarrativeStatus, 'CURRENT');
    });

    const changed = survey({ q5Visibility: 'RELIES_ON_OTHERS' });
    const revision2 = await repo.appendDesignV2CurrentStateAndReanalyze({
      caseId: caseA.id, expectedRevision: 1, state: fields(changed), supplement: { note: 'human-confirmed structured state' },
      actor: 'reviewer@atlib.jp', changeReason: 'hearing confirmation',
    });

    await t.test('7 Human update creates revision 2', () => assert.equal(revision2.currentStructuredState.revisionNo, 2));
    await t.test('8 Old Current State remains', async () => {
      const revisions = await repo.listCurrentStateRevisions(caseA.id);
      assert.deepEqual(revisions.map(item => item.revisionNo), [1, 2]);
    });
    await t.test('9 expectedRevision mismatch conflicts without append', async () => {
      await assert.rejects(repo.appendDesignV2CurrentStateAndReanalyze({
        caseId: caseA.id, expectedRevision: 1, state: fields(changed), actor: 'reviewer@atlib.jp',
      }), (error: unknown) => error instanceof FreeDiagnosisDesignV2PersistenceError && error.code === 'CURRENT_STATE_REVISION_CONFLICT');
      assert.equal((await repo.listCurrentStateRevisions(caseA.id)).length, 2);
    });
    await t.test('10 Analysis points to exact Current State', () => {
      assert.equal(revision2.latestAnalysisResult.currentStateId, revision2.currentStructuredState.id);
    });
    await t.test('11 Same state/analyzer/rule set duplicate is rejected', async () => {
      await assert.rejects(h.pool.query(
        `INSERT INTO it_management_diagnosis_analysis_result_v2
         (id,case_id,current_state_id,analyzer_version,rule_set_version,analysis_json,input_hash,result_hash)
         VALUES($1,$2,$3,$4,$5,'{}',$6,$6)`,
        [randomUUID(), caseA.id, revision2.currentStructuredState.id, DESIGN_V2_ANALYZER_VERSION, DESIGN_V2_RULE_SET_VERSION, '0'.repeat(64)],
      ));
    });
    await t.test('12 Generated points to exact Analysis and Current State', () => {
      assert.equal(revision2.latestGeneratedNarrative.analysisResultId, revision2.latestAnalysisResult.id);
      assert.equal(revision2.latestGeneratedNarrative.currentStateId, revision2.currentStructuredState.id);
    });
    await t.test('13 Generated Narrative rejects UPDATE and DELETE', async () => {
      await assert.rejects(h.pool.query("UPDATE it_management_diagnosis_generated_narrative_v2 SET generator_version='changed' WHERE id=$1", [revision2.latestGeneratedNarrative.id]));
      await assert.rejects(h.pool.query('DELETE FROM it_management_diagnosis_generated_narrative_v2 WHERE id=$1', [revision2.latestGeneratedNarrative.id]));
    });
    await t.test('14 Old Human Edit derives STALE without mutation', async () => {
      const view = await repo.getPostHearingAnalysisView(caseA.id);
      assert.equal(view.humanEditedNarrativeStatus, 'STALE_REVIEW_REQUIRED');
      const stored = (await h.pool.query('SELECT revision_no,content_hash FROM it_management_diagnosis_human_edited_narrative_v2 WHERE id=$1', [edit2.id])).rows[0];
      assert.equal(stored.revision_no, 2); assert.equal(stored.content_hash, edit2.contentHash);
    });
    await t.test('15 New edit against stale Generated is rejected', async () => {
      await assert.rejects(repo.appendDesignV2HumanEditedNarrative({
        caseId: caseA.id, generatedNarrativeId: initializedA.latestGeneratedNarrative.id,
        content: initializedA.latestGeneratedNarrative.content, actor: 'reviewer@atlib.jp',
      }), (error: unknown) => error instanceof FreeDiagnosisDesignV2PersistenceError && error.code === 'STALE_GENERATED_NARRATIVE');
    });
    const currentEdit = await repo.appendDesignV2HumanEditedNarrative({
      caseId: caseA.id, generatedNarrativeId: revision2.latestGeneratedNarrative.id,
      content: edited(revision2.latestGeneratedNarrative.content, 'current edit'), actor: 'reviewer@atlib.jp',
    });
    await t.test('16 Latest Generated edit derives CURRENT', async () => {
      assert.equal((await repo.getPostHearingAnalysisView(caseA.id)).humanEditedNarrativeStatus, 'CURRENT');
      assert.equal(currentEdit.revisionNo, 1);
    });

    await t.test('17 Cross-case Current State previous reference is rejected by DB', async () => {
      await assert.rejects(h.pool.query(
        `INSERT INTO it_management_diagnosis_current_state_revision_v2
         (id,case_id,revision_no,source_type,based_on_original_snapshot_id,previous_state_id,state_json,updated_by_user_id)
         VALUES($1,$2,3,'HUMAN_UPDATE',$3,$4,$5,'x')`,
        [randomUUID(), caseA.id, initializedA.originalSurvey.id, initializedB.currentStructuredState.id, JSON.stringify(fields(changed))],
      ));
    });
    await t.test('18 Cross-case Analysis reference is rejected by DB', async () => {
      await assert.rejects(h.pool.query(
        `INSERT INTO it_management_diagnosis_analysis_result_v2
         (id,case_id,current_state_id,analyzer_version,rule_set_version,analysis_json,input_hash,result_hash)
         VALUES($1,$2,$3,'a','r','{}',$4,$4)`,
        [randomUUID(), caseA.id, initializedB.currentStructuredState.id, '0'.repeat(64)],
      ));
    });
    await t.test('19 Cross-case Human Edit reference is rejected by DB', async () => {
      await assert.rejects(h.pool.query(
        `INSERT INTO it_management_diagnosis_human_edited_narrative_v2
         (id,case_id,generated_narrative_id,revision_no,content_json,edited_by_user_id,content_hash)
         VALUES($1,$2,$3,1,'{}','x',$4)`,
        [randomUUID(), caseA.id, initializedB.latestGeneratedNarrative.id, '0'.repeat(64)],
      ));
    });
    await t.test('19b Cross-case Original and Generated links are rejected by DB', async () => {
      await assert.rejects(h.pool.query(
        `INSERT INTO it_management_diagnosis_current_state_revision_v2
         (id,case_id,revision_no,source_type,based_on_original_snapshot_id,previous_state_id,state_json,updated_by_user_id)
         VALUES($1,$2,3,'HUMAN_UPDATE',$3,$4,$5,'x')`,
        [randomUUID(), caseA.id, initializedB.originalSurvey.id, revision2.currentStructuredState.id, JSON.stringify(fields(changed))],
      ));
      await assert.rejects(h.pool.query(
        `INSERT INTO it_management_diagnosis_generated_narrative_v2
         (id,case_id,current_state_id,analysis_result_id,generator_version,content_json,content_hash)
         VALUES($1,$2,$3,$4,'cross-case','{}',$5)`,
        [randomUUID(), caseA.id, revision2.currentStructuredState.id, initializedB.latestAnalysisResult.id, '0'.repeat(64)],
      ));
    });

    await t.test('20 Initial transaction rollback leaves no partial Original', async () => {
      const activity = await h.launcher.createSalesActivity({ name: 'Rollback init', contact: { name: 'C' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
      const kase = await h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, 'operator@atlib.jp');
      await h.db.exec(`CREATE FUNCTION reject_v2_original_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command='CompleteDesignV2OriginalSurvey' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_v2_original_audit BEFORE INSERT ON it_management_diagnosis_case_v2_audit FOR EACH ROW EXECUTE FUNCTION reject_v2_original_audit();`);
      await assert.rejects(repo.initializeDesignV2FromCompletedSurvey({ caseId: kase.id, answers: survey(), surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'OWNER', actor: 'x' }));
      assert.equal((await h.pool.query('SELECT count(*)::int n FROM it_management_diagnosis_original_survey_snapshot_v2 WHERE case_id=$1', [kase.id])).rows[0].n, 0);
      await h.db.exec('DROP TRIGGER reject_v2_original_audit ON it_management_diagnosis_case_v2_audit; DROP FUNCTION reject_v2_original_audit();');
    });

    await t.test('21 Reanalysis rollback leaves no partial Current State', async () => {
      await h.db.exec(`CREATE FUNCTION reject_v2_state_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command='CreateDesignV2CurrentStateRevision' THEN RAISE EXCEPTION 'test state audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_v2_state_audit BEFORE INSERT ON it_management_diagnosis_case_v2_audit FOR EACH ROW EXECUTE FUNCTION reject_v2_state_audit();`);
      await assert.rejects(repo.appendDesignV2CurrentStateAndReanalyze({ caseId: caseA.id, expectedRevision: 2, state: fields(changed), actor: 'reviewer@atlib.jp' }));
      assert.equal((await repo.listCurrentStateRevisions(caseA.id)).length, 2);
      await h.db.exec('DROP TRIGGER reject_v2_state_audit ON it_management_diagnosis_case_v2_audit; DROP FUNCTION reject_v2_state_audit();');
    });

    await t.test('22 Artifact and audit are transactionally present', async () => {
      const audit = (await h.pool.query("SELECT command,detail_json FROM it_management_diagnosis_case_v2_audit WHERE case_id=$1 AND command IN ('CompleteDesignV2OriginalSurvey','CreateDesignV2CurrentStateRevision','SaveDesignV2HumanEditedNarrative')", [caseA.id])).rows;
      assert.ok(audit.some(row => row.command === 'CompleteDesignV2OriginalSurvey'));
      assert.ok(audit.some(row => row.command === 'CreateDesignV2CurrentStateRevision'));
      assert.ok(audit.some(row => row.command === 'SaveDesignV2HumanEditedNarrative'));
    });

    await t.test('23 Hearing memo is not analyzer input', async () => {
      await h.pool.query(
        `INSERT INTO hearing_statement_v2(id,case_id,statement_text,operator_note_text,knowledge_state,structured_answer_json,recorded_by_user_id)
         VALUES($1,$2,'memo must not be analyzed','private operator note','KNOWN',$3,'operator@atlib.jp')`,
        [randomUUID(), caseA.id, JSON.stringify({ semanticKey: 'INJECTED', answerValue: 'INJECTED' })],
      );
      const beforeHash = revision2.latestAnalysisResult.resultHash;
      const revision3 = await repo.appendDesignV2CurrentStateAndReanalyze({
        caseId: caseA.id, expectedRevision: 2, state: fields(changed), actor: 'reviewer@atlib.jp', changeReason: 'same structured state',
      });
      assert.equal(revision3.latestAnalysisResult.resultHash, beforeHash);
      assert.equal(JSON.stringify(revision3.latestAnalysisResult.analysis).includes('INJECTED'), false);
    });

    await t.test('24 All five histories reject business mutation', async () => {
      await assert.rejects(h.pool.query('UPDATE it_management_diagnosis_current_state_revision_v2 SET change_reason=$2 WHERE id=$1', [revision2.currentStructuredState.id, 'changed']));
      await assert.rejects(h.pool.query('UPDATE it_management_diagnosis_analysis_result_v2 SET analysis_json=$2 WHERE id=$1', [revision2.latestAnalysisResult.id, '{}']));
      await assert.rejects(h.pool.query('UPDATE it_management_diagnosis_human_edited_narrative_v2 SET edit_reason=$2 WHERE id=$1', [currentEdit.id, 'changed']));
    });

    await t.test('25 Concurrent saves with one expectedRevision do not silently overwrite', async () => {
      const activity = await h.launcher.createSalesActivity({ name: 'Concurrency', contact: { name: 'D' }, selectedService: 'IT_KAIZEN' }, 'operator@atlib.jp');
      const kase = await h.cases.createCase(activity.companyId, activity.contactId, activity.salesActivityId, 'operator@atlib.jp');
      await repo.initializeDesignV2FromCompletedSurvey({ caseId: kase.id, answers: survey(), surveyVersion: 'test', entryChannel: 'STAFF_PROXY', answeredByRole: 'OWNER', actor: 'operator@atlib.jp' });
      const attempts = await Promise.allSettled([
        repo.appendDesignV2CurrentStateAndReanalyze({ caseId: kase.id, expectedRevision: 1, state: fields(survey({ q5Visibility: 'VISIBLE_FULL' })), actor: 'one@atlib.jp' }),
        repo.appendDesignV2CurrentStateAndReanalyze({ caseId: kase.id, expectedRevision: 1, state: fields(survey({ q5Visibility: 'LOW_VISIBILITY' })), actor: 'two@atlib.jp' }),
      ]);
      assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(attempts.filter(result => result.status === 'rejected').length, 1);
      assert.deepEqual((await repo.listCurrentStateRevisions(kase.id)).map(item => item.revisionNo), [1, 2]);
    });
  } finally { await h.close(); }
});
