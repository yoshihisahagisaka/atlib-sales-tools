import type { Pool } from 'pg';

export type SlackSender = (message: { text: string }) => Promise<void>;
export type OutboxDeliveryResult = 'EMPTY' | 'SENT' | 'FAILED';

/**
 * Invoke only from an authenticated internal worker/job, never from the public API.
 * Each claim is leased atomically; stale SENDING rows require explicit recovery.
 */
export class AssemblySlackNotifier {
  constructor(private readonly pool: Pool, private readonly send: SlackSender, private readonly adminUrl: string) {}

  async sendOne(): Promise<OutboxDeliveryResult> {
    const client = await this.pool.connect();
    let row: { notification_id: string; intake_id: string; company_name: string; union_name_snapshot: string } | undefined;
    try {
      await client.query('BEGIN');
      const result = await client.query<typeof row & {}>(
        `SELECT o.notification_id, o.intake_id, i.company_name, i.union_name_snapshot
         FROM secumie_web.assembly_notification_outbox o
         JOIN secumie_web.assembly_intake i ON i.intake_id=o.intake_id
         WHERE o.state IN ('PENDING','FAILED') AND o.next_attempt_at <= now()
         ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1`,
      );
      row = result.rows[0] as typeof row;
      if (!row) { await client.query('COMMIT'); return 'EMPTY'; }
      await client.query(
        "UPDATE secumie_web.assembly_notification_outbox SET state='SENDING',attempts=attempts+1 WHERE notification_id=$1",
        [row.notification_id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    if (!row) return 'EMPTY';
    const safe = (value: string) => value.replace(/[<>&]/g, value => ({ '<':'＜', '>':'＞', '&':'＆' })[value] ?? value).slice(0,200);
    if (!/^https:\/\/[^\s]+$/.test(this.adminUrl)) throw new Error('ADMIN_URL_NOT_CONFIGURED');
    const message = [
      'SECU:MIE Web 新規診断受付',
      `申込み企業名: ${safe(row.company_name)}`,
      `管理表URL: ${this.adminUrl}`,
    ].join('\n');
    try {
      await this.send({ text: message });
      await this.pool.query(
        "UPDATE secumie_web.assembly_notification_outbox SET state='SENT',sent_at=now(),last_error_code=NULL WHERE notification_id=$1 AND state='SENDING'",
        [row.notification_id],
      );
      return 'SENT';
    } catch {
      await this.pool.query(
        `UPDATE secumie_web.assembly_notification_outbox
         SET state='FAILED',last_error_code='DELIVERY_FAILED',
             next_attempt_at=now() + make_interval(mins => least(60, attempts * 5))
         WHERE notification_id=$1 AND state='SENDING'`,
        [row.notification_id],
      );
      return 'FAILED';
    }
  }
}
