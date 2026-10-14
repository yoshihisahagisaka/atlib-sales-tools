import { z } from 'zod';

/**
 * Public anonymous survey telemetry input contract.
 * The browser must never decide whether a survey event is a staff test.
 * No PII, answers, Case ID, or applicant submission idempotency key accepted.
 */
export const anonymousSurveyEventInputSchema = z.object({
  eventType: z.enum(['SURVEY_STARTED', 'SURVEY_COMPLETED']),
  surveyInstanceId: z.string().uuid(),
  attribution: z.object({
    source: z.string().trim().min(1).max(200).nullable().optional(),
    medium: z.string().trim().min(1).max(200).nullable().optional(),
    campaign: z.string().trim().min(1).max(200).nullable().optional(),
    content: z.string().trim().min(1).max(200).nullable().optional(),
    term: z.string().trim().min(1).max(200).nullable().optional(),
  }).strict().optional(),
}).strict();

export type AnonymousSurveyEventInput = z.infer<typeof anonymousSurveyEventInputSchema>;

export type AnonymousSurveyEventContext = {
  /** Only server-validated staff session / route context may set this. */
  mode: 'PUBLIC' | 'STAFF_TEST';
  staffAuthenticated: boolean;
};

export type ValidatedAnonymousSurveyEvent = AnonymousSurveyEventInput & {
  isTest: boolean;
};

/**
 * Derive test designation exclusively from trusted server context.
 * A forged isTest field is rejected by the strict input schema.
 */
export function validateAnonymousSurveyEvent(
  raw: unknown,
  context: AnonymousSurveyEventContext,
): ValidatedAnonymousSurveyEvent {
  const input = anonymousSurveyEventInputSchema.parse(raw);
  if (context.mode === 'STAFF_TEST' && !context.staffAuthenticated) {
    throw new Error('STAFF_AUTH_REQUIRED_FOR_TEST');
  }
  return { ...input, isTest: context.mode === 'STAFF_TEST' };
}

/** Idempotency key for database uniqueness: one event type per survey instance. */
export function anonymousSurveyEventDedupKey(event: ValidatedAnonymousSurveyEvent): string {
  return `${event.surveyInstanceId}:${event.eventType}`;
}
