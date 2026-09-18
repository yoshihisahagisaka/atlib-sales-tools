import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { CustomerFitCheckRepo } from '../src/services/customerFitCheckRepo';
import { createAdminCustomerFitCheckRouter } from '../src/routes/adminCustomerFitCheck';
import { StaffAuthService } from '../src/services/staffAuthService';
import { requireStaffAuth } from '../src/middleware/staffAuth';

/**
 * IT経営KAIZEN 顧客適合性チェックのE2Eシナリオ（承認済み実装計画の検証項目）。
 * 新規作成 → 保存 → 一覧表示 → 再表示 → 編集 → Human Decision変更 → 再保存 を
 * 実DB制約（PGlite上のPostgres）+ 実HTTPルート + requireStaffAuth を通して1本で検証する。
 * 他ドメイン（無料診断・Kaizen診断等）には一切依存しない、独立した軽量ハーネス。
 */
async function createHarness() {
  const db = new PGlite();
  await db.waitReady;
  const root = path.resolve(__dirname, '..');
  // PGliteはpgcrypto拡張自体を持たないが、gen_random_uuid()はPostgreSQL 13以降コアに組み込まれているため、
  // 001のCREATE EXTENSION文は実行せずテーブル定義のみ適用する（test/support/diagnosisHarness.tsと同じ扱い）。
  await db.exec(fs.readFileSync(path.join(root, 'migrations/017_customer_fit_checks.sql'), 'utf8'));

  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }
  const query = async (sql: string, params?: unknown[]) => db.query(sql, params);
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      const release = await acquire();
      try {
        return await query(sql, params);
      } finally {
        release();
      }
    },
    connect: async () => {
      const release = await acquire();
      return { query, release };
    },
  } as unknown as Pool;

  const repo = new CustomerFitCheckRepo(pool);
  const staffAuth = new StaffAuthService('disposable-test-key-not-a-production-secret');
  const staffCookie = `staff_session=${staffAuth.issueSessionToken({ email: 'sales.rep@atlib.jp' })}`;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin/customer-fit-check', requireStaffAuth(staffAuth), createAdminCustomerFitCheckRouter(repo));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    db,
    pool,
    repo,
    url,
    staffCookie,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      await db.close();
    },
  };
}

function sevenItems(overrides: Record<number, Partial<{ answer: string; factNote: string }>> = {}) {
  return Array.from({ length: 7 }, (_, i) => {
    const itemNo = i + 1;
    const o = overrides[itemNo] ?? {};
    return {
      itemNo,
      answer: o.answer ?? 'YES',
      factNote: o.factNote ?? `項目${itemNo}のFACT`,
      unknownNote: `項目${itemNo}のUNKNOWN`,
      hypothesisNote: `項目${itemNo}の営業仮説`,
    };
  });
}

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => {
  h = await createHarness();
});
after(async () => {
  await h?.close();
});

