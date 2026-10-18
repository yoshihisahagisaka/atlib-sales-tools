import { createHash, randomUUID } from 'node:crypto';

export type Service = 'GUARD' | 'SEND' | 'INFRAVISION';
export type Kind = 'association' | 'principal' | 'membership' | 'affiliation' | 'identity' | 'external_link' | 'terms' | 'application' | 'order' | 'audit' | 'outbox';
export interface RecordRow { id: string; version: number; associationId: string | null; companyId: string | null; data: { [key: string]: any }; }
export interface Filter { associationId?: string; companyId?: string; }
export interface Transaction {
  get(kind: Kind, id: string): Promise<RecordRow | null>;
  list(kind: Kind, filter?: Filter): Promise<RecordRow[]>;
  save(kind: Kind, row: RecordRow): Promise<void>;
  company(id: string): Promise<{ id: string; name: string; corporateNumber: string | null } | null>;
  searchCompanies(term: string): Promise<{ id: string; name: string; corporateNumber: string | null }[]>;
  createCompany(id: string, name: string, corporateNumber: string | null, actor: string): Promise<void>;
  confirmedEstimate(id: string, companyId?:string): Promise<{ id: string; revision: string } | null>;
}
export interface Store { transaction<T>(lock: string, work: (tx: Transaction) => Promise<T>): Promise<T>; }
export interface Actor { id: string; internal: boolean; machine?: string; requestId?:string; }
export class PiraError extends Error { constructor(public code: string, public status = 409) { super(code); } }
export function check(value: unknown, code: string, status = 409): asserts value { if (!value) throw new PiraError(code, status); }
export function text(value: unknown, max = 200): string { check(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'INVALID_INPUT', 400); return value.trim(); }
export function uuid(value: unknown): string { const s = text(value, 36); check(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s), 'INVALID_ID', 400); return s; }
export const key = (...values: string[]) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
function canonical(value: unknown): string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value);
}
export const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
export function row(data: RecordRow['data'], associationId: string | null = null, companyId: string | null = null, id: string = randomUUID()): RecordRow { return { id, version: 1, associationId, companyId, data }; }
export const principalId = (email: string) => key('google-invitation', email.trim().toLowerCase());
export const staffId = (email: string) => 'staff:' + email.trim().toLowerCase();
