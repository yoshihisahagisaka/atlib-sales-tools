import { Router } from 'express';
import { z } from 'zod';
import {
  AXES,
  DOMAINS,
  QUESTIONS,
  QUESTION_SET_VERSION,
  buildAnswersSchema,
  buildSheetComments,
  scoreSubmission,
} from '../domain/kaizenDiagnostic';
import { createIpRateLimiter } from '../middleware/rateLimit';
import { sendSlackNotification } from '../services/slackNotifier';
import type { Mailer } from '../services/mailer';
import type { Config } from '../config';
import type { KaizenDiagnosticRepo } from '../services/kaizenDiagnosticRepo';

const leadSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
});

const submissionSchema = leadSchema.extend({
  answers: buildAnswersSchema(),
});

const requestLinkSchema = z.object({
  company: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  hp: z.string().max(200).optional(), // ハニーポット。入力があればbot扱い
});

// corporate-site の LP（www.atlib.jp）から呼ばれるので、このエンドポイントだけ個別にCORSを許可する。
// リポジトリ全体に cors パッケージを追加するほどの規模ではないため、ヘッダを手動セットする。
const LP_ORIGIN = 'https://www.atlib.jp';

function withLpCors(router: Router): void {
  router.use('/request-link', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', LP_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
}

// 5回/時間/IP。無料Gap診断（19問）と同じ設定を踏襲。
const submitRateLimiter = createIpRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 });
const requestLinkRateLimiter = createIpRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 });

/**
 * 情シスKAIZEN診断（corporate-site LP `/joshisu-kaizen/` 向け）の公開受け口。
 * server.ts で認証ミドルウェアなしでマウントされる前提。
 *
 * routes/freeHearingAssessment.ts と同じ2本（questions / 回答submit）に加えて、
 * LPの軽量リード獲得フォーム用に request-link を新設する（LPは診断そのものを埋め込まず、
 * 「メールアドレス等を送ると診断フォームのURLが送られてくる」という2段階導線のため）。
 */
export function createKaizenDiagnosticRouter(
  repo: KaizenDiagnosticRepo,
  mailer: Mailer,
  config: Config,
): Router {
  const router = Router();
  withLpCors(router);

  // 配点・タグ・actionHintを除いたクライアント向け質問定義。フォームはこれを元に動的描画する。
  router.get('/questions', (_req, res) => {
    res.json({
      questionSetVersion: QUESTION_SET_VERSION,
      axes: AXES,
      domains: DOMAINS,
      questions: QUESTIONS.map((q) => ({
        id: q.id,
        domainId: q.domainId,
        axisId: q.axisId,
        prompt: q.prompt,
        options: q.options.map((o) => ({ value: o.value, label: o.label })),
      })),
    });
  });

  router.post('/', submitRateLimiter, async (req, res) => {
    const parsed = submissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const { companyName, contactName, email, phone, answers: rawAnswers } = parsed.data;
    const answerInputs = Object.entries(rawAnswers)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([questionId, value]) => ({ questionId, value }));

    const scored = scoreSubmission(answerInputs);

    let id: string;
    try {
      id = await repo.insertDiagnostic({
        inputSource: 'prospect',
        source: 'joshisu-kaizen-lp',
        companyName,
        contactName,
        email,
        phone,
        hearingDate: null,
        staffEmail: null,
        sourceIp: req.ip ?? null,
        questionSetVersion: scored.questionSetVersion,
        answers: scored.answers,
        scores: {
          axisRaw: scored.axisRaw,
          axisNormalized: scored.axisNormalized,
          unknownCount: scored.unknownCount,
          visibilityGapFlag: scored.visibilityGapFlag,
          securityUrgentFlag: scored.securityUrgentFlag,
          sheetComments: buildSheetComments(scored),
        },
        suggestedServices: scored.suggestedServices,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('kaizen diagnostic (prospect) insert failed:', err);
      res.status(500).json({ error: '送信に失敗しました。しばらくしてから再度お試しください。' });
      return;
    }

    // Slack通知はbest-effort（失敗してもクライアントへのレスポンスには影響させない。
    // ismsDiagnostic.tsと同じ方針）。本文に管理画面の結果シートURLを載せ、スタッフがすぐ確認できるようにする。
    const detailUrl = `${config.portalBaseUrl}/admin/kaizen-diagnostic-detail.html?id=${id}`;
    await sendSlackNotification(
      config.slack.webhookDiagnostic,
      [
        `*【情シスKAIZEN診断】新規回答: ${companyName} 様*`,
        `担当者: ${contactName} / メール: ${email}${phone ? ` / 電話番号: ${phone}` : ''}`,
        `詳細を管理画面で確認: ${detailUrl}`,
      ].join('\n'),
    );

    // 顧客にはスコア・提案候補サービスを一切返さない（受付完了のみ）。無料Gap診断と同じ方針。
    res.status(204).end();
  });

  // corporate-site の LP から呼ばれる軽量リード獲得エンドポイント。
  router.post('/request-link', requestLinkRateLimiter, async (req, res) => {
    const parsed = requestLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '入力内容をご確認ください。' });
      return;
    }
    const { company, name, email, phone, hp } = parsed.data;

    // ハニーポットに入力があればbot。成否を返さず正常終了扱いにする。
    if (hp) {
      res.status(204).end();
      return;
    }

    const params = new URLSearchParams({ company, name, email });
    const formUrl = `${config.portalBaseUrl}/kaizen-diagnostic.html?${params.toString()}`;

    try {
      await mailer.sendKaizenDiagnosticLinkEmail(email, { name, formUrl });
      await mailer.sendKaizenLeadNotification(config.diagnosticNotifyEmail, { company, name, email, phone });
      await sendSlackNotification(
        config.slack.webhookDiagnostic,
        `[情シスKAIZEN LP] 診断リンク送付依頼: ${company} 様（${name} / ${email}${phone ? ' / ' + phone : ''}）`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('kaizen diagnostic request-link failed:', err);
      res.status(502).json({ error: '送信に失敗しました。時間をおいて再度お試しください。' });
      return;
    }

    res.status(204).end();
  });

  return router;
}
