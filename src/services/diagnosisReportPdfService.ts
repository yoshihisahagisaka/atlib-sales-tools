import type {Pool} from 'pg';
import {contentHash} from '../domain/diagnosisReport';
import {DiagnosisError} from '../domain/itManagementDiagnosis';
import {approvedReportPdfHtml,type ApprovedPdfReport} from './diagnosisReportPdfHtml';
import {renderApprovedReportPdf} from './diagnosisReportPdfRenderer';
import {DiagnosisReportPdfRepo} from './diagnosisReportPdfRepo';
import type {PdfArtifactIdentity} from './diagnosisReportPdfArtifact';
import type {GcsDiagnosisReportPdfStore} from './diagnosisReportPdfStore';

export class DiagnosisReportPdfService {
 constructor(private readonly pool:Pool,private readonly artifacts:DiagnosisReportPdfRepo,private readonly store:GcsDiagnosisReportPdfStore,private readonly render=renderApprovedReportPdf){}
 private async report(caseId:string,reportId:string):Promise<ApprovedPdfReport>{const {rows}=await this.pool.query<ApprovedPdfReport>('SELECT id,diagnosis_case_id,version,status,content_json,snapshot_json FROM diagnosis_reports WHERE id=$1 AND diagnosis_case_id=$2',[reportId,caseId]);const r=rows[0];if(!r)throw new DiagnosisError(404,'REPORT_NOT_FOUND');approvedReportPdfHtml(r);if(r.snapshot_json!.content_hash!==contentHash(r.content_json))throw new DiagnosisError(422,'PDF_REPORT_SNAPSHOT_INVALID');return r;}
 async generate(caseId:string,reportId:string){const report=await this.report(caseId,reportId),identity:PdfArtifactIdentity={caseId,reportId,version:report.version},hash=report.snapshot_json!.content_hash;const claim=await this.artifacts.claim(identity,hash);if(claim.artifact.status==='READY'){if(claim.artifact.source_content_hash!==hash)throw new DiagnosisError(422,'PDF_ARTIFACT_SOURCE_HASH_MISMATCH');return claim.artifact;}if(!claim.acquired)return claim.artifact;try{const existing=await this.store.readExisting(identity,hash);const stored=existing?.stored??await this.store.putImmutable(identity,await this.render(report),hash);return await this.artifacts.ready(identity,claim.generationToken!,stored);}catch(e){await this.artifacts.failed(identity,claim.generationToken!,errorCode(e));throw e;}}
 async status(caseId:string,reportId:string){const report=await this.report(caseId,reportId);return this.artifacts.read({caseId,reportId,version:report.version});}
 async download(caseId:string,reportId:string){const artifact=await this.status(caseId,reportId);if(!artifact||artifact.status!=='READY'||!artifact.object_key||!artifact.pdf_sha256)throw new DiagnosisError(409,'PDF_NOT_READY');return this.store.getVerified(artifact.object_key,artifact.pdf_sha256);}
}
function errorCode(e:unknown){const s=e instanceof Error?e.message:'PDF_GENERATION_FAILED';return /^[A-Z0-9_]{1,100}$/.test(s)?s:'PDF_GENERATION_FAILED';}
