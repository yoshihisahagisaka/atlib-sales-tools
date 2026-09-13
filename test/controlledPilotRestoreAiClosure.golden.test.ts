import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDiagnosisHarness } from './support/diagnosisHarness';
import { operator } from './support/preparationFixtures';
import { startedCase } from './support/workspaceFixtures';
import { buildInterviewAssistantContext } from '../src/services/interviewAssistantContext';
import { buildPostDiagnosisContext } from '../src/services/postDiagnosisContext';
import {
  buildDeletionReconciliationManifest,
  deletionManifestHash,
  reconcileDeletionManifest,
} from '../src/services/deletionReconciliation';

let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;
before(async () => { h = await createDiagnosisHarness(); });
after(async () => { await h?.close(); });

test('Slice D: AI-02/03はTranscriptをdefault除外し、explicit consent + necessity opt-in時のみbounded excerptへ含める', async () => {
  const c = await startedCase(h);
  const consent = await h.repo.recordTranscriptConsent(c.id, operator, {
    consentVersion:'TRANSCRIPT-CONSENT-PILOT-v1',
    consentScope:'60分診断の文字起こしを診断整理に利用',
    consentedAt:new Date().toISOString(),
  });
  assert.equal(consent.status,'ACTIVE');
  await h.workspace.addSource(c.id,operator,'INTERVIEW_STATEMENT',{content:'通常の顧客発言'});
  await h.workspace.addSource(c.id,operator,'TRANSCRIPT',{content:'機密Transcript'.repeat(1000)});

  const client=await h.pool.connect();
  try {
    const defaultContext=await buildInterviewAssistantContext(client,c.id);
    assert.ok(defaultContext.sources.some(s=>s.source_type==='INTERVIEW_STATEMENT'));
    assert.equal(defaultContext.sources.some(s=>s.source_type==='TRANSCRIPT'),false);
    const postContext=await buildPostDiagnosisContext(client,c.id);
    assert.equal(postContext.sources.some(s=>s.source_type==='TRANSCRIPT'),false);

    const explicitContext=await buildInterviewAssistantContext(client,c.id,{includeConsentedTranscript:true});
    const transcript=explicitContext.sources.find(s=>s.source_type==='TRANSCRIPT');
    assert.ok(transcript);
    assert.equal(transcript!.content.length,2000);
    assert.equal(transcript!.is_excerpt,true);
    for (const secret of [c.access_token!,'private@example.test','operator@atlib.jp','staff_session','access_token']) {
      assert.equal(JSON.stringify(explicitContext).includes(secret),false);
    }
  } finally { client.release(); }
});

test('Slice C: externally persisted reconciliation manifest can re-apply anonymization after DB restore loses newer tombstone row', async () => {
  const c = await startedCase(h);
  const source=await h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'復元してはいけない顧客由来の補足情報',external_reference:'customer-ref-001'});
  const tombstoneId=randomUUID();
  await h.db.query(`INSERT INTO diagnosis_deletion_tombstones
    (id,diagnosis_case_id,data_class,target_kind,target_id,action,created_by_user_id)
    VALUES($1,$2,'GENERAL_RAW_DIAGNOSIS','SOURCE_RECORD',$3,'ANONYMIZE',$4)`,[tombstoneId,c.id,source.id,operator.userId]);

  const manifest=await buildDeletionReconciliationManifest(h.pool);
  assert.ok(manifest.entries.some(e=>e.tombstone_id===tombstoneId));
  assert.match(deletionManifestHash(manifest),/^[a-f0-9]{64}$/);

  // Simulate restore from a point before the tombstone was written: data is back, tombstone row is absent.
  await h.db.query('DELETE FROM diagnosis_deletion_tombstones WHERE id=$1',[tombstoneId]);
  const verify=await reconcileDeletionManifest(h.pool,manifest,operator.userId,'VERIFY');
  assert.equal(verify.status,'SUCCEEDED');
  assert.equal((await h.db.query<{content:string}>('SELECT content FROM source_records WHERE id=$1',[source.id])).rows[0]!.content,'復元してはいけない顧客由来の補足情報');

  const applied=await reconcileDeletionManifest(h.pool,manifest,operator.userId,'APPLY');
  assert.equal(applied.status,'SUCCEEDED');
  assert.equal(applied.changed_count,1);
  const restored=await h.db.query<{content:string;external_reference:string|null}>('SELECT content,external_reference FROM source_records WHERE id=$1',[source.id]);
  assert.equal(restored.rows[0]!.content,'[REDACTED]');
  assert.equal(restored.rows[0]!.external_reference,null);

  // Replay is idempotent.
  const replay=await reconcileDeletionManifest(h.pool,manifest,operator.userId,'APPLY');
  assert.equal(replay.status,'SUCCEEDED');
  assert.equal(replay.changed_count,0);
  const runs=await h.db.query<{status:string;mode:string}>('SELECT status,mode FROM diagnosis_restore_reconciliation_runs WHERE manifest_hash=$1 ORDER BY created_at',[deletionManifestHash(manifest)]);
  assert.equal(runs.rows.length,3);
  assert.ok(runs.rows.every(r=>r.status==='SUCCEEDED'));
});

test('Slice C: DELETE tombstoneはtable-by-table destructive semantics未確定のためfail-closed', async () => {
  const c = await startedCase(h);
  const source=await h.workspace.addSource(c.id,operator,'OPERATOR_NOTE',{content:'削除対象'});
  await h.db.query(`INSERT INTO diagnosis_deletion_tombstones
    (id,diagnosis_case_id,data_class,target_kind,target_id,action,created_by_user_id)
    VALUES($1,$2,'GENERAL_RAW_DIAGNOSIS','SOURCE_RECORD',$3,'DELETE',$4)`,[randomUUID(),c.id,source.id,operator.userId]);
  const manifest=await buildDeletionReconciliationManifest(h.pool);
  await assert.rejects(() => reconcileDeletionManifest(h.pool,manifest,operator.userId,'APPLY'),/DELETION_RECONCILIATION_UNSUPPORTED_TARGET/);
  const stillThere=await h.db.query('SELECT id FROM source_records WHERE id=$1',[source.id]);
  assert.equal(stillThere.rows.length,1);
});
