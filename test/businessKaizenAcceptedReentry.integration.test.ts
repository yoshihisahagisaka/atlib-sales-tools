import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { BusinessKaizenCommonKpiAdapter } from '../src/services/businessKaizenCommonKpiAdapter';
import { BusinessKaizenKpiService, resolveBusinessKaizenKpiPeriod } from '../src/services/businessKaizenKpiService';
import { BusinessKaizenProxyError } from '../src/services/businessKaizenProxyService';
import { createFreeDiagnosisRuleBasedV1Harness } from './support/freeDiagnosisRuleBasedV1Harness';

test('ACCEPTED re-entry preserves initial entry and one KPI subject', async () => {
  const h = await createFreeDiagnosisRuleBasedV1Harness({ includeBusinessKaizen: true });
  try {
    const company = randomUUID(), contact = randomUUID(), activity = randomUUID(), diagnosis = randomUUID();
    await h.pool.query(`INSERT INTO company(id,name,created_by_user_id,owner_user_id) VALUES($1,'F2a','seed','owner')`, [company]);
    await h.pool.query(`INSERT INTO contact(id,company_id,name) VALUES($1,$2,'Person')`, [contact, company]);
    await h.pool.query(`INSERT INTO sales_activity(id,company_id,primary_contact_id,selected_service,created_by_user_id,owner_user_id) VALUES($1,$2,$3,'BUSINESS_WEB','seed','owner')`, [activity, company, contact]);
    await h.pool.query(`INSERT INTO business_kaizen_diagnoses(id,entry_channel,input_state,sales_activity_id,company_id,contact_id,current_stage,owner_user_email) VALUES($1,'STAFF_PROXY','DRAFT',$2,$3,$4,'ACCEPTED','owner@atlib.jp')`, [diagnosis, activity, company, contact]);
    const firstAccepted = '2026-02-01T00:00:00.000Z';
    await h.pool.query(`INSERT INTO business_kaizen_diagnosis_stage_history(id,diagnosis_id,stage,reached_at,changed_by_user_email) VALUES($1,$2,'ACCEPTED',$3,'first@atlib.jp')`, [randomUUID(), diagnosis, firstAccepted]);

    const scheduling = await h.businessKaizenProxy.updateStage(diagnosis, 'SCHEDULING', 1, 'operator@atlib.jp');
    assert.equal(scheduling.revision, 2);
    const reaccepted = await h.businessKaizenProxy.updateStage(diagnosis, 'ACCEPTED', 2, 'operator@atlib.jp');
    assert.equal(reaccepted.revision, 3);
    const same = await h.businessKaizenProxy.updateStage(diagnosis, 'ACCEPTED', 3, 'operator@atlib.jp');
    assert.deepEqual({ changed: same.changed, revision: same.revision }, { changed: false, revision: 3 });
    await assert.rejects(
      h.businessKaizenProxy.updateStage(diagnosis, 'SCHEDULING', 2, 'stale@atlib.jp'),
      (error: unknown) => error instanceof BusinessKaizenProxyError && error.code === 'REVISION_CONFLICT',
    );

    const history = (await h.pool.query(`SELECT stage,reached_at FROM business_kaizen_diagnosis_stage_history WHERE diagnosis_id=$1 ORDER BY reached_at,id`, [diagnosis])).rows;
    assert.deepEqual(history.map(row => row.stage), ['ACCEPTED','SCHEDULING','ACCEPTED']);
    assert.equal(history.filter(row => row.stage === 'ACCEPTED').length, 2);
    assert.equal(new Date(history[0]!.reached_at).toISOString(), firstAccepted);
    assert.equal(Number((await h.pool.query(`SELECT count(*) n FROM business_kaizen_diagnosis_audit WHERE diagnosis_id=$1 AND operation='STAGE_CHANGED'`, [diagnosis])).rows[0].n), 2);
    await assert.rejects(h.pool.query(`UPDATE business_kaizen_diagnosis_stage_history SET stage='SCHEDULED' WHERE diagnosis_id=$1`, [diagnosis]), /stage history is append-only/);
    await assert.rejects(h.pool.query(`DELETE FROM business_kaizen_diagnosis_stage_history WHERE diagnosis_id=$1`, [diagnosis]), /stage history is append-only/);

    const period = resolveBusinessKaizenKpiPeriod({ from: '2026-02-01', to: '2026-02-28' });
    assert.ok(period);
    const e1 = await new BusinessKaizenKpiService(h.pool).aggregate(period);
    assert.equal(e1.cohortFunnel.acceptedDiagnosisCount, 1);
    assert.equal(e1.activityVolume.acceptedDiagnosisCount, 1);
    const subjects = await new BusinessKaizenCommonKpiAdapter(h.pool).listAcceptedSubjects();
    assert.equal(subjects.length, 1);
    assert.equal(subjects[0]?.milestones.filter(item => item.code === 'ENTRY_ACCEPTED').length, 1);
    assert.equal(subjects[0]?.enteredAt, firstAccepted);
    assert.equal(subjects[0]?.milestones[0]?.firstReachedAt, firstAccepted);
  } finally { await h.close(); }
});
