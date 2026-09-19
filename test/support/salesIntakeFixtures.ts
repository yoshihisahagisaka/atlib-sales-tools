import type {Pool} from 'pg';
import {SalesIntakeRepo} from '../../src/services/salesIntakeRepo';
import {operator} from './preparationFixtures';
export async function consentedSalesCase(pool:Pool,customer:unknown){
 const repo=new SalesIntakeRepo(pool),record=await repo.save(operator,{customer,customerStatements:[],unknowns:[],salespersonNotes:[],surveyAnswers:{}});
 return repo.consentAndStart(record.id,operator,{expectedVersion:record.version,customerAgreed:true,customerReference:'Synthetic customer'});
}
