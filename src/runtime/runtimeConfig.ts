import path from 'node:path';
import { createPool } from '../db/pool';
import { loadDatabaseConfig, type Config } from '../config';
import { Mailer } from '../services/mailer';
import type { JwtConfig, JwtKey, PublicServiceBrand } from '../publicAuth/publicOtpApiService';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required runtime configuration: ${name}`);
  return value;
}
function httpsUrl(name: string): string {
  const value = required(name); const url = new URL(value);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error(`${name} must use HTTPS in production`);
  return value.replace(/\/$/, '');
}
function host(name: string): string {
  const value = required(name).toLowerCase();
  if (value.includes('/') || value.includes(':')) throw new Error(`${name} must be a hostname`);
  return value;
}
function json<T>(name: string): T { try { return JSON.parse(required(name)) as T; } catch { throw new Error(`Invalid JSON runtime configuration: ${name}`); } }
function strong(name: string, minimum = 32): string { const value = required(name); if (value.length < minimum) throw new Error(`${name} is too short`); return value; }

export async function databaseRuntime() {
  // Dedicated OTP/PIRA runtimes must never fall back to the Sales Tools DB secret.
  required('DB_PASSWORD');
  const db = await loadDatabaseConfig('runtime');
  const config = { db } as Config;
  const max = Number(process.env.DB_POOL_MAX ?? 2);
  const idleTimeoutMillis = Number(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? 10_000);
  if (!Number.isInteger(max) || max < 1 || max > 2) throw new Error('DB_POOL_MAX must be an integer from 1 to 2');
  if (!Number.isInteger(idleTimeoutMillis) || idleTimeoutMillis < 1) throw new Error('DB_POOL_IDLE_TIMEOUT_MS must be a positive integer');
  return createPool(config, { max, idleTimeoutMillis });
}

export async function otpRuntimeConfiguration() {
  const pool = await databaseRuntime();
  const smtp = {
    host: required('SMTP_HOST'), port: Number(process.env.SMTP_PORT ?? 587), user: required('SMTP_USER'),
    password: required('SMTP_PASSWORD'), from: required('SMTP_FROM'),
  };
  if (!Number.isInteger(smtp.port) || smtp.port < 1 || smtp.port > 65535) throw new Error('Invalid SMTP_PORT');
  const keys = json<JwtKey[]>('OTP_JWT_KEYS_JSON');
  const activeKid = required('OTP_JWT_ACTIVE_KID');
  if (!Array.isArray(keys) || keys.length === 0 || keys.some(key => !key.kid || !key.privateKey || !key.publicKey) || !keys.some(key => key.kid === activeKid)) throw new Error('Invalid OTP_JWT_KEYS_JSON or active kid');
  const jwt: JwtConfig = { issuer: httpsUrl('OTP_JWT_ISSUER'), activeKid, keys };
  const unionOrigin = httpsUrl('PIRA_UNION_ORIGIN');
  const brands = new Map<string, PublicServiceBrand>([
    ['pira-union', { id: 'pira-union', name: 'SECU:MIE Insight', origins: [unionOrigin] }],
  ]);
  if (process.env.PIRA_GENERAL_ENABLED === 'true') {
    const generalOrigin = httpsUrl('PIRA_GENERAL_ORIGIN');
    brands.set('pira-general', { id: 'pira-general', name: 'SECU:MIE Insight', origins: [generalOrigin] });
  }
  if (process.env.SECUMIE_WEB_ENABLED === 'true') {
    const origin = httpsUrl('SECUMIE_WEB_ORIGIN');
    brands.set('secumie-web-assembly', { id: 'secumie-web-assembly', name: 'SECU:MIE Web', origins: [origin] });
  }
  return { pool, mailer: new Mailer(smtp), turnstileSecret: strong('TURNSTILE_SECRET'), hmacKey: strong('OTP_HMAC_KEY'), jwt, brands };
}

export async function piraRuntimeConfiguration() {
  const root = path.resolve(__dirname, '../..');
  return {
    pool: await databaseRuntime(), issuer: httpsUrl('OTP_JWT_ISSUER'), jwksUrl: httpsUrl('OTP_JWKS_URL'),
    unionHost: host('PIRA_UNION_HOST'), generalHost: host('PIRA_GENERAL_HOST'),
    unionInitiativeCode: required('PIRA_UNION_INITIATIVE_CODE'), generalInitiativeCode: required('PIRA_GENERAL_INITIATIVE_CODE'),
    generalEnabled: process.env.PIRA_GENERAL_ENABLED === 'true', turnstileSiteKey: required('TURNSTILE_SITE_KEY'),
    publicAuthScriptPath: process.env.PUBLIC_AUTH_SCRIPT_PATH ?? path.join(root, 'public/public-service-auth.js'),
    prototypeDir: process.env.PIRA_ASSET_DIR ?? path.join(root, 'prototypes/pira-union-diagnosis-v2'),
  };
}

// Web intake has its own database and runtime role. Never use the OTP/PIRA pool.
export function secumieWebDatabaseRuntime() {
  const name = required('SECUMIE_WEB_DB_NAME');
  const user = required('SECUMIE_WEB_DB_USER');
  const password = required('SECUMIE_WEB_DB_PASSWORD');
  const reservedDatabases = new Set([
    'postgres', 'sales_tools', 'sales_tools_staging',
    'secumie_insight', 'secumie_insight_staging',
  ]);
  if (reservedDatabases.has(name) || name === process.env.DB_NAME || name === process.env.SECUMIE_DB_NAME
    || user === process.env.DB_USER || user === process.env.SECUMIE_DB_ADMIN_USER
    || user === process.env.SECUMIE_WEB_DB_ADMIN_USER) {
    throw new Error('SECU:MIE Web runtime requires an isolated Web database and role');
  }
  const port = Number(process.env.SECUMIE_WEB_DB_PORT ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SECUMIE_WEB_DB_PORT');
  const socketPath = process.env.SECUMIE_WEB_DB_SOCKET_PATH?.trim();
  return createPool({ db: {
    name, user, password, host: process.env.SECUMIE_WEB_DB_HOST?.trim() || '127.0.0.1', port,
    ...(socketPath ? { socketPath } : {}),
  } }, { max: 2, idleTimeoutMillis: 10_000 });
}

export async function secumieWebRuntimeConfiguration() {
  const root = path.resolve(__dirname, '../..');
  return {
    pool: secumieWebDatabaseRuntime(), issuer: httpsUrl('OTP_JWT_ISSUER'), jwksUrl: httpsUrl('OTP_JWKS_URL'),
    host: host('SECUMIE_WEB_HOST'), origin: httpsUrl('SECUMIE_WEB_ORIGIN'),
    turnstileSiteKey: required('TURNSTILE_SITE_KEY'), consentVersion: required('SECUMIE_WEB_CONSENT_VERSION'), consentText: required('SECUMIE_WEB_CONSENT_TEXT'),
    receptionCode: required('SECUMIE_WEB_RECEPTION_CODE'), organizerName: '国際連携推進協会',
    publicAuthScriptPath: process.env.PUBLIC_AUTH_SCRIPT_PATH ?? path.join(root, 'public/public-service-auth.js'),
    assetDir: process.env.SECUMIE_WEB_ASSET_DIR ?? path.join(root, 'prototypes/secumie-web-assembly'),
  };
}

export function runtimePort(): number {
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return port;
}
