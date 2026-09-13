import type { PoolClient } from 'pg';
import { buildInterviewAssistantContext,interviewSourceKeys } from './interviewAssistantContext';
/** Reuse the bounded raw-context whitelist, never read future Human Review results. */
export async function buildPostDiagnosisContext(c:PoolClient,id:string){
 const context=await buildInterviewAssistantContext(c,id);
 return {...context,recent_suggestions:context.recent_suggestions.filter(p=>p.status!=='REJECTED')};
}
export type PostDiagnosisContext=Awaited<ReturnType<typeof buildPostDiagnosisContext>>;
export const postDiagnosisSourceKeys=interviewSourceKeys;