test('customer fit check: create -> save -> list -> reload -> edit -> change Human Decision -> resave', async () => {
  // 1. サンプル顧客で新規作成（7項目回答含む）→保存
  const createPayload = {
    customerName: 'サンプル株式会社',
    checkedOn: '2026-09-18',
    decisionMakerContext: '代表とは未対話、窓口担当のみ',
    engagementContext: '既存MSP顧客からの紹介',
    items: sevenItems({ 3: { answer: 'UNKNOWN' }, 6: { answer: 'NO' } }),
    overallFacts: '既存システムの老朽化を認識している',
    overallUnknowns: '経営者の意向は未確認',
    overallHypotheses: '将来的な事業拡大を見据えている可能性',
    nextActions: '次回商談で経営者に同席いただく',
    humanDecision: 'B',
    decisionReason: '経営者と未対話のため要確認',
  };
  const createRes = await fetch(`${h.url}/api/admin/customer-fit-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: h.staffCookie },
    body: JSON.stringify(createPayload),
  });
  assert.equal(createRes.status, 201);
  const { id } = (await createRes.json()) as { id: string };
  assert.ok(id);

  // 認証なしでは作成できない（顧客自身が使うツールではない）ことも確認
  const unauthedRes = await fetch(`${h.url}/api/admin/customer-fit-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });
  assert.equal(unauthedRes.status, 401);

  // 2. 一覧取得→作成したレコードが含まれることを確認
  const listRes = await fetch(`${h.url}/api/admin/customer-fit-check`, { headers: { Cookie: h.staffCookie } });
  assert.equal(listRes.status, 200);
  const listBody = (await listRes.json()) as { items: Array<{ id: string; customerName: string; humanDecision: string | null; salesRepEmail: string }> };
  const listed = listBody.items.find((it) => it.id === id);
  assert.ok(listed);
  assert.equal(listed!.customerName, 'サンプル株式会社');
  assert.equal(listed!.humanDecision, 'B');
  assert.equal(listed!.salesRepEmail, 'sales.rep@atlib.jp'); // requireStaffAuthのreq.staffEmailから自動記録

  // 3. 詳細再取得→保存内容が一致することを確認（FACT/UNKNOWN/営業仮説が別列で分離されていること）
  const detailRes1 = await fetch(`${h.url}/api/admin/customer-fit-check/${id}`, { headers: { Cookie: h.staffCookie } });
  assert.equal(detailRes1.status, 200);
  const detail1 = (await detailRes1.json()) as any;
  assert.equal(detail1.overallHypotheses, '将来的な事業拡大を見据えている可能性');
  assert.equal(detail1.overallFacts, '既存システムの老朽化を認識している');
  assert.notEqual(detail1.overallFacts, detail1.overallHypotheses);
  const item3 = detail1.items.find((it: any) => it.itemNo === 3);
  assert.equal(item3.answer, 'UNKNOWN'); // UNKNOWNのまま保存され、YES/NOへ推測変換されていない
  const item1 = detail1.items.find((it: any) => it.itemNo === 1);
  assert.equal(item1.factNote, '項目1のFACT');
  assert.equal(item1.unknownNote, '項目1のUNKNOWN');
  assert.equal(item1.hypothesisNote, '項目1の営業仮説');

  // 4. 一部項目編集（項目1のanswer/factNoteを変更）+ 5. Human Decisionを B→A に変更して再保存
  const updatePayload = {
    ...createPayload,
    items: sevenItems({ 1: { answer: 'NO', factNote: '項目1のFACT（更新後）' }, 3: { answer: 'UNKNOWN' }, 6: { answer: 'NO' } }),
    humanDecision: 'A',
    decisionReason: '経営者との対話が実現し、改善余地を確認できたため',
  };
  const updateRes = await fetch(`${h.url}/api/admin/customer-fit-check/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: h.staffCookie },
    body: JSON.stringify(updatePayload),
  });
  assert.equal(updateRes.status, 204);

  // 6. 再度詳細取得→変更が反映されていることを確認
  const detailRes2 = await fetch(`${h.url}/api/admin/customer-fit-check/${id}`, { headers: { Cookie: h.staffCookie } });
  const detail2 = (await detailRes2.json()) as any;
  assert.equal(detail2.humanDecision, 'A');
  assert.equal(detail2.decisionReason, '経営者との対話が実現し、改善余地を確認できたため');
  const updatedItem1 = detail2.items.find((it: any) => it.itemNo === 1);
  assert.equal(updatedItem1.answer, 'NO');
  assert.equal(updatedItem1.factNote, '項目1のFACT（更新後）');
  assert.equal(detail2.items.length, 7); // 全置換後も7項目のまま（重複・欠落なし）
});

test('customer fit check: A/B/C/D and 7 axes/questions are not auto-derived (static master data only)', async () => {
  const itemsRes = await fetch(`${h.url}/api/admin/customer-fit-check/items`, { headers: { Cookie: h.staffCookie } });
  const body = (await itemsRes.json()) as { items: unknown[]; humanDecisionOptions: unknown[] };
  assert.equal(body.items.length, 7);
  assert.equal(body.humanDecisionOptions.length, 4);
});
