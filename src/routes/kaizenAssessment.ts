import { Router } from 'express';
import { z } from 'zod';
import {
  CATALOG_VERSION,
  PRE_SURVEY_QUESTIONS,
  PRE_SURVEY_VERSION,
  buildPreSurveySchema,
  buildPreSurveySnapshot,
  extractEmployeeBand,
} from '../domain/kaizenAssessment';
import { createIpRateLimiter } from '../middleware/rateLimit';
import { sendSlackNotification } from '../services/slackNotifier';
import type { Mailer } from '../services/mailer';
import type { Config } from '../config';
import type { KaizenAssessmentRepo } from '../services/kaizenAssessmentRepo';

const leadSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  hp: z.string().max(200).optional(), // ハニーポット
});

const submitRateLimiter = createIpRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 });

/**
 * 情シスKAIZEN｜60分無料診断の公開受け口（事前アンケート）。
 * server.ts で認証ミドルウェアなしでマウントされる前提。sales.atlib.jp 自ドメインで配信する
 * 専用ページ（kaizen-assessment-intake.html）から呼ばれるため CORS は不要。
 *
 * 既存の自己採点12問（/api/kaizen-diagnostic）とは別系統。こちらは「LP → 事前アンケート →
 * 担当者主導の60分診断」の入口で、アンケート自体がフォーム。顧客へフォームURLメールは送らず、
 * 受付完了(204)＋スタッフへメール/Slack通知のみ（60分面談の日程は人が調整する）。
 */
export function createKaizenAssessmentRouter(
  repo: KaizenAssessmentRepo,
  mailer: Mailer,
  config: Config,
): Router {
  const router = Router();
  const preSurveySchema = leadSchema.extend({ preSurvey: buildPreSurveySchema() });

  router.get('/pre-survey/questions', (_req, res) => {
    res.json({
      preSurveyVersion: PRE_SURVEY_VERSION,
      questions: PRE_SURVEY_QUESTIONS.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        required: q.required,
        maxSelect: q.maxSelect ?? null,
        allowOther: q.allowOther ?? false,
        options: q.options,
      })),
    });
  });

  router.post('/pre-survey', submitRateLimiter, async (req, res) => {
    const parsed = preSurveySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '入力内容をご確認ください。' });
      return;
    }
    const { companyName, contactName, email, phone, hp, preSurvey } = parsed.data;

    // ハニーポット命中は静かに正常終了扱い。
    if (hp) {
      res.status(204).end();
      return;
    }

    const snapshot = buildPreSurveySnapshot(preSurvey as Record<string, unknown>);
    const employeeBand = extractEmployeeBand(preSurvey as Record<string, unknown>);

    let id: string;
    try {
      id = await repo.insert({
        inputSource: 'prospect',
        source: 'joshisu-kaizen-lp-v5',
        companyName,
        contactName,
        email,
        phone,
        employeeBand,
        sourceIp: req.ip ?? null,
        catalogVersion: CATALOG_VERSION,
        preSurvey: snapshot,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('kaizen assessment pre-survey insert failed:', err);
      res.status(500).json({ error: '送信に失敗しました。しばらくしてから再度お試しください。' });
      return;
    }

    // スタッフ通知はbest-effort（失敗してもクライアントには影響させない）。
    const detailUrl = `${config.portalBaseUrl}/admin/kaizen-assessment-detail.html?id=${id}`;
    try {
      await mailer.sendKaizenLeadNotification(config.diagnosticNotifyEmail, {
        company: companyName,
        name: contactName,
        email,
        phone,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('kaizen assessment lead mail failed:', err);
    }
    await sendSlackNotification(
      config.slack.webhookDiagnostic,
      [
        `*【情シスKAIZEN 60分診断】事前アンケート受信: ${companyName} 様*`,
        `担当者: ${contactName} / メール: ${email}${phone ? ` / 電話: ${phone}` : ''}`,
        `管理画面で確認し、AI事前ブリーフを生成してください: ${detailUrl}`,
      ].join('\n'),
    );

    res.status(204).end();
  });

  return router;
}
