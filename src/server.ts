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
import { KaizenDiagnosticRepo } from './services/kaizenDiagnosticRepo';
import { KaizenAssessmentRepo } from './services/kaizenAssessmentRepo';
import { KaizenAssessmentAiService } from './services/kaizenAssessmentAiService';
import { MarketRateRepo } from './services/marketRateRepo';
import { EstimatePreconditionRepo } from './services/estimatePreconditionRepo';
import { EstimateRepo } from './services/estimateRepo';
import { AiAssistService } from './services/aiAssistService';
import { StaffAuthService } from './services/staffAuthService';
import { createIsmsDiagnosticRouter } from './routes/ismsDiagnostic';
import { createAdminIsmsDiagnosticRouter } from './routes/adminIsmsDiagnostic';
import { createFreeHearingAssessmentRouter } from './routes/freeHearingAssessment';
import { createAdminFreeHearingAssessmentRouter } from './routes/adminFreeHearingAssessment';
import { createKaizenDiagnosticRouter } from './routes/kaizenDiagnostic';
import { createAdminKaizenDiagnosticRouter } from './routes/adminKaizenDiagnostic';
import { createKaizenAssessmentRouter } from './routes/kaizenAssessment';
import { createAdminKaizenAssessmentRouter } from './routes/adminKaizenAssessment';
import { createAdminMarketRatesRouter } from './routes/adminMarketRates';
import { createAdminEstimatePreconditionsRouter } from './routes/adminEstimatePreconditions';
import { createAdminEstimatesRouter } from './routes/adminEstimates';
import { createAdminEstimateAiAssistRouter } from './routes/adminEstimateAiAssist';
import { createStaffAuthRouter } from './routes/staffAuth';
import { requireStaffAuth } from './middleware/staffAuth';
import { createIpRateLimiter } from './middleware/rateLimit';
import { ItManagementDiagnosisRepo } from './services/itManagementDiagnosisRepo';
import { createItManagementDiagnosisRouter } from './routes/itManagementDiagnosis';
import { createAdminItManagementDiagnosisRouter } from './routes/adminItManagementDiagnosis';
import { safeAccessRequest } from './middleware/diagnosisLogging';
import { sendSlackNotification } from './services/slackNotifier';
import { DiagnosisPreparationRepo } from './services/diagnosisPreparationRepo';
import { AnthropicPreDiagnosisProvider } from './services/preDiagnosisProvider';
import { DiagnosisWorkspaceRepo } from './services/diagnosisWorkspaceRepo';
import { AnthropicInterviewProvider } from './services/interviewAssistantProvider';
import { InterviewAssistantWorker } from './services/interviewAssistantWorker';
import { DiagnosisReviewRepo } from './services/diagnosisReviewRepo';
import { AnthropicPostDiagnosisProvider } from './services/postDiagnosisProvider';
import { PostDiagnosisWorker } from './services/postDiagnosisWorker';
import {DiagnosisAssessmentRepo} from './services/diagnosisAssessmentRepo';
import { DiagnosisReportRepo } from './services/diagnosisReportRepo';
import { AnthropicReportDraftProvider } from './services/reportDraftProvider';
import { ReportDraftWorker } from './services/reportDraftWorker';
import { PreDiagnosisWorker } from './services/preDiagnosisWorker';

