import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { PiraIntakeError, PiraIntakeService, type PiraContext, type IntakeForm } from '../src/piraIntake/piraIntakeService';
import type { PiraJwtClaims } from '../src/piraIntake/piraJwtVerifier';

const context: PiraContext = { serviceId: 'pira-union', initiativeCode: 'pira-union', kind: 'UNION' };
const claims: PiraJwtClaims = { iss: 'issuer', aud: 'pira-union', sub: 'session', jti: 'new-jti', iat: 1, exp: 9_999_999_999, email: 'verified@example.test' };
const form: IntakeForm = { companyName: 'テスト株式会社', contactName: '担当者', websiteUrl: 'https://example.test/', unionName: '国連協', address: '東京都', accepted: true, consentVersion: 'PIRA-UNION-CONSENT-V1.0', idempotencyKey: '00000000-0000-4000-8000-000000000001' };

type Operation = 'CREATE' | 'UPDATE';
function faultyPool(sqlState: string) {
  let rolledBack = false;
  const client = {
    async query(sql: string) {
      if (sql === 'ROLLBACK') rolledBack = true;
      if (sql.includes('INSERT INTO pira.pira_consumed_jti')) throw Object.assign(new Error('database failure'), { code: sqlState });
      if (sql.includes('SELECT receipt_id,payload_hash')) return { rows: [] };
      if (sql.includes('SELECT 1 FROM pira.pira_submission')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT submission_id,initiative_id')) return { rows: [{ submission_id: 'submission', initiative_id: 'initiative', initiative_kind: 'UNION', verified_email: claims.email, state: 'RECEIVED' }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = {
    async query() { return { rows: [{ initiative_id: 'initiative', initiative_kind: 'UNION' }] }; },
    async connect() { return client; },
  } as unknown as Pool;
  return { pool, wasRolledBack: () => rolledBack };
}

for (const operation of ['CREATE', 'UPDATE'] as const satisfies readonly Operation[]) {
  test(`${operation}: unique jti violation maps to JWT_REPLAYED`, async () => {
    const { pool, wasRolledBack } = faultyPool('23505');
    const service = new PiraIntakeService(pool);
    await assert.rejects(
      () => operation === 'CREATE' ? service.create(context, claims, form) : service.updateState(context, claims, 'receipt', 'ANSWERING'),
      (error: unknown) => error instanceof PiraIntakeError && error.status === 409 && error.code === 'JWT_REPLAYED',
    );
    assert.equal(wasRolledBack(), true);
  });

  test(`${operation}: non-unique database failure must not masquerade as JWT_REPLAYED`, async () => {
    const { pool, wasRolledBack } = faultyPool('57P01');
    const service = new PiraIntakeService(pool);
    await assert.rejects(
      () => operation === 'CREATE' ? service.create(context, claims, form) : service.updateState(context, claims, 'receipt', 'ANSWERING'),
      (error: unknown) => error instanceof Error && (error as Error & { code?: string }).code === '57P01' && error.message === 'database failure',
    );
    assert.equal(wasRolledBack(), true);
  });
}
