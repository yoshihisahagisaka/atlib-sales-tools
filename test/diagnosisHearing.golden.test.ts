import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { createDiagnosisHarness } from './support/diagnosisHarness';
import {
  SURVEY_QUESTIONS,
  type Actor,
} from '../src/domain/itManagementDiagnosis';
import { DiagnosisHearingRepo } from '../src/services/diagnosisHearingRepo';

let h: Awaited<ReturnType<typeof createDiagnosisHarness>>;
let hearing: DiagnosisHearingRepo;

const staff: Actor = {
  kind: 'STAFF',
  userId: 'operator@atlib.jp',
};

before(async () => {
  h = await createDiagnosisHarness();

  // Apply 019 only to this disposable PGlite database.
  const migration = path.resolve(
    __dirname,
    '../migrations/019_diagnosis_hearing_records.sql',
  );

  await h.db.exec(fs.readFileSync(migration, 'utf8'));
  hearing = new DiagnosisHearingRepo(h.pool);
});

after(async () => {
  await h?.close();
});

test('Phase 1: hearing revisions remain separate from original survey responses', async () => {
  const response = await fetch(
    `${h.url}/api/it-management-diagnosis/cases`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.0.2.91',
      },
      body: JSON.stringify({
        companyName: 'Phase1 Test Company',
        contactName: 'Test Contact',
        email: 'phase1@example.test',
        phone: '03-0000-0000',
      }),
    },
  );

  assert.equal(response.status, 201);
  const created = await response.json() as {
    id: string;
    access_token: string;
  };

  const caseId = created.id;
  const customer: Actor = {
    kind: 'CUSTOMER',
    token: created.access_token,
  };

  const question = SURVEY_QUESTIONS.find(
    q => q.answer_type === 'SINGLE_SELECT' && q.options_json?.length,
  );

  assert.ok(question, 'A single-select question must exist');

  await h.repo.startSurvey(caseId, customer);
  await h.repo.submitResponse(
    caseId,
    question.question_code,
    question.version,
    question.options_json![0]!,
    customer,
  );

  const originalBefore = (
    await h.pool.query(
      `SELECT *
         FROM survey_responses
        WHERE diagnosis_case_id=$1
        ORDER BY id`,
      [caseId],
    )
  ).rows;

  assert.equal(originalBefore.length, 1);

  const input = {
    questionCode: question.question_code,
    questionVersion: question.version,
    expectedVersion: null,
    answer: question.options_json![0]!,
    statement: 'Customer statement recorded during hearing',
    unknownNote: 'Confirmation is still required',
  };

  const first = await hearing.save(caseId, staff, input);
  assert.equal(first.version, 1);

  const read = await hearing.read(caseId, staff);
  assert.equal(read.hearing.length, 1);
  assert.equal(read.originalResponses.length, 1);
  assert.equal(read.hearing[0].statement, input.statement);

  const firstHistory = await hearing.revisions(
    caseId,
    question.question_code,
    staff,
  );

  assert.equal(firstHistory.length, 1);
  assert.equal(firstHistory[0].operation, 'CREATE');
  assert.equal(firstHistory[0].version, 1);
  assert.equal(firstHistory[0].previous_json, null);

  // Correction without a reason must fail.
  await assert.rejects(
    hearing.save(caseId, staff, {
      ...input,
      expectedVersion: 1,
      statement: 'Corrected statement',
    }),
    (error: unknown) => (error as { status?: number }).status === 422,
  );

  const corrected = await hearing.save(caseId, staff, {
    ...input,
    expectedVersion: 1,
    statement: 'Corrected statement',
    unknownNote: '',
    reason: 'Confirmed with customer during the meeting',
  });

  assert.equal(corrected.id, first.id);
  assert.equal(corrected.version, 2);

  // Stale update must not overwrite the correction.
  await assert.rejects(
    hearing.save(caseId, staff, {
      ...input,
      expectedVersion: 1,
      statement: 'Stale update',
      reason: 'Attempt from an outdated screen',
    }),
    (error: unknown) => (error as { status?: number }).status === 409,
  );

  const history = await hearing.revisions(
    caseId,
    question.question_code,
    staff,
  );

  assert.equal(history.length, 2);
  assert.deepEqual(history.map(r => r.operation), ['CREATE', 'CORRECT']);
  assert.deepEqual(history.map(r => r.version), [1, 2]);
  assert.equal(
    history[1].reason,
    'Confirmed with customer during the meeting',
  );
  assert.equal(
    history[1].previous_json.statement,
    input.statement,
  );
  assert.equal(
    history[1].current_json.statement,
    'Corrected statement',
  );

  const latest = await hearing.read(caseId, staff);
  assert.equal(latest.hearing[0].version, 2);
  assert.equal(latest.hearing[0].statement, 'Corrected statement');

  // The question version must match the version pinned to the Case.
  await assert.rejects(
    hearing.save(caseId, staff, {
      ...input,
      questionVersion: 999,
      expectedVersion: null,
    }),
    (error: unknown) => (error as { status?: number }).status === 422,
  );

  // Hearing writes must never alter the original survey rows.
  const originalAfter = (
    await h.pool.query(
      `SELECT *
         FROM survey_responses
        WHERE diagnosis_case_id=$1
        ORDER BY id`,
      [caseId],
    )
  ).rows;

  assert.deepEqual(originalAfter, originalBefore);
});

