import { z } from 'zod';
import { DiagnosisError } from './itManagementDiagnosis';

export const PROMPT_VERSION = 'pre-diagnosis-organizer-v1';
export const POLICY_VERSION = 'free-diagnosis-v1';
export const PROPOSAL_TYPES = ['THEME','QUESTION','UNKNOWN','HYPOTHESIS','EVIDENCE_CANDIDATE'] as const;
export const PLAN_TYPES = ['QUESTION','CONFIRMATION','FOLLOW_UP','EVIDENCE_CANDIDATE_CHECK'] as const;
const text = z.string().trim().min(1).max(2000);
const sourceSchema = z.object({ source_ref_type: z.literal('SURVEY_RESPONSE'), source_ref_id: z.string().uuid(), relation: z.enum(['SUPPORTS','CONTRADICTS','RELATED']) }).strict();
export const aiThemeSchema = z.object({
  title: text.max(200), future_relation: text, why_it_matters: text,
  available_context: z.array(z.object({ text, source_refs: z.array(sourceSchema).min(1).max(10) }).strict()).min(1).max(10),
  unknowns: z.array(z.object({ text, unknown_type: z.literal('NOT_YET_CONFIRMED') }).strict()).max(10),
  hypotheses: z.array(z.object({ text }).strict()).max(10),
  recommended_questions: z.array(z.object({ text, purpose: text }).strict()).max(10),
  evidence_candidates: z.array(z.object({ text, purpose: text }).strict()).max(10),
}).strict();
export const organizerOutputSchema = z.object({ themes: z.array(aiThemeSchema).min(1).max(5) }).strict();
export type OrganizerOutput = z.infer<typeof organizerOutputSchema>;
export type SourceRef = z.infer<typeof sourceSchema>;

// Native structured-output JSON Schema, matching the existing SDK + zod v3 pattern.
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string' };
const array = (items: unknown) => ({ type: 'array', items });
export const ORGANIZER_JSON_SCHEMA = object({ themes: array(object({
  title: string, future_relation: string, why_it_matters: string,
  available_context: array(object({ text: string, source_refs: array(object({ source_ref_type: { type: 'string', enum: ['SURVEY_RESPONSE'] },
    source_ref_id: string, relation: { type: 'string', enum: ['SUPPORTS','CONTRADICTS','RELATED'] } })) })),
  unknowns: array(object({ text: string, unknown_type: { type: 'string', enum: ['NOT_YET_CONFIRMED'] } })),
  hypotheses: array(object({ text: string })), recommended_questions: array(object({ text: string, purpose: string })),
  evidence_candidates: array(object({ text: string, purpose: string })),
})) });

export function validateOrganizerOutput(raw: unknown, allowedSourceIds: Set<string>): OrganizerOutput {
  const parsed = organizerOutputSchema.safeParse(raw);
  if (!parsed.success) throw new DiagnosisError(422, 'AI_OUTPUT_SCHEMA_INVALID');
  for (const theme of parsed.data.themes) {
    for (const context of theme.available_context) for (const ref of context.source_refs) {
      if (!allowedSourceIds.has(ref.source_ref_id)) throw new DiagnosisError(422, 'AI_SOURCE_REF_INVALID');
    }
    // These are rejection guards, never customer-facing diagnosis/warning generation.
    const content = JSON.stringify(theme);
    if (/\b(?:FACT|CONFIRMED_FACT|score|maturity|rating|final_root_cause)\b/i.test(content)) throw new DiagnosisError(422, 'AI_OUTPUT_BOUNDARY_VIOLATION');
    if (/(原因は[^。?？]{1,100}です|を導入すべき|御社は管理できていません)/.test(content)) throw new DiagnosisError(422, 'AI_OUTPUT_BOUNDARY_VIOLATION');
    for (const candidate of theme.evidence_candidates) {
      if (/(最新|正確|妥当|適切|一致|検証済み|verified|validated|accurate)/i.test(candidate.text + candidate.purpose)) {
        throw new DiagnosisError(422, 'AI_EVIDENCE_BOUNDARY_VIOLATION');
      }
    }
  }
  return parsed.data;
}

export const humanThemeSchema = z.object({ title: text.max(200), description: z.string().max(2000).default(''), future_relation: text }).strict();
export const humanPlanSchema = z.object({ text, purpose: z.string().max(2000).default(''), item_type: z.enum(PLAN_TYPES), diagnosis_theme_id: z.string().uuid().nullable().default(null) }).strict();
export const orderSchema = z.object({ theme_ids: z.array(z.string().uuid()).max(100), plan_item_ids: z.array(z.string().uuid()).max(500) }).strict();
export const confirmSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export type HumanTheme = z.infer<typeof humanThemeSchema>;
export type HumanPlan = z.infer<typeof humanPlanSchema>;
