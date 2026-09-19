import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import express from 'express';
import 'pino-http';
import '../src/middleware/staffAuth';
import {createAssessmentScopeClarificationRouter} from '../src/routes/assessmentScopeClarification';
import {AssessmentScopeClarificationRepo} from '../src/services/assessmentScopeClarificationRepo';
import type {Pool} from 'pg';

for(const action of ['resolve','not-required'] as const)test(`clarification ${action}: UUID route boundary rejects malformed ID before repository call`,async()=>{
 const calls:unknown[][]=[];
 const repo=new AssessmentScopeClarificationRepo({} as Pool);
 repo.resolve=async(...args)=>{calls.push(args);};
 repo.notRequired=async(...args)=>{calls.push(args);};
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.staffEmail='operator@atlib.jp';next();});
 app.use(createAssessmentScopeClarificationRouter(repo));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{
  const caseId=randomUUID(),key=randomUUID(),body=action==='resolve'?{expectedVersion:1,sourceRecordId:randomUUID()}:{expectedVersion:1,reason:'Human decision'};
  const post=(id:string)=>fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/cases/${caseId}/assessment-scope-clarifications/${id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post('invalid')).status,400);assert.equal(calls.length,0);
  assert.equal((await post(key)).status,204);assert.equal(calls.length,1);
  assert.deepEqual(calls[0],[caseId,key,{kind:'STAFF',userId:'operator@atlib.jp'},body]);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
