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
} from '../domain/freeHearingAssessment';
import { createIpRateLimiter } from '../middleware/rateLimit';
import type { FreeHearingAssessmentRepo } from '../services/freeHearingAssessmentRepo';

const leadSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
});

const submissionSchema = leadSchema.extend({
  answers: buildAnswersSchema(),
});

// 5回/時間/IP。19問と長く、正規利用者が短時間に何度も送信することは想定しにくいためISMS診断と同じ設定。
const submitRateLimiter = createIpRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 });

/**
 * 見込み客が自分で回答する公開フォームの受け口（無認証・IPレート制限のみ）。
 * server.ts で認証ミドルウェアなしでマウントされる前提。結果表（スコア・提案候補サービス）は
 * 一切返さず、atLIBスタッフが /admin/ 配下の結果シートで確認する運用。
 */
export function createFreeHearingAssessmentRouter(repo: FreeHearingAssessmentRepo): Router {
  const router = Router();

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

    try {
      await repo.insertAssessment({
        inputSource: 'prospect',
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
      console.error('free hearing assessment (prospect) insert failed:', err);
      res.status(500).json({ error: '送信に失敗しました。しばらくしてから再度お試しください。' });
      return;
    }

    // 顧客にはスコア・提案候補サービスを一切返さない（受付完了のみ）。
    res.status(204).end();
  });

  return router;
}
