import path from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { loadConfig } from './config';
import { createPool } from './db/pool';
import { Mailer } from './services/mailer';
import { IsmsDiagnosticRepo } from './services/ismsDiagnosticRepo';
import { FreeHearingAssessmentRepo } from './services/freeHearingAssessmentRepo';
import { MarketRateRepo } from './services/marketRateRepo';
import { EstimatePreconditionRepo } from './services/estimatePreconditionRepo';
import { EstimateRepo } from './services/estimateRepo';
import { AiAssistService } from './services/aiAssistService';
import { StaffAuthService } from './services/staffAuthService';
import { createIsmsDiagnosticRouter } from './routes/ismsDiagnostic';
import { createAdminIsmsDiagnosticRouter } from './routes/adminIsmsDiagnostic';
import { createFreeHearingAssessmentRouter } from './routes/freeHearingAssessment';
import { createAdminFreeHearingAssessmentRouter } from './routes/adminFreeHearingAssessment';
import { createAdminMarketRatesRouter } from './routes/adminMarketRates';
import { createAdminEstimatePreconditionsRouter } from './routes/adminEstimatePreconditions';
import { createAdminEstimatesRouter } from './routes/adminEstimates';
import { createAdminEstimateAiAssistRouter } from './routes/adminEstimateAiAssist';
import { createStaffAuthRouter } from './routes/staffAuth';
import { requireStaffAuth } from './middleware/staffAuth';
import { createIpRateLimiter } from './middleware/rateLimit';

async function main(): Promise<void> {
  const config = await loadConfig();
  const logger = pino({ level: config.nodeEnv === 'production' ? 'info' : 'debug' });

  const pool = createPool(config);
  const mailer = new Mailer(config.smtp);
  const ismsDiagnosticRepo = new IsmsDiagnosticRepo(pool);
  const freeHearingAssessmentRepo = new FreeHearingAssessmentRepo(pool);
  const marketRateRepo = new MarketRateRepo(pool);
  const estimatePreconditionRepo = new EstimatePreconditionRepo(pool);
  const estimateRepo = new EstimateRepo(pool);
  const aiAssistService = new AiAssistService(config.aiAssist.anthropicApiKey, marketRateRepo, estimatePreconditionRepo);
  const staffAuthService = new StaffAuthService(config.staffAuth.jwtSecret);

  const app = express();
  // Cloud Run本番ではGoogle Front Endが1ホップ手前でTLS終端しX-Forwarded-Forを付与するため、
  // req.ipが正しいクライアントIPを指すようにtrust proxyを有効化する（IPレート制限で使用）。
  app.set('trust proxy', true);
  app.use(pinoHttp({ logger })); // 操作ログ（誰がいつ何をしたか）の基礎になる構造化アクセスログ
  // AI提案機能はbase64 PDFを受け取るためデフォルトの100KB上限では足りない。グローバルlimitを
  // 上げると公開・無認証のisms-diagnostic等のDoS耐性を弱めるため、このパスだけ個別に
  // 大きめのexpress.json()を先にマウントする（body-parserは同一リクエストの二重パースを
  // no-opにするため、下のグローバルexpress.json()と共存してよい。msp-customer-portalと同じ対応）。
  app.use('/api/admin/estimates/ai-assist', express.json({ limit: '15mb' }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));

  // Google Workspaceログイン（無認証でアクセスできる必要がある）
  app.use('/auth', createStaffAuthRouter(staffAuthService, config, config.nodeEnv === 'production'));

  app.use(
    '/api/isms-diagnostic',
    createIsmsDiagnosticRouter(
      ismsDiagnosticRepo,
      mailer,
      config.diagnosticNotifyEmail,
      config.portalBaseUrl,
      config.slack.webhookDiagnostic,
    ),
  );

  // 無料Gap診断: 見込み客が自分で回答する公開フォームの受け口（無認証・IPレート制限のみ）。
  // 結果表（スコア・提案候補サービス）は返さず、スタッフが /admin/ 配下の結果シートで確認する。
  app.use('/api/free-hearing-assessment', createFreeHearingAssessmentRouter(freeHearingAssessmentRepo));

  // 管理画面（Google Workspace認証保護、2026-08-25にBasic Authから移行）。
  // ブルートフォース対策として同じIPレート制限を認証チェックの前段にも適用する。
  const adminAuthGate = [
    createIpRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 300 }),
    requireStaffAuth(staffAuthService),
  ];
  app.use('/api/admin/isms-diagnostic', ...adminAuthGate, createAdminIsmsDiagnosticRouter(ismsDiagnosticRepo));
  app.use(
    '/api/admin/free-hearing-assessment',
    ...adminAuthGate,
    createAdminFreeHearingAssessmentRouter(freeHearingAssessmentRepo),
  );
  app.use('/api/admin/market-rates', ...adminAuthGate, createAdminMarketRatesRouter(marketRateRepo));
  app.use(
    '/api/admin/estimate-preconditions',
    ...adminAuthGate,
    createAdminEstimatePreconditionsRouter(estimatePreconditionRepo),
  );
  // /api/admin/estimates/ai-assist は /api/admin/estimates よりも先にマウントすること
  // （逆順だとadminEstimatesRouter側で該当ルートが見つからずフォールスルーする挙動に依存してしまうため）。
  app.use(
    '/api/admin/estimates/ai-assist',
    ...adminAuthGate,
    createAdminEstimateAiAssistRouter(aiAssistService),
  );
  app.use('/api/admin/estimates', ...adminAuthGate, createAdminEstimatesRouter(estimateRepo));
  // 静的HTML側もスタッフ認証で保護する。この行は下の一般static配信より前に置くこと
  // （逆順だと未認証で/admin/*.htmlが一般static経由で読めてしまう）。
  app.use('/admin', ...adminAuthGate, express.static(path.join(__dirname, '../public/admin')));

  app.use(express.static(path.join(__dirname, '../public')));

  app.listen(config.port, () => {
    logger.info(`sales-tools listening on :${config.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
