import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WebDevelopmentPartnerLeadRepo} from '../src/services/webDevelopmentPartnerLeadRepo';

test('Web Development Partner repository persists consultation_type',async()=>{let sql='',params:unknown[]=[];const repo=new WebDevelopmentPartnerLeadRepo({query:async(s:string,p:unknown[])=>{sql=s;params=p;return {rows:[{id:'lead-id'}]};}} as never);const id=await repo.insert({companyName:'Company',contactName:'Contact',email:'contact@example.test',consultationType:'new-site',utmSource:'lp'});assert.equal(id,'lead-id');assert.match(sql,/consultation_type/);assert.equal(params[4],'new-site');assert.equal(params[6],'lp');});
