import {createHash} from 'node:crypto';
/** General-public admission only. Existing staff/union routes do not use this. */
export const GENERAL_WINDOW_MS = 600_000;
export const GENERAL_LIMITS = { WEB: { ip: 5, domain: 3, active: 3 }, INSIGHT: { ip: 20 } } as const;
type Kind = keyof typeof GENERAL_LIMITS;
export const GENERAL_OPERATION_LIMITS={
 start:{ip:60,receipt:0},
 complete:{ip:120,receipt:30},
 consultation:{ip:60,receipt:10}
} as const;
type Operation=keyof typeof GENERAL_OPERATION_LIMITS;
type Counter = { count: number; until: number };
export class GeneralLimitError extends Error {
  constructor(public readonly code: 'IP_LIMIT' | 'DOMAIN_LIMIT' | 'BUSY' | 'RECEIPT_LIMIT') { super(code); }
}
export class SecumieGeneralLimits {
  private readonly ip = new Map<string, Counter>();
  private readonly domain = new Map<string, Counter>();
  private readonly operationIp=new Map<string,Counter>();
  private readonly operationReceipt=new Map<string,Counter>();
  private activeWeb = 0;
  constructor(private readonly now = Date.now, private readonly maxKeys = 20_000) {}
  private sweep(map: Map<string, Counter>, now: number) {
    for (const [key, value] of map) if (value.until <= now) map.delete(key);
  }
  private check(map: Map<string, Counter>, key: string, limit: number, code: 'IP_LIMIT' | 'DOMAIN_LIMIT' | 'RECEIPT_LIMIT', now: number) {
    const row = map.get(key);
    if (row && row.until > now && row.count >= limit) throw new GeneralLimitError(code);
    if (!row && map.size >= this.maxKeys) throw new GeneralLimitError('BUSY');
  }
  private count(map: Map<string, Counter>, key: string, now: number) {
    const row = map.get(key);
    if (row && row.until > now) row.count++;
    else map.set(key, { count: 1, until: now + GENERAL_WINDOW_MS });
  }
  /** Separate request ceilings; never log or store raw receipt capabilities. */
  admitOperation(kind:Kind,operation:Operation,clientIp:string,receipt?:string):void{
    const now=this.now(),bounds=GENERAL_OPERATION_LIMITS[operation];
    this.sweep(this.operationIp,now);this.sweep(this.operationReceipt,now);
    const key=kind+':'+operation+':'+clientIp;
    this.check(this.operationIp,key,bounds.ip,'IP_LIMIT',now);
    if(receipt!==undefined&&bounds.receipt>0){
      const hash=createHash('sha256').update(receipt).digest('hex');
      const receiptKey=kind+':'+operation+':'+hash;
      this.check(this.operationReceipt,receiptKey,bounds.receipt,'RECEIPT_LIMIT',now);
      this.count(this.operationReceipt,receiptKey,now);
    }
    this.count(this.operationIp,key,now);
  }
  /** Call only after server-side Turnstile and input validation. */
  admit(kind: Kind, clientIp: string, targetUrl?: string): () => void {
    const now = this.now();
    this.sweep(this.ip, now); this.sweep(this.domain, now);
    const ip = kind + ':' + clientIp;
    this.check(this.ip, ip, GENERAL_LIMITS[kind].ip, 'IP_LIMIT', now);
    if (kind === 'INSIGHT') {
      this.count(this.ip, ip, now);
      return () => {};
    }
    if (!targetUrl) throw new Error('TARGET_REQUIRED');
    const target = new URL(targetUrl);
    // Canonical hostname, no path, trailing dot or www variation.
    const domain = target.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    this.check(this.domain, domain, GENERAL_LIMITS.WEB.domain, 'DOMAIN_LIMIT', now);
    if (this.activeWeb >= GENERAL_LIMITS.WEB.active) throw new GeneralLimitError('BUSY');
    this.count(this.ip, ip, now); this.count(this.domain, domain, now);
    this.activeWeb++;
    let released = false;
    return () => { if (!released) { released = true; this.activeWeb--; } };
  }
}
