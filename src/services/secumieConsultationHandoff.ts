import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';

export const consultationSchema = z.object({
  receipt: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  personName: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(1).max(50),
  note: z.string().trim().max(2000).optional(),
  accepted: z.literal(true),
  answers: z.array(z.object({ questionId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), answerId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/) }).strict()).length(8).optional(),
}).strict();
export type ConsultationInput = z.infer<typeof consultationSchema>;
export type DiagnosisContext = { kind: 'WEB' | 'INSIGHT'; companyName: string; targetUrl?: string; report?: unknown };
export type ConsultationNotice = DiagnosisContext & { personName: string; email: string; phone: string; note?: string; answers?: ConsultationInput['answers']; receivedAt: string; reference: string };
type Entry = { context: DiagnosisContext; expires: number; state: 'ready' | 'sending' | 'sent'; fingerprint?: string; timer?: NodeJS.Timeout };

export const SECUMIE_SCHEDULE_URLS = Object.freeze({
  WEB: 'https://timerex.net/s/yoshihisa.hagisaka_e611/50e1c715',
  INSIGHT: 'https://timerex.net/s/yoshihisa.hagisaka_e611/7836c6ba',
});
export function validateScheduleUrl(value: string): string {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.hostname !== 'timerex.net' || u.username || u.password || u.port || u.hash || !u.pathname.startsWith('/s/')) throw Error('INVALID_SCHEDULE_URL');
  return u.href;
}
export class ConsultationHandoff {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly notify: (notice: ConsultationNotice) => Promise<void>, readonly scheduleUrl: string, private readonly now = Date.now, private readonly ttl = 7200000, private readonly capacity = 500, private readonly evaluateInsight?: (answers: NonNullable<ConsultationInput['answers']>) => unknown) {
    this.scheduleUrl = validateScheduleUrl(scheduleUrl);
  }
  issue(context: DiagnosisContext): string {
    const now = this.now();
    for (const [key, e] of this.entries) if (e.expires <= now) this.remove(key);
    if (this.entries.size >= this.capacity) throw Error('HANDOFF_CAPACITY');
    const receipt = randomBytes(32).toString('base64url');
    const timer = setTimeout(() => this.remove(receipt), this.ttl);
    timer.unref();
    this.entries.set(receipt, { context, expires: now + this.ttl, state: 'ready', timer });
    return receipt;
  }
  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry?.timer) clearTimeout(entry.timer);
    if (entry) entry.context = {kind:entry.context.kind,companyName:''};
    this.entries.delete(key);
  }
  close(): void { for (const key of this.entries.keys()) this.remove(key); }
  async submit(input: ConsultationInput): Promise<string> {
    const entry = this.entries.get(input.receipt);
    if (!entry || entry.expires <= this.now()) { this.remove(input.receipt); throw Error('RECEIPT_EXPIRED'); }
    if (entry.context.kind === 'INSIGHT' ? !input.answers || new Set(input.answers.map(a=>a.questionId)).size !== 8 : input.answers !== undefined) throw Error('INVALID_ANSWERS');
    let insightReport: unknown;
    if (entry.context.kind === 'INSIGHT') {
      if (!this.evaluateInsight) throw Error('INVALID_ANSWERS');
      try { insightReport = this.evaluateInsight(input.answers!); } catch { throw Error('INVALID_ANSWERS'); }
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if (entry.state === 'sent' && entry.fingerprint === fingerprint) return this.scheduleUrl;
    if (entry.state !== 'ready') throw Error('ALREADY_SUBMITTED');
    entry.state = 'sending';
    try {
      await this.notify({ ...entry.context, ...(entry.context.kind === 'INSIGHT' ? {report:insightReport}:{}), personName: input.personName, email: input.email, phone: input.phone, ...(input.note ? {note: input.note}:{}), ...(input.answers ? {answers: input.answers}:{}), receivedAt: new Date(this.now()).toISOString(), reference: createHash('sha256').update(input.receipt).digest('hex').slice(0,20) });
      entry.fingerprint = fingerprint; entry.state = 'sent';
      // Remove diagnostic data immediately after notification.
      entry.context = {kind:entry.context.kind,companyName:''};
      return this.scheduleUrl;
    } catch { entry.state = 'ready'; throw Error('NOTIFICATION_FAILED'); }
  }
}
