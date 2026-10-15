import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import { createAdminSurveyTestSubmissionRouter } from '../src/routes/adminSurveyTestSubmission';
import type { PublicCustomerSelfSubmissionService } from '../src/services/publicCustomerSelfSubmissionService';

async function probe(staffEmail: string | undefined, body: unknown) {
  let called = false;
  const fake = {
    submitWithTrustedContext: async () => { called = true; return {caseId:'test-case',created:true}; },
  } as unknown as PublicCustomerSelfSubmissionService;
  const app = express();
  app.use(express.json());
  app.use('/admin/test', (req, _res, next) => {
    if (staffEmail) req.staffEmail = staffEmail;
    next();
  }, createAdminSurveyTestSubmissionRouter(fake,new Set(['authorized@atlib.jp'])));
  const server: Server = await new Promise(resolve => {
    const s = app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('NO_ADDRESS');
    const response = await fetch(`http://127.0.0.1:${address.port}/admin/test/submissions`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
    });
    return {status:response.status,called};
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

test('staff test route rejects anonymous requests before calling service',async()=>{
  const result=await probe(undefined,{});
  assert.deepEqual(result,{status:401,called:false});
});
test('staff test route rejects staff outside existing test-case admin allowlist',async()=>{
  const result=await probe('other@atlib.jp',{});
  assert.deepEqual(result,{status:403,called:false});
});
test('staff test route rejects invalid request bodies before calling service',async()=>{
  const result=await probe('authorized@atlib.jp',{});
  assert.deepEqual(result,{status:400,called:false});
});
