import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import { createAdminSurveyKpiSummaryRouter } from '../src/routes/adminSurveyKpiSummary';
import type { SurveyMonthlyCounterRepo } from '../src/services/surveyMonthlyCounterRepo';

test('read-only summary uses coverage start for cumulative history and atLIB fiscal year', async () => {
  const calls: string[][] = [];
  const repo = {
    listMonthly: async (from: string,to: string) => {
      calls.push([from,to]);
      return [
        {month:'2024-02-01',initiativeId:null,startedCount:2,completedCount:1},
        {month:'2026-10-01',initiativeId:null,startedCount:3,completedCount:2},
      ];
    },
  } as unknown as SurveyMonthlyCounterRepo;
  const app = express();
  app.use('/admin',createAdminSurveyKpiSummaryRouter(repo,new Date('2024-02-01T00:00:00Z')));
  const server: Server = await new Promise(resolve=>{
    const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try {
    const address=server.address();
    if(!address || typeof address==='string') throw new Error('NO_ADDRESS');
    const response=await fetch(`http://127.0.0.1:${address.port}/admin/summary`);
    assert.equal(response.status,200);
    const body=await response.json() as {fiscalYearStartMonth:number,summary:{cumulative:{started:number,completed:number}}};
    assert.equal(body.fiscalYearStartMonth,2);
    assert.deepEqual(body.summary.cumulative.started,5);
    assert.deepEqual(body.summary.cumulative.completed,3);
    assert.equal(calls[0]?.[0],'2024-02-01');
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