test('Phase 1 HTTP: staff authentication, command guard, validation and read', async () => {
  const express = (await import('express')).default;
  const cookieParser = (await import('cookie-parser')).default;
  const { StaffAuthService } = await import('../src/services/staffAuthService');
  const { requireStaffAuth } = await import('../src/middleware/staffAuth');
  const { createDiagnosisHearingRouter } = await import('../src/routes/diagnosisHearing');

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const auth = new StaffAuthService('disposable-test-key-not-a-production-secret');

  app.use(
    '/api/admin/it-management-diagnosis',
    requireStaffAuth(auth),
    createDiagnosisHearingRouter(hearing),
  );

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));

  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const base = `http://127.0.0.1:${address.port}/api/admin/it-management-diagnosis`;

  try {
    const createdResponse = await fetch(
      `${h.url}/api/it-management-diagnosis/cases`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.0.2.92',
        },
        body: JSON.stringify({
          companyName: 'Phase1 HTTP Test Company',
          contactName: 'Test Contact',
          email: 'phase1-http@example.test',
          phone: '03-0000-0000',
        }),
      },
    );

    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { id: string };
    const endpoint = `${base}/cases/${created.id}/hearing`;

    const question = SURVEY_QUESTIONS.find(
      q => q.answer_type === 'SINGLE_SELECT' && q.options_json?.length,
    );
    assert.ok(question);

    const payload = {
      questionCode: question.question_code,
      questionVersion: question.version,
      expectedVersion: null,
      answer: question.options_json![0]!,
      statement: 'HTTP hearing statement',
      unknownNote: '',
    };

    const send = (
      method: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ) => fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });

    const authorized = {
      Cookie: h.staffCookie,
      'X-Diagnosis-Command': '1',
    };

    // No staff session.
    const unauthenticated = await send('GET');
    assert.equal(unauthenticated.status, 401);

    // Staff session, but no command header.
    const missingCommand = await send('PUT', payload, {
      Cookie: h.staffCookie,
    });
    assert.equal(missingCommand.status, 403);

    // Cross-site requests must be rejected even with a command header.
    const crossSite = await send('PUT', payload, {
      ...authorized,
      'Sec-Fetch-Site': 'cross-site',
    });
    assert.equal(crossSite.status, 403);

    // Invalid request body.
    const invalid = await send('PUT', {
      ...payload,
      unexpectedField: true,
    }, authorized);
    assert.equal(invalid.status, 422);

    // Authenticated staff can create the record.
    const saved = await send('PUT', payload, authorized);
    assert.equal(saved.status, 200);
    const result = await saved.json() as { version: number };
    assert.equal(result.version, 1);

    // Authenticated staff can read it.
    const readResponse = await send('GET', undefined, {
      Cookie: h.staffCookie,
    });
    assert.equal(readResponse.status, 200);

    const data = await readResponse.json() as {
      hearing: Array<{ statement: string; version: number }>;
    };
    assert.equal(data.hearing.length, 1);
    assert.equal(data.hearing[0]!.statement, payload.statement);
    assert.equal(data.hearing[0]!.version, 1);

    // Rejected requests must not have created extra revisions.
    const revisionsResponse = await fetch(
      `${endpoint}/${question.question_code}/revisions`,
      { headers: { Cookie: h.staffCookie } },
    );
    assert.equal(revisionsResponse.status, 200);

    const revisions = await revisionsResponse.json() as {
      items: Array<{ operation: string }>;
    };
    assert.equal(revisions.items.length, 1);
    assert.equal(revisions.items[0]!.operation, 'CREATE');

    // Malformed case IDs must be rejected before repository access.
    const malformed = await fetch(
      `${base}/cases/not-a-uuid/hearing`,
      { headers: { Cookie: h.staffCookie } },
    );
    assert.equal(malformed.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});
