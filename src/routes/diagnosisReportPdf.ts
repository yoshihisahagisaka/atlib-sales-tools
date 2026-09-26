import {Router} from 'express';
import {z} from 'zod';
import {DiagnosisError} from '../domain/itManagementDiagnosis';
import type {DiagnosisReportPdfService} from '../services/diagnosisReportPdfService';
import {caseId,diagnosisHandler} from './itManagementDiagnosis';
const reportId=(raw:unknown)=>{const p=z.string().uuid().safeParse(raw);if(!p.success)throw new DiagnosisError(400,'REPORT_ID_INVALID');return p.data;};
export function createDiagnosisReportPdfRouter(service:DiagnosisReportPdfService){const r=Router();
 r.post('/cases/:id/reports/:reportId/pdf',diagnosisHandler(async(req,res)=>{res.status(202).json(await service.generate(caseId(req),reportId(req.params.reportId)));}));
 r.get('/cases/:id/reports/:reportId/pdf',diagnosisHandler(async(req,res)=>{res.json(await service.status(caseId(req),reportId(req.params.reportId)));}));
 r.get('/cases/:id/reports/:reportId/pdf/download',diagnosisHandler(async(req,res)=>{const pdf=await service.download(caseId(req),reportId(req.params.reportId));res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline');res.setHeader('Cache-Control','no-store');res.send(pdf);}));return r;}
