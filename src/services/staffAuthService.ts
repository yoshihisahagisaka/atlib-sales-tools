import jwt from 'jsonwebtoken';

export interface StaffOauthStatePayload {
  nonce: string; // callbackで受け取るstateクエリと突き合わせるCSRF対策値
  codeVerifier: string; // PKCE
  returnTo: string; // ログイン成功後に戻る画面（/admin/配下の相対パスのみ許容、routes/staffAuth.tsで検証）
}

export interface StaffSessionPayload {
  email: string;
}

const OAUTH_STATE_EXPIRES_IN = '10m';
const SESSION_EXPIRES_IN = '24h';

/**
 * スタッフ（社内Googleアカウント）向けのJWT発行・検証。msp-customer-portalの同名クラスと同じ構成。
 * sales-toolsには管理者/一般のロール区分が無い（今のところ管理画面内に権限差が必要なページが無いため、
 * atlib.jpドメイン全員に同一権限でログインを許可する設計。将来必要になればmsp-customer-portalの
 * admin_principals方式を移植する）ため、セッションにはemailのみを持たせる。
 */
export class StaffAuthService {
  constructor(private readonly jwtSecret: string) {}

  issueOauthStateToken(payload: StaffOauthStatePayload): string {
    return jwt.sign({ ...payload, purpose: 'staff_oauth_state' }, this.jwtSecret, { expiresIn: OAUTH_STATE_EXPIRES_IN });
  }

  verifyOauthStateToken(token: string): StaffOauthStatePayload {
    const payload = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || payload.purpose !== 'staff_oauth_state'
      || ![payload.nonce, payload.codeVerifier, payload.returnTo].every(v => typeof v === 'string' && v.length > 0)) {
      throw new Error('Invalid staff OAuth state');
    }
    return payload as StaffOauthStatePayload;
  }

  issueSessionToken(payload: StaffSessionPayload): string {
    return jwt.sign({ ...payload, purpose: 'staff_session' }, this.jwtSecret, { expiresIn: SESSION_EXPIRES_IN });
  }

  verifySessionToken(token: string): StaffSessionPayload {
    const payload = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || payload.purpose !== 'staff_session'
      || typeof payload.email !== 'string' || !payload.email.trim()) {
      throw new Error('Invalid staff session');
    }
    return payload as StaffSessionPayload;
  }
}
