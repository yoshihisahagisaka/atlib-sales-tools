import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { startedCase } from './support/workspaceFixtures';
import { operator } from './support/preparationFixtures';
import { PilotEvidenceRepo } from '../src/services/pilotEvidenceRepo';

let h:Awaited<ReturnType<typeof createDiagnosisHarness>>;
let repo:PilotEvidenceRepo;
const operatorUserId=operator.kind==='STAFF'?operator.userId:(()=>{throw new Error('STAFF required');})();
before(async()=>{h=await createDiagnosisHarness();repo=new PilotEvidenceRepo(h.pool);});
after(async()=>{await h?.close();});

test('pilot evidence stores coded operational signals without raw customer text fields',async()=>{
  const c=await startedCase(h);
  await repo.record(c.id,operatorUserId,{
    customer_segment:'existing-trusted-customer',
    entry_trigger:'management-review',
    future_theme_code:'employee-productivity',
    completion_status:'COMPLETED',
    confusing_question_codes:['Q06_RISK'],
    unknown_pattern_codes:['UNRESOLVED_OWNER'],
    operator_correction_categories:['AI_CLASSIFICATION'],
    ai_misclassification_categories:['UNKNOWN_AS_FACT'],
    management_feedback_reaction:'POSITIVE',
    assessment_need_understood:'YES',
    next_action_code:'ASSESSMENT_DISCUSSION',
    customer_feedback_signal:'POSITIVE',
  });
  const items=await repo.list(c.id);
  assert.equal(items.length,1);
  assert.equal(items[0]!.evidence.assessment_need_understood,'YES');
  const serialized=JSON.stringify(items[0]!.evidence);
  assert.equal(serialized.includes('private@example.test'),false);
  assert.equal(serialized.includes('PRIVATE_PHONE'),false);
  assert.equal(serialized.includes('Transcript'),false);
});
