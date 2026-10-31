import type { Pool, PoolClient } from 'pg';

export type Delivery = 'RESERVED' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';
export type ReservationLease = { reservationId: string; generation: number };
const LEASE_MS = 5 * 60_000;

/** PostgreSQL is the authority for delivery ownership. */
export class PostgresOtpReservationRepo {
  constructor(private readonly pool: Pool) {}

  private async tx<T>(f: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); const value = await f(c); await c.query('COMMIT'); return value; }
    catch (error) { await c.query('ROLLBACK'); throw error; }
    finally { c.release(); }
  }

  /** Atomically reserves a counted send and its inactive challenge. */
  async reserve(input: { id: string; challengeId: string; serviceId: string; email: string; otpDigest: string; replaces?: string; now: Date }): Promise<ReservationLease> {
    return this.tx(async c => {
      await c.query('INSERT INTO public_auth.otp_send_locks(service_id,email_protected) VALUES($1,$2) ON CONFLICT DO NOTHING', [input.serviceId, input.email]);
      await c.query('SELECT 1 FROM public_auth.otp_send_locks WHERE service_id=$1 AND email_protected=$2 FOR UPDATE', [input.serviceId, input.email]);
      const { rows: [last] } = await c.query<{ reserved_at: Date }>("SELECT reserved_at FROM public_auth.otp_send_reservations WHERE service_id=$1 AND email_protected=$2 AND status IN ('RESERVED','SENDING','SENT','UNKNOWN') ORDER BY reserved_at DESC LIMIT 1", [input.serviceId, input.email]);
      if (last && input.now.getTime() - last.reserved_at.getTime() < 60_000) throw Error('RESEND_COOLDOWN');
      const { rows: [count] } = await c.query<{ count: string }>("SELECT count(*) FROM public_auth.otp_send_reservations WHERE service_id=$1 AND email_protected=$2 AND reserved_at>$3 AND status IN ('RESERVED','SENDING','SENT','UNKNOWN')", [input.serviceId, input.email, new Date(input.now.getTime() - 3_600_000)]);
      if (Number(count?.count ?? '0') >= 5) throw Error('SEND_LIMIT_REACHED');
      const leaseUntil = new Date(input.now.getTime() + LEASE_MS);
      await c.query('INSERT INTO public_auth.otp_send_reservations(reservation_id,service_id,email_protected,otp_digest,challenge_id,replaces_challenge_id,reserved_at,lease_until,lease_generation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,0)', [input.id, input.serviceId, input.email, input.otpDigest, input.challengeId, input.replaces ?? null, input.now, leaseUntil]);
      await c.query('INSERT INTO public_auth.otp_challenges(challenge_id,reservation_id,service_id,email_protected,otp_digest,expires_at,resend_not_before) VALUES($1,$2,$3,$4,$5,$6,$7)', [input.challengeId, input.id, input.serviceId, input.email, input.otpDigest, new Date(input.now.getTime() + 10 * 60_000), new Date(input.now.getTime() + 60_000)]);
      return { reservationId: input.id, generation: 0 };
    });
  }

  /** This must happen before SMTP is invoked. */
  async claim(lease: ReservationLease, now = new Date()): Promise<ReservationLease | undefined> {
    const { rows: [row] } = await this.pool.query<{ reservation_id: string; lease_generation: string }>("UPDATE public_auth.otp_send_reservations SET status='SENDING',sending_at=$3,lease_until=$4 WHERE reservation_id=$1 AND lease_generation=$2 AND status='RESERVED' AND lease_until>$3 RETURNING reservation_id,lease_generation", [lease.reservationId, lease.generation, now, new Date(now.getTime() + LEASE_MS)]);
    return row ? { reservationId: row.reservation_id, generation: Number(row.lease_generation) } : undefined;
  }

  /** Reclaim only an expired RESERVED row. UNKNOWN is deliberately never requeued. */
  async reclaimReserved(lease: ReservationLease, now = new Date()): Promise<ReservationLease | undefined> {
    const { rows: [row] } = await this.pool.query<{ reservation_id: string; lease_generation: string }>("UPDATE public_auth.otp_send_reservations SET lease_generation=lease_generation+1,lease_until=$4 WHERE reservation_id=$1 AND lease_generation=$2 AND status='RESERVED' AND lease_until<=$3 RETURNING reservation_id,lease_generation", [lease.reservationId, lease.generation, now, new Date(now.getTime() + LEASE_MS)]);
    return row ? { reservationId: row.reservation_id, generation: Number(row.lease_generation) } : undefined;
  }

  /** A timed-out SMTP call may have delivered, so it is UNKNOWN and remains counted. */
  async recoverExpiredSending(now = new Date()): Promise<number> {
    const result = await this.pool.query("UPDATE public_auth.otp_send_reservations SET status='UNKNOWN',unknown_at=$1 WHERE status='SENDING' AND lease_until<=$1", [now]);
    return result.rowCount ?? 0;
  }

  async finish(lease: ReservationLease, status: 'SENT' | 'FAILED' | 'UNKNOWN', failureCode?: string, now = new Date()): Promise<boolean> {
    const result = await this.pool.query(`UPDATE public_auth.otp_send_reservations SET status=$3::public_auth.otp_delivery_status, sent_at=CASE WHEN $3::public_auth.otp_delivery_status='SENT' THEN $4 END, failed_at=CASE WHEN $3::public_auth.otp_delivery_status='FAILED' THEN $4 END, unknown_at=CASE WHEN $3::public_auth.otp_delivery_status='UNKNOWN' THEN $4 END, failure_code=$5 WHERE reservation_id=$1 AND lease_generation=$2 AND status='SENDING' AND lease_until>$4`, [lease.reservationId, lease.generation, status, now, failureCode ?? null]);
    return (result.rowCount ?? 0) === 1;
  }

  /** SMTP success atomically makes the new challenge usable and retires its predecessor. */
  async activateChallenge(lease: ReservationLease, now = new Date()): Promise<boolean> {
    return this.tx(async c => {
      const { rows: [reservation] } = await c.query<{ challenge_id: string; replaces_challenge_id: string | null }>("UPDATE public_auth.otp_send_reservations SET status='SENT',sent_at=$4 WHERE reservation_id=$1 AND lease_generation=$2 AND status='SENDING' AND lease_until>$3 RETURNING challenge_id,replaces_challenge_id", [lease.reservationId, lease.generation, now, now]);
      if (!reservation) return false;
      const activated = await c.query('UPDATE public_auth.otp_challenges SET activated_at=$3 WHERE challenge_id=$1 AND reservation_id=$2 AND activated_at IS NULL AND invalidated_at IS NULL', [reservation.challenge_id, lease.reservationId, now]);
      if (activated.rowCount !== 1) throw Error('CHALLENGE_NOT_RESERVED');
      if (reservation.replaces_challenge_id) await c.query('UPDATE public_auth.otp_challenges SET invalidated_at=$2 WHERE challenge_id=$1 AND activated_at IS NOT NULL AND consumed_at IS NULL AND invalidated_at IS NULL', [reservation.replaces_challenge_id, now]);
      return true;
    });
  }
}
