import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export class TestCaseManagementError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

export type TestCaseConfirmation = {
  caseId: string;
  companyName: string;
  receivedAt: string;
};

export class TestCaseManagementRepo {
  constructor(private readonly pool: Pool) {}

  async setDesignation(input: {
    caseId: string;
    designate: boolean;
    reason: string;
    actor: string;
    confirmation: TestCaseConfirmation;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.loadForUpdate(client, input.caseId);
      if (!current) throw new TestCaseManagementError(404, 'CASE_NOT_FOUND');
      if (input.confirmation.caseId !== current.case_id
        || input.confirmation.companyName !== current.company_name
        || new Date(input.confirmation.receivedAt).toISOString() !== new Date(current.received_at).toISOString()) {
        throw new TestCaseManagementError(409, 'CASE_CONFIRMATION_MISMATCH');
      }
      if (current.is_internal_test === input.designate) {
        throw new TestCaseManagementError(409, input.designate ? 'CASE_ALREADY_DESIGNATED_TEST' : 'CASE_NOT_DESIGNATED_TEST');
      }
      await client.query('UPDATE it_management_diagnosis_case_v2 SET is_internal_test=$2,updated_at=now() WHERE id=$1', [input.caseId, input.designate]);
      await client.query(
        `INSERT INTO it_management_diagnosis_test_case_designation_audit
          (id,case_id,action,actor_user_id,reason) VALUES($1,$2,$3,$4,$5)`,
        [randomUUID(), input.caseId, input.designate ? 'DESIGNATED' : 'RELEASED', input.actor, input.reason],
      );
      await client.query('COMMIT');
      return { caseId: input.caseId, isTestCase: input.designate };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  private async loadForUpdate(client: PoolClient, caseId: string) {
    const { rows } = await client.query<{
      case_id: string; company_name: string; received_at: Date; is_internal_test: boolean;
    }>(`SELECT k.id AS case_id,c.name AS company_name,k.created_at AS received_at,k.is_internal_test
          FROM it_management_diagnosis_case_v2 k JOIN company c ON c.id=k.company_id
         WHERE k.id=$1 FOR UPDATE OF k`, [caseId]);
    return rows[0] ?? null;
  }
}
