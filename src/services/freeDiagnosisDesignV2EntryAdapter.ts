import type { CurrentStructuredStateV2 } from '../domain/freeDiagnosisDesignV2';
import type { PoolClient } from 'pg';
import {
  FreeDiagnosisDesignV2PersistenceRepo,
  type PostHearingAnalysisViewV2,
} from './freeDiagnosisDesignV2PersistenceRepo';

export type DesignV2EntryChannel = 'CUSTOMER_SELF' | 'STAFF_PROXY';

export class FreeDiagnosisDesignV2EntryAdapterError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = 'FreeDiagnosisDesignV2EntryAdapterError';
  }
}

export interface CompleteDesignV2EntryInput {
  caseId: string;
  answers: CurrentStructuredStateV2;
  surveyVersion: string;
  entryChannel: DesignV2EntryChannel;
  answeredByRole: string;
  /** Null for a customer self submission; the authenticated staff principal for proxy entry. */
  enteredByUserId: string | null;
  /** Audit actor.  For staff proxy this must be the same authenticated staff principal. */
  actor: string;
  submittedAt?: Date;
}

export interface CompleteDesignV2EntryResult {
  workspace: PostHearingAnalysisViewV2;
  caseStatus: 'INTAKE_COMPLETED' | 'BOOKING_PENDING';
}

/**
 * The single application boundary for a completed canonical Design v2 survey.
 * It deliberately does not create Company, Contact, Sales Activity, or any UI
 * concern; Customer Self and Staff Proxy adapt those concerns before calling it.
 */
export class FreeDiagnosisDesignV2EntryAdapter {
  constructor(private readonly persistence: FreeDiagnosisDesignV2PersistenceRepo) {}

  async complete(input: CompleteDesignV2EntryInput): Promise<CompleteDesignV2EntryResult> {
    this.validate(input);
    const { caseStatusTransitions, caseStatus } = this.initialStatus(input.entryChannel);
    const workspace = await this.persistence.initializeDesignV2FromCompletedSurvey({
      caseId: input.caseId, answers: input.answers, surveyVersion: input.surveyVersion,
      entryChannel: input.entryChannel, answeredByRole: input.answeredByRole,
      enteredByUserId: input.enteredByUserId, submittedAt: input.submittedAt, actor: input.actor,
      caseStatusTransitions,
    });
    return { workspace, caseStatus };
  }

  async completeInTransaction(client: PoolClient, input: CompleteDesignV2EntryInput): Promise<CompleteDesignV2EntryResult> {
    this.validate(input);
    const { caseStatusTransitions, caseStatus } = this.initialStatus(input.entryChannel);
    const workspace = await this.persistence.initializeDesignV2FromCompletedSurveyInTransaction(client, {
      caseId: input.caseId, answers: input.answers, surveyVersion: input.surveyVersion,
      entryChannel: input.entryChannel, answeredByRole: input.answeredByRole,
      enteredByUserId: input.enteredByUserId, submittedAt: input.submittedAt, actor: input.actor,
      caseStatusTransitions,
    });
    return { workspace, caseStatus };
  }

  private validate(input: CompleteDesignV2EntryInput): void {
    if (input.entryChannel !== 'CUSTOMER_SELF' && input.entryChannel !== 'STAFF_PROXY') {
      throw new FreeDiagnosisDesignV2EntryAdapterError(422, 'INVALID_ENTRY_CHANNEL');
    }
    if (input.entryChannel === 'CUSTOMER_SELF' && input.enteredByUserId != null) {
      throw new FreeDiagnosisDesignV2EntryAdapterError(422, 'CUSTOMER_SELF_MUST_NOT_HAVE_ENTERED_BY_USER');
    }
    if (input.entryChannel === 'STAFF_PROXY' && (!input.enteredByUserId || input.enteredByUserId !== input.actor)) {
      throw new FreeDiagnosisDesignV2EntryAdapterError(422, 'STAFF_PROXY_REQUIRES_AUTHENTICATED_ENTERED_BY_USER');
    }

  }

  private initialStatus(entryChannel: DesignV2EntryChannel): {
    caseStatusTransitions: Array<'INTAKE_COMPLETED' | 'BOOKING_PENDING'>;
    caseStatus: 'INTAKE_COMPLETED' | 'BOOKING_PENDING';
  } {
    const caseStatusTransitions: Array<'INTAKE_COMPLETED' | 'BOOKING_PENDING'> = entryChannel === 'CUSTOMER_SELF'
      ? ['INTAKE_COMPLETED', 'BOOKING_PENDING']
      : ['INTAKE_COMPLETED'];
    const caseStatus: 'INTAKE_COMPLETED' | 'BOOKING_PENDING' = entryChannel === 'CUSTOMER_SELF'
      ? 'BOOKING_PENDING'
      : 'INTAKE_COMPLETED';
    return { caseStatusTransitions, caseStatus };
  }
}
