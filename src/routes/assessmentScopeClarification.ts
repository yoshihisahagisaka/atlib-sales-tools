import {Router} from 'express';
import {z} from 'zod';
import {DiagnosisError} from '../domain/itManagementDiagnosis';
import type {AssessmentScopeClarificationRepo} from '../services/assessmentScopeClarificationRepo';
import {caseId,diagnosisHandler,staffActor} from './itManagementDiagnosis';

const createSchema=z.object({expectedVersion:z.number().int().nonnegative(),dimension:z.enum(['TARGET_SCOPE','INFORMATION_LOCATION','MANAGEMENT_OWNER','EVIDENCE_ACCESS','INTERVIEW_SCOPE','SPECIAL_REQUIREMENT']),promptJa:z.string().min(1).max(500),reasonJa:z.string().min(1).max(1000),sourceRefs:z.array(z.unknown()).optional()});
const resolveSchema=z.object({expectedVersion:z.number().int().nonnegative(),sourceRecordId:z.string().uuid()});
const notRequiredSchema=z.object({expectedVersion:z.number().int().nonnegative(),reason:z.string().min(1).max(1000)});

export function createAssessmentScopeClarificationRouter(repo:AssessmentScopeClarificationRepo){
 const r=Router(),base='/cases/:id/assessment-scope-clarifications';
 r.get(base,diagnosisHandler(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await repo.read(caseId(req),staffActor(req)));}));
 r.post(base,diagnosisHandler(async(req,res)=>{const p=createSchema.safeParse(req.body);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');res.status(201).json(await repo.create(caseId(req),staffActor(req),p.data));}));
 r.post(base+'/:clarificationId/resolve',diagnosisHandler(async(req,res)=>{const p=resolveSchema.safeParse(req.body);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');await repo.resolve(caseId(req),req.params.clarificationId,staffActor(req),p.data);res.status(204).end();}));
 r.post(base+'/:clarificationId/not-required',diagnosisHandler(async(req,res)=>{const p=notRequiredSchema.safeParse(req.body);if(!p.success)throw new DiagnosisError(422,'入力内容を確認してください。');await repo.notRequired(caseId(req),req.params.clarificationId,staffActor(req),p.data);res.status(204).end();}));
 return r;
}
