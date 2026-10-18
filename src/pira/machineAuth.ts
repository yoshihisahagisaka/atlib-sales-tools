import { OAuth2Client } from 'google-auth-library';
import type { RequestHandler } from 'express';
import { check } from './model';

export interface MachineIdentity { subject: string; email: string; }
export type MachineVerifier = (token: string) => Promise<MachineIdentity>;
export interface Callers { portal: MachineIdentity; sales: MachineIdentity; }
/** Real Google signature/audience/expiry validation; no local bypass in runtime configuration. */
export function googleMachineVerifier(audience: string): MachineVerifier {
  const client = new OAuth2Client();
  return async token => {
    const p = (await client.verifyIdToken({idToken: token, audience})).getPayload();
    check(p && ['accounts.google.com','https://accounts.google.com'].includes(p.iss) && p.email_verified && p.email && p.sub, 'INVALID_MACHINE', 401);
    return {subject: p.sub, email: p.email};
  };
}
export function machineGate(kind: keyof Callers, callers: Callers, verify: MachineVerifier): RequestHandler {
  return async (q,s,n) => {
    try {
      const h=q.get('authorization'); check(h?.startsWith('Bearer '),'MACHINE_REQUIRED',401);
      let id: MachineIdentity; try { id=await verify(h!.slice(7)); } catch { check(false,'INVALID_MACHINE',401); }
      const expected=callers[kind]; check(id.subject===expected.subject && id.email===expected.email,'CALLER_DENIED',403);
      s.locals.piraCaller=kind; s.locals.piraMachine=id.subject; n();
    } catch(e) { n(e); }
  };
}
