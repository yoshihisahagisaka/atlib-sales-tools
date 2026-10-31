import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresOtpReservationRepo, type ReservationLease } from '../src/publicAuth/postgresOtpReservationRepo';

const pool = new Pool({ host: '127.0.0.1', port: 55437, database: 'otp_test_final', user: 'otp_test', password: 'otp_test' });
const repo = new PostgresOtpReservationRepo(pool);
let sequence = 0;
const next = (prefix: string) => `${prefix}-${++sequence}`;
const baseTime = () => new Date('2026-10-31T00:00:00.000Z');
async function reset() { await pool.query('TRUNCATE public_auth.otp_challenges, public_auth.otp_send_reservations, public_auth.otp_send_locks, public_auth.otp_send_events'); }
async function reserve(now = baseTime(), replaces?: string): Promise<ReservationLease> {
  return repo.reserve({ id: next('reservation'), challengeId: next('challenge'), serviceId: 'pira', email: 'a@example.test', otpDigest: 'digest', replaces, now });
}
async function status(id: string) {
  const { rows: [row] } = await pool.query<{ status: string; lease_generation: string }>('SELECT status,lease_generation FROM public_auth.otp_send_reservations WHERE reservation_id=$1', [id]);
  return row;
}

test('normal lease claims, sends and activates its reserved challenge', async () => {
  await reset(); const first = await reserve(); const lease = await repo.claim(first, baseTime());
  assert.deepEqual(lease, first); assert.equal(await repo.activateChallenge(lease!, new Date(baseTime().getTime() + 1)), true);
  const { rows: [challenge] } = await pool.query<{ activated_at: Date }>('SELECT activated_at FROM public_auth.otp_challenges WHERE reservation_id=$1', [first.reservationId]);
  assert.ok(challenge?.activated_at); assert.equal((await status(first.reservationId))?.status, 'SENT');
});

test('activation retires the preceding challenge in the same commit', async () => {
  await reset();
  await pool.query("INSERT INTO public_auth.otp_challenges(challenge_id,service_id,email_protected,otp_digest,expires_at,resend_not_before,activated_at) VALUES('old','pira','a@example.test','d',now()+interval '10 minutes',now(),now())");
  const first = await reserve(baseTime(), 'old'); const lease = await repo.claim(first, baseTime());
  assert.equal(await repo.activateChallenge(lease!, new Date(baseTime().getTime() + 1)), true);
  const { rows: [row] } = await pool.query<{ invalidated_at: Date }>("SELECT invalidated_at FROM public_auth.otp_challenges WHERE challenge_id='old'");
  assert.ok(row?.invalidated_at);
});

test('FAILED and UNKNOWN reservations reject challenge activation', async () => {
  await reset(); const failed = await reserve(); const failedLease = await repo.claim(failed, baseTime());
  assert.equal(await repo.finish(failedLease!, 'FAILED', 'SMTP_REJECTED', new Date(baseTime().getTime() + 1)), true);
  assert.equal(await repo.activateChallenge(failedLease!, new Date(baseTime().getTime() + 2)), false);
  await reset(); const unknown = await reserve(); const unknownLease = await repo.claim(unknown, baseTime());
  assert.equal(await repo.finish(unknownLease!, 'UNKNOWN', 'SMTP_TIMEOUT', new Date(baseTime().getTime() + 1)), true);
  assert.equal(await repo.activateChallenge(unknownLease!, new Date(baseTime().getTime() + 2)), false);
});

test('activation error rolls reservation and challenge changes back together', async () => {
  await reset(); const first = await reserve(); const lease = await repo.claim(first, baseTime());
  await pool.query('DELETE FROM public_auth.otp_challenges WHERE reservation_id=$1', [first.reservationId]);
  await assert.rejects(repo.activateChallenge(lease!, new Date(baseTime().getTime() + 1)), /CHALLENGE_NOT_RESERVED/);
  assert.equal((await status(first.reservationId))?.status, 'SENDING');
});

