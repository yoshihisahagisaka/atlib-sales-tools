import assert from 'node:assert/strict';
import test from 'node:test';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {runMigrations} from '../src/db/migrate';
import {SecumieGeneralLeadRepo,GENERAL_CONSENT_VERSION} from '../src/services/secumieGeneralLeadRepo';
import {SecumieGeneralAdminRepo} from '../src/services/secumieGeneralAdminRepo';

test('isolated PostgreSQL 16: durable general intake, replay, independent diagnosis and consultation state',async()=>{
 assert.equal(process.env.SECUMIE_GENERAL_ISOLATED_TEST,'1','isolated test service only');
 const cfg={host:'127.0.0.1',port:55439,database:'secumie_general_staging',max:1};
 const owner=new Pool({...cfg,user:'secumie_general_migration_staging',password:'synthetic-migration-password'});
 const writer=new Pool({...cfg,user:'secumie_general_writer_staging',password:'synthetic-writer-password'});
 const staff=new Pool({...cfg,user:'secumie_general_staff_staging',password:'synthetic-staff-password'});
 try{
  await runMigrations(owner,path.resolve('design/secumie-general/migrations'));
  // Isolated acceptance ACL only. Actual deployment grant/role preflight is separate.
  await owner.query(`GRANT USAGE ON SCHEMA secumie_general TO secumie_general_writer_staging,secumie_general_staff_staging;
   GRANT INSERT(kind,idempotency_key,payload_hash,receipt_hash,receipt_expires_at,company_name,person_name,email,department,position,phone,target_url,consent_version,sales_contact_allowed),
   SELECT(id,kind,idempotency_key,payload_hash,receipt_hash,receipt_expires_at,diagnosis_status,diagnosis_result),
   UPDATE(diagnosis_status,diagnosis_result,completed_at,updated_at) ON secumie_general.lead TO secumie_general_writer_staging;
   GRANT SELECT ON secumie_general.lead TO secumie_general_staff_staging;
   GRANT UPDATE(sales_status,staff_note,updated_at) ON secumie_general.lead TO secumie_general_staff_staging;
   GRANT INSERT ON secumie_general.staff_change TO secumie_general_staff_staging;`);
  const repo=new SecumieGeneralLeadRepo(writer,'synthetic-receipt-key-not-for-production-0001');
  const admin=new SecumieGeneralAdminRepo(staff);
  const input={idempotencyKey:randomUUID(),companyName:'Synthetic Co',personName:'Synthetic Person',email:'synthetic@example.invalid',accepted:true as const};
  const first=await repo.begin('WEB',input,'https://example.org');
  assert.equal(first.created,true);
  assert.equal(first.status,'RECEIVED');
  const replay=await repo.begin('WEB',input,'https://example.org/');
  assert.deepEqual(replay,{...first,created:false});
  await assert.rejects(repo.begin('WEB',{...input,companyName:'Other'},'https://example.org/'),/LEAD_IDEMPOTENCY_CONFLICT/);
  await assert.rejects(repo.begin('INSIGHT',input),/LEAD_IDEMPOTENCY_CONFLICT/);
  const insight=await repo.begin('INSIGHT',{...input,idempotencyKey:randomUUID(),salesContactAllowed:true});
  assert.notEqual(insight.id,first.id);
  assert.equal(await repo.complete('INSIGHT',first.receipt,{synthetic:true}),false);
  assert.equal(await repo.fail('WEB',first.receipt),true);
  assert.equal(await repo.complete('WEB',first.receipt,{synthetic:true}),true);
  assert.equal(await repo.complete('WEB',first.receipt,{synthetic:true}),true);
  assert.equal(await repo.complete('WEB',first.receipt,{synthetic:false}),false);
  assert.equal(await repo.fail('WEB',first.receipt),false);
  assert.deepEqual(await repo.getCompleted('WEB',first.receipt),{synthetic:true});
  assert.equal(await repo.getCompleted('INSIGHT',first.receipt),null);
  assert.equal(await repo.complete('INSIGHT',insight.receipt,{answers:['synthetic']}),true);
  const list=await admin.list({limit:50,offset:0});
  assert.equal(list.total,2);assert.equal(list.summary.web_completed,1);assert.equal(list.summary.insight_completed,1);assert.equal(list.summary.consultations,0);
  const detail=await admin.detail('WEB',first.id);assert.equal(detail.consent_version,GENERAL_CONSENT_VERSION);
  assert.equal(detail.sales_contact_allowed,false);assert.equal(detail.consultation_status,'NONE');
  assert.equal('receipt_hash' in detail,false);
  assert.equal(await admin.detail('INSIGHT',first.id),null);
  assert.equal(await admin.updateSales('WEB',first.id,{status:'CONTACTED',note:'synthetic',actor:'staff@example.invalid'}),true);
  assert.equal((await admin.detail('WEB',first.id)).diagnosis_status,'COMPLETED');
  assert.equal((await admin.detail('WEB',first.id)).consultation_status,'NONE');
  await assert.rejects(writer.query('SELECT staff_note FROM secumie_general.lead'),/permission denied/);
  await assert.rejects(writer.query("UPDATE secumie_general.lead SET sales_status='WON'"),/permission denied/);
  await assert.rejects(staff.query('DELETE FROM secumie_general.lead'),/permission denied/);
  await owner.query("UPDATE secumie_general.lead SET receipt_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[insight.id]);
  assert.equal(await repo.complete('INSIGHT',insight.receipt,{answers:['synthetic']}),false);
  await assert.rejects(repo.begin('INSIGHT',{...input,idempotencyKey:(await owner.query('SELECT idempotency_key FROM secumie_general.lead WHERE id=$1',[insight.id])).rows[0].idempotency_key,salesContactAllowed:true}),/RECEIPT_EXPIRED/);
 }finally{await Promise.allSettled([owner.end(),writer.end(),staff.end()]);}
});
