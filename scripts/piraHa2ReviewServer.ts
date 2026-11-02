import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express from 'express';
import { Pool } from 'pg';
import { requireStaffAuth, setStaffSessionCookie } from '../src/middleware/staffAuth';
import { PiraAdminRepo } from '../src/piraAdmin/piraAdminRepo';
import { createAdminPiraRouter } from '../src/routes/adminPira';
import { StaffAuthService } from '../src/services/staffAuthService';

export const HA2_ADMIN = 'ha2-admin@atlib.jp';
export const HA2_VIEWER = 'ha2-viewer@atlib.jp';
const DB_NAME = 'pira_ha2_review';
const DB_CONFIG = {
  host: process.env.PIRA_HA2_DB_HOST || '127.0.0.1',
  port: Number(process.env.PIRA_HA2_DB_PORT || 55437),
  user: process.env.PIRA_HA2_DB_USER || 'otp_test',
  password: process.env.PIRA_HA2_DB_PASSWORD,
};

async function ensureDatabase(database: string) {
  if (!/^[a-z0-9_]+$/.test(database)) throw new Error('Invalid review database name');
  const bootstrap = new Pool({ ...DB_CONFIG, database: 'postgres' });
  try {
    const exists = await bootstrap.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
    if (!exists.rowCount) await bootstrap.query(`CREATE DATABASE ${database}`);
  } finally { await bootstrap.end(); }
}

async function initialize(pool: Pool, root: string) {
  await pool.query('DROP SCHEMA IF EXISTS pira CASCADE');
  for (const file of ['038_pira_public_intake.sql', '039_pira_admin_export.sql', '040_pira_export_audit_retention.sql']) {
    await pool.query(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
  }
  await pool.query(`INSERT INTO pira.pira_initiative(initiative_code,initiative_kind,display_name) VALUES
    ('pira-union','UNION','国連協 情報セキュリティ診断'),
    ('pira-general','GENERAL','SECU Insight 一般向け')`);
  const initiatives = await pool.query<{ initiative_id: string; initiative_code: string }>('SELECT initiative_id,initiative_code FROM pira.pira_initiative');
  const ids = Object.fromEntries(initiatives.rows.map(row => [row.initiative_code, row.initiative_id]));
  const rows = [
    ['pira-union','UNION','青空物流株式会社','佐藤 花子','union-a@example.test','https://a.example.test','03-1111-1111','首都圏物流事業協同組合','東京都千代田区丸の内1-1','PIRA-UNION-CONSENT-V1.0',false,'COMPLETED',2],
    ['pira-union','UNION','みらい製作所','鈴木 一郎','union-b@example.test','https://b.example.test',null,'東日本ものづくり協同組合','宮城県仙台市青葉区','PIRA-UNION-CONSENT-V1.0',false,'ANSWERING',8],
    ['pira-union','UNION','さくら食品有限会社','高橋 美咲','union-c@example.test','https://c.example.test','06-2222-2222','関西食品事業協同組合','大阪府大阪市北区','PIRA-UNION-CONSENT-V1.0',false,'RECEIVED',31],
    ['pira-general','GENERAL','光文デザイン株式会社','田中 健','general-a@example.test','https://d.example.test','045-333-3333',null,null,'ATLIB-GENERAL-CONSENT-DRAFT-V0.1',true,'COMPLETED',1],
    ['pira-general','GENERAL','北斗サービス株式会社','伊藤 葵','general-b@example.test','https://e.example.test',null,null,null,'ATLIB-GENERAL-CONSENT-DRAFT-V0.1',true,'ANSWERING',15],
    ['pira-general','GENERAL','山川商事','山本 翼','general-c@example.test','https://f.example.test','052-444-4444',null,null,'ATLIB-GENERAL-CONSENT-DRAFT-V0.1',true,'RECEIVED',60],
  ] as const;
  for (const row of rows) {
    const [code,kind,company,contact,email,website,phone,union,address,consent,sales,state,days] = row;
    await pool.query(`INSERT INTO pira.pira_submission(receipt_id,initiative_id,initiative_kind,company_name,company_name_normalized,contact_name,verified_email,website_url,phone,union_name,address,consent_version,consented_at,sales_use_allowed,state,received_at,idempotency_key,payload_hash)
      VALUES(gen_random_uuid(),$1,$2,$3,lower($3),$4,$5,$6,$7,$8,$9,$10,now()-($13||' days')::interval,$11,$12,now()-($13||' days')::interval,gen_random_uuid(),'ha2-review')`,
      [ids[code],kind,company,contact,email,website,phone,union,address,consent,sales,state,days]);
  }
}

export async function createPiraHa2Review(root = path.resolve(__dirname, '..'), database = DB_NAME) {
  await ensureDatabase(database);
  const pool = new Pool({ ...DB_CONFIG, database });
  await initialize(pool, root);
  const app = express();
  const auth = new StaffAuthService(randomBytes(32).toString('base64url'));
  const gate = requireStaffAuth(auth);
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(cookieParser());
  app.get('/__ha/login', (request, response) => {
    const email = request.query.role === 'viewer' ? HA2_VIEWER : HA2_ADMIN;
    setStaffSessionCookie(response, auth.issueSessionToken({ email }), false);
    response.redirect('/admin/pira/');
  });
  app.get('/admin/pira/', gate, (request, response) => {
    const source = fs.readFileSync(path.join(root, 'public/admin/pira/index.html'), 'utf8');
    const role = request.staffEmail === HA2_ADMIN ? '管理者' : '閲覧者';
    const review = `<aside class="ha2-review"><strong>HA-2 動作確認用</strong><span>現在の権限: ${role}</span><a href="/__ha/login?role=admin">管理者へ切替</a><a href="/__ha/login?role=viewer">閲覧者へ切替</a></aside>`;
    const reviewCss = '.ha2-review{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 16px;border:1px solid #b8d9d1;border-radius:8px;background:#effbf8}.ha2-review strong{margin-right:auto}.ha2-review a{color:#1f3556;font-weight:700}';
    response.type('html').set('cache-control', 'no-store').send(source.replace('</style>', `${reviewCss}</style>`).replace('<body>', `<body>${review}`));
  });
  app.get('/admin/pira/app.js', gate, (_request, response) => response.sendFile(path.join(root, 'public/admin/pira/app.js')));
  app.use('/api/admin/pira/v1', gate, createAdminPiraRouter(new PiraAdminRepo(pool), new Set([HA2_ADMIN])));
  app.get('/__ha/status', async (_request, response) => {
    const count = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM pira.pira_submission');
    response.json({ mode: 'HA-2-POSTGRES', database, submissions: count.rows[0]?.count ?? 0 });
  });
  app.get('/', (_request, response) => response.redirect('/__ha/login?role=admin'));
  return { app, pool };
}

if (require.main === module) {
  const port = Number(process.env.PIRA_HA2_PORT || 4174);
  createPiraHa2Review().then(({ app, pool }) => {
    const server = app.listen(port, '127.0.0.1', () => console.log(`PIRA_HA2_READY:http://127.0.0.1:${port}/admin/pira/`));
    const close = () => server.close(() => pool.end().finally(() => process.exit(0)));
    process.on('SIGINT', close); process.on('SIGTERM', close);
  }).catch(error => { console.error(`PIRA_HA2_START_FAILED:${error instanceof Error ? error.message : 'unknown'}`); process.exit(1); });
}