test('expired RESERVED is reclaimed once with a new generation, then claimed normally', async () => {
  await reset(); const first = await reserve(); const afterExpiry = new Date(baseTime().getTime() + 5 * 60_000);
  const reclaimed = await repo.reclaimReserved(first, afterExpiry);
  assert.deepEqual(reclaimed, { reservationId: first.reservationId, generation: 1 });
  assert.equal(await repo.reclaimReserved(first, afterExpiry), undefined);
  assert.deepEqual(await repo.claim(reclaimed!, new Date(afterExpiry.getTime() + 1)), reclaimed);
});

test('concurrent RESERVED recovery grants ownership to one worker only', async () => {
  await reset(); const first = await reserve(); const afterExpiry = new Date(baseTime().getTime() + 5 * 60_000);
  const results = await Promise.all([repo.reclaimReserved(first, afterExpiry), repo.reclaimReserved(first, afterExpiry)]);
  assert.equal(results.filter(Boolean).length, 1);
});

test('expired SENDING becomes UNKNOWN and neither reclaims nor accepts a delayed worker', async () => {
  await reset(); const first = await reserve(); const lease = await repo.claim(first, baseTime());
  const afterExpiry = new Date(baseTime().getTime() + 5 * 60_000);
  assert.equal(await repo.recoverExpiredSending(afterExpiry), 1); assert.equal((await status(first.reservationId))?.status, 'UNKNOWN');
  assert.equal(await repo.reclaimReserved(lease!, new Date(afterExpiry.getTime() + 1)), undefined);
  assert.equal(await repo.finish(lease!, 'SENT', undefined, new Date(afterExpiry.getTime() + 1)), false);
  assert.equal(await repo.activateChallenge(lease!, new Date(afterExpiry.getTime() + 1)), false);
});

test('stale generation cannot claim, finish, or activate after recovery', async () => {
  await reset(); const first = await reserve(); const afterExpiry = new Date(baseTime().getTime() + 5 * 60_000);
  const recovered = await repo.reclaimReserved(first, afterExpiry); assert.ok(recovered);
  assert.equal(await repo.claim(first, new Date(afterExpiry.getTime() + 1)), undefined);
  const current = await repo.claim(recovered!, new Date(afterExpiry.getTime() + 1)); assert.ok(current);
  assert.equal(await repo.finish(first, 'SENT', undefined, new Date(afterExpiry.getTime() + 2)), false);
  assert.equal(await repo.activateChallenge(first, new Date(afterExpiry.getTime() + 2)), false);
  assert.equal(await repo.activateChallenge(current!, new Date(afterExpiry.getTime() + 2)), true);
});

test('60-second and sixty-minute counted-send limits remain atomic under parallel requests', async () => {
  await reset(); const now = baseTime();
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => reserve(now)));
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
  await pool.query('UPDATE public_auth.otp_send_reservations SET reserved_at=$1', [new Date(now.getTime() - 61_000)]);
  for (let index = 0; index < 4; index += 1) {
    const item = await reserve(new Date(now.getTime() + (index + 1) * 61_000));
    await pool.query('UPDATE public_auth.otp_send_reservations SET reserved_at=$1 WHERE reservation_id=$2', [new Date(now.getTime() - 61_000), item.reservationId]);
  }
  await assert.rejects(reserve(new Date(now.getTime() + 10 * 61_000)), /SEND_LIMIT_REACHED/);
});

test('transaction rollback leaves no reservation or challenge', async () => {
  await reset(); const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query("INSERT INTO public_auth.otp_send_reservations(reservation_id,service_id,email_protected,otp_digest,challenge_id) VALUES('rollback','pira','x','d','c')"); await client.query("INSERT INTO public_auth.otp_challenges(challenge_id,reservation_id,service_id,email_protected,otp_digest,expires_at,resend_not_before) VALUES('c','rollback','pira','x','d',now(),now())"); await client.query('ROLLBACK'); }
  finally { client.release(); }
  const { rows } = await pool.query("SELECT reservation_id FROM public_auth.otp_send_reservations WHERE reservation_id='rollback'"); assert.equal(rows.length, 0);
});
test.after(async () => { await pool.end(); });