async function main(): Promise<void> {
  const config = await loadConfig();
  const logger = pino({ level: config.nodeEnv === 'production' ? 'info' : 'debug' });

  const pool = createPool(config);
  const mailer = new Mailer(config.smtp);
  const ismsDiagnosticRepo = new IsmsDiagnosticRepo(pool);
  const freeHearingAssessmentRepo = new FreeHearingAssessmentRepo(pool);
  const kaizenDiagnosticRepo = new KaizenDiagnosticRepo(pool);
  const kaizenAssessmentRepo = new KaizenAssessmentRepo(pool);
  const kaizenAssessmentAiService = new KaizenAssessmentAiService(config.aiAssist.anthropicApiKey);
  const marketRateRepo = new MarketRateRepo(pool);
  const estimatePreconditionRepo = new EstimatePreconditionRepo(pool);
  const estimateRepo = new EstimateRepo(pool);
  const aiAssistService = new AiAssistService(config.aiAssist.anthropicApiKey, marketRateRepo, estimatePreconditionRepo);
  const staffAuthService = new StaffAuthService(config.staffAuth.jwtSecret);
  const itManagementDiagnosisRepo = new ItManagementDiagnosisRepo(pool);
  const preparationRepo = new DiagnosisPreparationRepo(pool);
  const preparationProvider = new AnthropicPreDiagnosisProvider(config.aiAssist.anthropicApiKey);
  const preparationWorker = new PreDiagnosisWorker(preparationRepo, preparationProvider);
  const preparation = { repo: preparationRepo, provider: preparationProvider, worker: preparationWorker };
  const workspaceRepo = new DiagnosisWorkspaceRepo(pool);
  const interviewProvider = new AnthropicInterviewProvider(config.aiAssist.anthropicApiKey);
  const interviewWorker = new InterviewAssistantWorker(preparationRepo,workspaceRepo,interviewProvider);
  const workspace = { repo:workspaceRepo,provider:interviewProvider,worker:interviewWorker };
  const reviewRepo = new DiagnosisReviewRepo(pool);
  const postDiagnosisProvider = new AnthropicPostDiagnosisProvider(config.aiAssist.anthropicApiKey);
  const postDiagnosisWorker = new PostDiagnosisWorker(preparationRepo,reviewRepo,postDiagnosisProvider);
  const review = {repo:reviewRepo,provider:postDiagnosisProvider,worker:postDiagnosisWorker};
  const assessment = new DiagnosisAssessmentRepo(pool);
  const reportRepo = new DiagnosisReportRepo(pool);
  const reportProvider = new AnthropicReportDraftProvider(config.aiAssist.anthropicApiKey);
  const reportWorker = new ReportDraftWorker(preparationRepo,reportRepo,reportProvider);
  const report = {repo:reportRepo,provider:reportProvider,worker:reportWorker};
  const notifySurveyCompleted = async (id: string): Promise<void> => {
    const detailUrl = `${config.portalBaseUrl}/admin/it-management-diagnosis-detail.html?id=${id}`;
    await Promise.all([
      mailer.sendItManagementSurveyNotification(config.diagnosticNotifyEmail, detailUrl),
      sendSlackNotification(config.slack.webhookDiagnostic, `【無料 IT経営診断】アンケート回答完了\n提供：atLIB株式会社\n${detailUrl}`),
    ]);
  };

  const app = express();
  // Cloud Run本番ではGoogle Front Endが1ホップ手前でTLS終端しX-Forwarded-Forを付与するため、
  // req.ipが正しいクライアントIPを指すようにtrust proxyを有効化する（IPレート制限で使用）。
  app.set('trust proxy', true);
  app.use(pinoHttp({ logger, serializers: { req: safeAccessRequest } }));
  // AI提案機能はbase64 PDFを受け取るためデフォルトの100KB上限では足りない。グローバルlimitを
  // 上げると公開・無認証のisms-diagnostic等のDoS耐性を弱めるため、このパスだけ個別に
  // 大きめのexpress.json()を先にマウントする（body-parserは同一リクエストの二重パースを
  // no-opにするため、下のグローバルexpress.json()と共存してよい。msp-customer-portalと同じ対応）。
  app.use('/api/admin/estimates/ai-assist', express.json({ limit: '15mb' }));
  // 60分診断の文字起こし貼り付けはデフォルトの100KB上限を超えることがある。
  // グローバルより前に、このパスだけ大きめのexpress.json()を先にマウントする（見積AIと同じ対応）。
  app.use('/api/admin/kaizen-assessment', express.json({ limit: '2mb' }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));
  app.use('/api/it-management-diagnosis', createItManagementDiagnosisRouter(itManagementDiagnosisRepo, notifySurveyCompleted));

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

  // 情シスKAIZEN診断: corporate-site LP（www.atlib.jp/joshisu-kaizen/）向けの姉妹版。
  // /request-link のみ LP からのクロスオリジンPOSTを受けるためルーター内でCORSを個別付与している。
  app.use('/api/kaizen-diagnostic', createKaizenDiagnosticRouter(kaizenDiagnosticRepo, mailer, config));

  // 情シスKAIZEN｜60分無料診断（V5）: LP→事前アンケート→担当者主導の60分診断→PDF/PPTXレポート。
  // 事前アンケートは sales.atlib.jp 自ドメインの kaizen-assessment-intake.html から呼ばれる（CORS不要）。
  app.use('/api/kaizen-assessment', createKaizenAssessmentRouter(kaizenAssessmentRepo, mailer, config));

  // 管理画面（Google Workspace認証保護、2026-08-25にBasic Authから移行）。
  // ブルートフォース対策として同じIPレート制限を認証チェックの前段にも適用する。
  const adminAuthGate = [
    createIpRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 300 }),
    requireStaffAuth(staffAuthService),
  ];
  app.use('/api/admin/it-management-diagnosis', ...adminAuthGate,
    createAdminItManagementDiagnosisRouter(itManagementDiagnosisRepo, notifySurveyCompleted, preparation, workspace, review, report, assessment));
  app.use('/api/admin/isms-diagnostic', ...adminAuthGate, createAdminIsmsDiagnosticRouter(ismsDiagnosticRepo));
  app.use(
    '/api/admin/free-hearing-assessment',
    ...adminAuthGate,
    createAdminFreeHearingAssessmentRouter(freeHearingAssessmentRepo),
  );
  app.use(
    '/api/admin/kaizen-diagnostic',
    ...adminAuthGate,
    createAdminKaizenDiagnosticRouter(kaizenDiagnosticRepo),
  );
  app.use(
    '/api/admin/kaizen-assessment',
    ...adminAuthGate,
    createAdminKaizenAssessmentRouter(kaizenAssessmentRepo, kaizenAssessmentAiService),
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
  const pollReport = () => { void reportWorker.tick().catch(() => logger.warn({ event: 'report_worker_failed' }, 'Report worker failed')); };
  pollReport(); setInterval(pollReport,5000).unref();
  const pollPostDiagnosis = () => { void postDiagnosisWorker.tick().catch(() => logger.warn({ event: 'post_diagnosis_worker_failed' }, 'Post diagnosis worker failed')); };
  pollPostDiagnosis(); setInterval(pollPostDiagnosis,5000).unref();
  const pollInterview = () => { void interviewWorker.tick().catch(() => logger.warn({ event: 'interview_worker_failed' }, 'Interview worker failed')); };
  pollInterview(); setInterval(pollInterview,5000).unref();
  const pollPreparation = () => { void preparationWorker.tick().catch(() => logger.warn({ event: 'preparation_worker_failed' }, 'Preparation worker failed')); };
  pollPreparation();
  setInterval(pollPreparation, 5000).unref();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
