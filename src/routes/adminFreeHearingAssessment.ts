import { Router } from 'express';
import { z } from 'zod';
import {
  AXES,
  DOMAINS,
  QUESTIONS,
  QUESTION_SET_VERSION,
  SUGGESTED_SERVICES,
  buildAnswersSchema,
  buildSheetComments,
  scoreSubmission,
} from '../domain/freeHearingAssessment';
import type { FreeHearingAssessmentRepo, ReviewStatus } from '../services/freeHearingAssessmentRepo';

const reviewStatusSchema = z.enum(['new', 'contacted', 'closed']);
const inputSourceSchema = z.enum(['staff', 'prospect']);

const listQuerySchema = z.object({
  status: reviewStatusSchema.optional(),
  inputSource: inputSourceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const staffSubmissionSchema = z.object({
  prospectCompanyName: z.string().min(1).max(200),
  hearingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください'),
  contactName: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  answers: buildAnswersSchema(),
});

const statusUpdateSchema = z.object({
  status: reviewStatusSchema,
});

const conversionUpdateSchema = z.object({
  convertedToAssessment: z.boolean(),
  // asmt+6桁連番。IT_アセスメント_SensorEdge流用_設計指示書.md 入手後に書式バリデーションを突合すること（現状は自由文字列）。
  assessmentCaseCode: z.string().max(50).nullable(),
});

/** requireStaffAuthの配下でマウントされる前提（server.ts側で適用）。 */
export function createAdminFreeHearingAssessmentRouter(repo: FreeHearingAssessmentRepo): Router {
  const router = Router();

  // スタッフ入力フォーム用。配点・タグ・actionHintは結果表示側で使うため管理APIでも返さない（回答スナップショットに凍結される）。
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

  router.get('/', async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query' });
      return;
    }
    const { items, total } = await repo.listAssessments({
      status: parsed.data.status,
      inputSource: parsed.data.inputSource,
      limit: parsed.data.limit ?? 50,
      offset: parsed.data.offset ?? 0,
    });
    res.json({ items, total });
  });

  router.post('/', async (req, res) => {
    const parsed = staffSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const { prospectCompanyName, hearingDate, contactName, email, phone, answers: rawAnswers } = parsed.data;
    const answerInputs = Object.entries(rawAnswers)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([questionId, value]) => ({ questionId, value }));

    const scored = scoreSubmission(answerInputs);

    let id: string;
    try {
      id = await repo.insertAssessment({
        inputSource: 'staff',
        companyName: prospectCompanyName,
        contactName: contactName ?? null,
        email: email ?? null,
        phone: phone ?? null,
        hearingDate,
        staffEmail: req.staffEmail ?? null,
        sourceIp: null,
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
      console.error('free hearing assessment (staff) insert failed:', err);
      res.status(500).json({ error: '保存に失敗しました。しばらくしてから再度お試しください。' });
      return;
    }

    res.status(201).json({ id });
  });

  router.get('/:id', async (req, res) => {
    const item = await repo.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    // 軸・領域・サービスの定義は結果シートの見出し・グルーピングに使う（HTML側にハードコードしない）。
    res.json({
      ...item,
      axisDefinitions: AXES,
      domainDefinitions: DOMAINS,
      suggestedServiceDefinitions: SUGGESTED_SERVICES,
    });
  });

  router.patch('/:id/status', async (req, res) => {
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const updated = await repo.updateReviewStatus(req.params.id, parsed.data.status as ReviewStatus);
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  router.patch('/:id/conversion', async (req, res) => {
    const parsed = conversionUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const updated = await repo.updateConversion(req.params.id, {
      convertedToAssessment: parsed.data.convertedToAssessment,
      assessmentCaseCode: parsed.data.assessmentCaseCode,
    });
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
