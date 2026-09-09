import { Router } from 'express';
import { z } from 'zod';
import {
  BUSINESS_OPERATING_FIELDS,
  CATALOG_VERSION,
  EXTRACTION_ITEMS,
  KAIZEN_CATEGORIES,
  MATURITY_AREAS,
  MUST_ITEM_CODES,
  OPTION_CODE_MASTER,
  PRE_SURVEY_QUESTIONS,
  PRE_SURVEY_VERSION,
  ROLE_GAP_CATEGORIES,
  buildPreSurveySchema,
  buildPreSurveySnapshot,
  buildPreBriefContext,
  computeRoleGapDiff,
  extractEmployeeBand,
  normalizeRoleGap,
  rollupMaturity,
  validateRoleGapSums,
  type PreBrief,
  type RoleGapDistribution,
} from '../domain/kaizenAssessment';
import {
  KaizenAssessmentAiNotConfiguredError,
  type KaizenAssessmentAiService,
} from '../services/kaizenAssessmentAiService';
import type {
  AiRunLogEntry,
  KaizenAssessmentRepo,
  MaturityBlob,
  ReviewStatus,
  RoleGapBlob,
  WorkflowStage,
} from '../services/kaizenAssessmentRepo';

const reviewStatusSchema = z.enum(['new', 'contacted', 'closed']);
const inputSourceSchema = z.enum(['staff', 'prospect']);
const workflowStageSchema = z.enum([
  'pre_survey',
  'briefed',
  'interviewing',
  'items_review',
  'structured',
  'report_draft',
  'report_final',
]);

const listQuerySchema = z.object({
  status: reviewStatusSchema.optional(),
  workflowStage: workflowStageSchema.optional(),
  inputSource: inputSourceSchema.optional(),
  converted: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const staffCreateSchema = z
  .object({
    prospectCompanyName: z.string().min(1).max(200),
    hearingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください'),
    contactName: z.string().max(200).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(50).optional(),
  })
  .extend({ preSurvey: buildPreSurveySchema() });

const analyzeSchema = z.object({
  transcript: z.string().min(1).max(200_000),
  handlerMemo: z.string().max(20_000).optional(),
});

const factPatchSchema = z.object({
  handlerStatus: z.enum(['pending', 'approved', 'revised', 'hold']),
  handlerValue: z.string().max(4000).nullish(),
  handlerStandardCode: z.string().max(20).nullish(),
  handlerNote: z.string().max(4000).nullish(),
});

const roleGapNums = z.object({
  daily: z.number().min(0).max(100),
  maintain: z.number().min(0).max(100),
  admin: z.number().min(0).max(100),
  improve: z.number().min(0).max(100),
  strategy: z.number().min(0).max(100),
});
const roleGapPatchSchema = z.object({
  current: roleGapNums,
  ideal: roleGapNums,
  note: z.string().max(4000).optional(),
});

const maturityPatchSchema = z.object({
  areas: z.array(
    z.object({
      areaId: z.string(),
      handlerScore: z.number().int().min(1).max(5),
      evidence: z.string().max(4000).optional(),
    }),
  ),
});

const businessesPatchSchema = z.object({ businesses: z.array(z.record(z.unknown())).max(30) });
const hypothesesPatchSchema = z.object({ hypotheses: z.array(z.record(z.unknown())).max(30) });
const reportDraftPatchSchema = z.object({
  blocks: z.object({
    b01_future: z.string().max(20000),
    b02_idealJoshisu: z.string().max(20000),
    b03_gap: z.record(z.unknown()),
    b04_timeShift: z.record(z.unknown()),
    b05_priorityKaizen: z.array(z.record(z.unknown())),
    b06_next90days: z.array(z.record(z.unknown())),
  }),
  operatingModelHypothesis: z.record(z.unknown()).optional(),
});

const statusUpdateSchema = z.object({ status: reviewStatusSchema });
const conversionUpdateSchema = z.object({
  convertedToAssessment: z.boolean(),
  assessmentCaseCode: z.string().max(50).nullable(),
});

const preSurveyQuestionPayload = PRE_SURVEY_QUESTIONS.map((q) => ({
  id: q.id,
  prompt: q.prompt,
  type: q.type,
  required: q.required,
  maxSelect: q.maxSelect ?? null,
  allowOther: q.allowOther ?? false,
  options: q.options,
}));

const domainDefinitions = {
  catalogVersion: CATALOG_VERSION,
  preSurveyVersion: PRE_SURVEY_VERSION,
  extractionItems: EXTRACTION_ITEMS,
  mustItemCodes: MUST_ITEM_CODES,
  optionCodeMaster: OPTION_CODE_MASTER,
  roleGapCategories: ROLE_GAP_CATEGORIES,
  maturityAreas: MATURITY_AREAS,
  kaizenCategories: KAIZEN_CATEGORIES,
  businessOperatingFields: BUSINESS_OPERATING_FIELDS,
};

const EXTRACTION_LABEL: Record<string, string> = EXTRACTION_ITEMS.reduce(
  (acc, i) => {
    acc[i.code] = i.label;
    return acc;
  },
  {} as Record<string, string>,
);

/** Anthropic SDK のタイムアウト系エラーか（接続/読取タイムアウト）。 */
function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  const msg = (err as Error)?.message ?? '';
  return /timeout/i.test(name) || /timed? ?out/i.test(msg);
}

/** requireStaffAuth の配下でマウントされる前提（server.ts で適用）。 */
export function createAdminKaizenAssessmentRouter(
  repo: KaizenAssessmentRepo,
  ai: KaizenAssessmentAiService,
): Router {
  const router = Router();

  // AIステップの共通ラッパー: 実行 → ai_run_log 追記 → 失敗時のステータス出し分け。
  async function runAiStep<T>(
    id: string,
    step: AiRunLogEntry['step'],
    fn: () => Promise<T>,
    res: import('express').Response,
  ): Promise<T | null> {
    const startedAt = Date.now();
    try {
      const result = await fn();
      await repo.appendAiRunLog(id, {
        step,
        model: 'claude-sonnet-5',
        at: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        ok: true,
      });
      return result;
    } catch (err) {
      await repo.appendAiRunLog(id, {
        step,
        model: 'claude-sonnet-5',
        at: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        ok: false,
        error: (err as Error)?.message?.slice(0, 500),
      });
      if (err instanceof KaizenAssessmentAiNotConfiguredError) {
        res.status(503).json({ error: 'AI機能は現在利用できません（APIキー未設定）。' });
        return null;
      }
      if (isTimeoutError(err)) {
        res.status(504).json({ error: '生成に時間がかかっています。もう一度お試しください。' });
        return null;
      }
      // eslint-disable-next-line no-console
      console.error(`kaizen-assessment AI step "${step}" failed:`, err);
      res.status(502).json({ error: 'AI処理に失敗しました。しばらくしてから再度お試しください。' });
      return null;
    }
  }

  // ---------------- カタログ ----------------
  router.get('/pre-survey/questions', (_req, res) => {
    res.json({ preSurveyVersion: PRE_SURVEY_VERSION, questions: preSurveyQuestionPayload });
  });

  // ---------------- 一覧 ----------------
  router.get('/', async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query' });
      return;
    }
    const { items, total } = await repo.list({
      status: parsed.data.status,
      workflowStage: parsed.data.workflowStage as WorkflowStage | undefined,
      inputSource: parsed.data.inputSource,
      converted: parsed.data.converted,
      limit: parsed.data.limit ?? 50,
      offset: parsed.data.offset ?? 0,
    });
    res.json({ items, total });
  });

  // ---------------- スタッフ代理入力 ----------------
  router.post('/', async (req, res) => {
    const parsed = staffCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const { prospectCompanyName, hearingDate, contactName, email, phone, preSurvey } = parsed.data;
    const raw = preSurvey as Record<string, unknown>;
    try {
      const id = await repo.insert({
        inputSource: 'staff',
        source: 'joshisu-kaizen-lp-v5',
        companyName: prospectCompanyName,
        contactName: contactName ?? null,
        email: email ?? null,
        phone: phone ?? null,
        employeeBand: extractEmployeeBand(raw),
        hearingDate,
        staffEmail: req.staffEmail ?? null,
        catalogVersion: CATALOG_VERSION,
        preSurvey: buildPreSurveySnapshot(raw),
      });
      res.status(201).json({ id });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('kaizen assessment (staff) insert failed:', err);
      res.status(500).json({ error: '保存に失敗しました。' });
    }
  });

  // ---------------- 詳細 ----------------
  router.get('/:id', async (req, res) => {
    const item = await repo.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ ...item, definitions: domainDefinitions });
  });

  // ---------------- Call A: AI事前ブリーフ（手動生成のみ） ----------------
  router.post('/:id/pre-brief', async (req, res) => {
    const id = req.params.id;
    const item = await repo.findById(id);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const q1 = item.preSurvey.entries.find((e) => e.questionId === 'q1');
    const employeeBandLabel = q1?.selected[0]?.label ?? '(未回答)';

    const preBrief = await runAiStep(
      id,
      'pre_brief',
      () =>
        ai.generatePreBrief({
          companyName: item.companyName,
          employeeBandLabel,
          preSurveyContext: buildPreBriefContext(item.preSurvey),
        }),
      res,
    );
    if (!preBrief) return;

    await repo.savePreBrief(id, {
      ...preBrief,
      _meta: { model: 'claude-sonnet-5', promptVersion: CATALOG_VERSION, generatedAt: new Date().toISOString() },
    });
    res.json(preBrief);
  });

  // ---------------- Call B: 会話解析 ----------------
  router.post('/:id/interview/analyze', async (req, res) => {
    const id = req.params.id;
    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const item = await repo.findById(id);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const preBrief = (item.aiPreBrief ?? null) as (PreBrief & { _meta?: unknown }) | null;
    const briefFocus = preBrief?.focusItemCodes?.map((f) => f.itemCode) ?? [];
    const existingFocus = item.facts.filter((f) => f.aiInFocus).map((f) => f.itemCode);
    const currentFocus = Array.from(new Set([...briefFocus, ...existingFocus, ...MUST_ITEM_CODES]));
    const priorityThemes = preBrief?.priorityThemes?.map((t) => t.title) ?? [];
    const alreadyAnswered = item.facts
      .filter((f) => f.handlerStatus === 'approved' || f.handlerStatus === 'revised')
      .map((f) => ({
        itemCode: f.itemCode,
        handlerStatus: f.handlerStatus,
        finalValuePresent: f.finalValue !== null,
      }));

    const handlerMemo = parsed.data.handlerMemo ?? '';

    const result = await runAiStep(
      id,
      'analyze',
      () =>
        ai.analyzeConversation({
          transcript: parsed.data.transcript,
          handlerMemo,
          currentFocusItemCodes: currentFocus,
          priorityThemes,
          alreadyAnswered,
        }),
      res,
    );
    if (!result) return;

    const runSeq = await repo.nextAiRunSeq(id);
    const focusMap = new Map(result.focusItems.map((f) => [f.itemCode, f]));
    // upsert 対象 = AIが返した facts ∪ focusItems ∪ 必須項目
    const codes = Array.from(
      new Set([
        ...result.facts.map((f) => f.itemCode),
        ...result.focusItems.map((f) => f.itemCode),
        ...MUST_ITEM_CODES,
      ]),
    ).filter((c) => EXTRACTION_LABEL[c] !== undefined);
    const factByCode = new Map(result.facts.map((f) => [f.itemCode, f]));

    const upserts = codes.map((code) => {
      const f = factByCode.get(code);
      const inFocus = focusMap.has(code) || MUST_ITEM_CODES.includes(code);
      return {
        itemCode: code,
        catalogVersion: item.catalogVersion,
        aiValue: f?.value ?? null,
        aiStandardCode: f?.standardCode ?? null,
        aiConfidence: f?.confidence ?? null,
        aiEvidenceQuote: f?.evidenceQuote ?? null,
        aiEvidenceSourceType: f?.evidenceSourceType ?? null,
        aiFlag: f?.flag ?? null,
        aiFollowupQuestion: f?.followupQuestion ?? null,
        aiInFocus: inFocus,
        aiFocusReason: focusMap.get(code)?.reason ?? (MUST_ITEM_CODES.includes(code) ? '必須項目' : null),
        aiRunSeq: runSeq,
      };
    });
    await repo.upsertAiFacts(id, upserts);

    // interview 更新
    const nav = [...item.interview.navHistory, {
      at: new Date().toISOString(),
      aiRunSeq: runSeq,
      nextQuestion: result.nextQuestion.question,
    }].slice(-50);
    await repo.saveInterview(id, {
      ...item.interview,
      transcript: parsed.data.transcript,
      handlerMemo,
      navHistory: nav,
      lastAnalyzedAt: new Date().toISOString(),
      aiRunSeq: runSeq,
    });

    res.json(result);
  });

  // ---------------- 担当者: fact 承認/修正/保留 ----------------
  router.patch('/:id/facts/:itemCode', async (req, res) => {
    const parsed = factPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    if (EXTRACTION_LABEL[req.params.itemCode] === undefined) {
      res.status(400).json({ error: 'Unknown item code' });
      return;
    }
    const ok = await repo.patchHandlerFact(req.params.id, req.params.itemCode, {
      handlerStatus: parsed.data.handlerStatus,
      handlerValue: parsed.data.handlerValue ?? null,
      handlerStandardCode: parsed.data.handlerStandardCode ?? null,
      handlerNote: parsed.data.handlerNote ?? null,
      handlerBy: req.staffEmail ?? 'unknown',
    });
    if (!ok) {
      res.status(404).json({ error: 'Fact row not found (analyze を実行して対象項目を作成してください)' });
      return;
    }
    res.status(204).end();
  });

  // ---------------- Call C1: 構造化（業務・Role Gap・成熟度） ----------------
  router.post('/:id/structure', async (req, res) => {
    const id = req.params.id;
    const item = await repo.findById(id);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const confirmedFacts = item.facts
      .filter((f) => f.finalValue !== null)
      .map((f) => ({ itemCode: f.itemCode, label: EXTRACTION_LABEL[f.itemCode] ?? f.itemCode, value: f.finalValue as string }));

    const result = await runAiStep(
      id,
      'structure',
      () =>
        ai.structureAssessment({
          transcript: item.interview.transcript,
          confirmedFacts,
          existingBusinesses: item.businesses,
        }),
      res,
    );
    if (!result) return;

    const aiRawCurrent = result.roleGap.raw.current as RoleGapDistribution;
    const aiRawIdeal = result.roleGap.raw.ideal as RoleGapDistribution;
    const sums = validateRoleGapSums({ current: aiRawCurrent, ideal: aiRawIdeal });
    const roleGap: RoleGapBlob = {
      aiRaw: { current: aiRawCurrent, ideal: aiRawIdeal },
      aiEstimate: result.roleGap.estimate,
      handler: null,
      diff: computeRoleGapDiff(aiRawCurrent, aiRawIdeal),
      evidenceSufficiency: result.roleGap.evidenceSufficiency,
      status: 'provisional',
      currentSum: sums.currentSum,
      idealSum: sums.idealSum,
      note: result.roleGap.note,
    };

    const maturity: MaturityBlob = {
      areas: MATURITY_AREAS.map((a) => {
        const found = result.maturity.areas.find((x) => x.areaId === a.id);
        const score = found ? Math.min(5, Math.max(1, Math.round(found.score))) : null;
        return {
          areaId: a.id,
          label: a.label,
          aiScore: score,
          handlerScore: null,
          anchorMet: found?.anchorMet ?? '',
          evidence: found?.evidence ?? '',
        };
      }),
      overallGap: rollupMaturity(
        result.maturity.areas.map((x) => ({ areaId: x.areaId, aiScore: x.score })),
      ).overallGap,
      source: 'ai',
    };

    await repo.saveStructure(id, { businesses: result.businesses, roleGap, maturity });
    res.json({ businesses: result.businesses, roleGap, maturity });
  });

  router.patch('/:id/businesses', async (req, res) => {
    const parsed = businessesPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const ok = await repo.saveBusinesses(req.params.id, parsed.data.businesses);
    if (!ok) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  router.patch('/:id/role-gap', async (req, res) => {
    const parsed = roleGapPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const item = await repo.findById(req.params.id);
    if (!item || !item.roleGap) {
      res.status(404).json({ error: 'Role Gap がまだ生成されていません（構造化を実行してください）' });
      return;
    }
    const current = parsed.data.current;
    const ideal = parsed.data.ideal;
    const sums = validateRoleGapSums({ current, ideal });
    const updated: RoleGapBlob = {
      ...item.roleGap,
      handler: { current, ideal },
      diff: computeRoleGapDiff(current, ideal),
      status: 'confirmed',
      currentSum: sums.currentSum,
      idealSum: sums.idealSum,
      note: parsed.data.note ?? item.roleGap.note,
    };
    await repo.saveRoleGap(req.params.id, updated);
    res.status(204).end();
  });

  // 担当者が明示操作したときだけ 100% 正規化する（反映事項B: 自動実行しない）。
  router.post('/:id/role-gap/normalize', async (req, res) => {
    const item = await repo.findById(req.params.id);
    if (!item || !item.roleGap) {
      res.status(404).json({ error: 'Role Gap がまだ生成されていません' });
      return;
    }
    const base =
      item.roleGap.handler ??
      (item.roleGap.aiEstimate ? item.roleGap.aiEstimate : item.roleGap.aiRaw);
    const current = normalizeRoleGap(base.current as RoleGapDistribution).normalized;
    const ideal = normalizeRoleGap(base.ideal as RoleGapDistribution).normalized;
    const sums = validateRoleGapSums({ current, ideal });
    const updated: RoleGapBlob = {
      ...item.roleGap,
      handler: { current, ideal },
      diff: computeRoleGapDiff(current, ideal),
      status: 'confirmed',
      currentSum: sums.currentSum,
      idealSum: sums.idealSum,
    };
    await repo.saveRoleGap(req.params.id, updated);
    res.json(updated);
  });

  router.patch('/:id/maturity', async (req, res) => {
    const parsed = maturityPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const item = await repo.findById(req.params.id);
    if (!item || !item.maturity) {
      res.status(404).json({ error: '成熟度がまだ生成されていません（構造化を実行してください）' });
      return;
    }
    const patchByArea = new Map(parsed.data.areas.map((a) => [a.areaId, a]));
    const areas = item.maturity.areas.map((a) => {
      const p = patchByArea.get(a.areaId);
      return p
        ? { ...a, handlerScore: p.handlerScore, evidence: p.evidence ?? a.evidence }
        : a;
    });
    const updated: MaturityBlob = {
      areas,
      overallGap: rollupMaturity(
        areas.map((a) => ({ areaId: a.areaId, aiScore: a.aiScore, handlerScore: a.handlerScore })),
      ).overallGap,
      source: 'handler',
    };
    await repo.saveMaturity(req.params.id, updated);
    res.status(204).end();
  });

  // ---------------- Call C2: レポート下書き ----------------
  router.post('/:id/report-draft', async (req, res) => {
    const id = req.params.id;
    const item = await repo.findById(id);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const confirmedFacts = item.facts
      .filter((f) => f.finalValue !== null)
      .map((f) => ({ itemCode: f.itemCode, label: EXTRACTION_LABEL[f.itemCode] ?? f.itemCode, value: f.finalValue as string }));
    const preBrief = (item.aiPreBrief ?? null) as PreBrief | null;

    const result = await runAiStep(
      id,
      'report_draft',
      () =>
        ai.draftReport({
          confirmedFacts,
          businesses: item.businesses,
          roleGap: item.roleGap,
          maturity: item.maturity,
          futureVision: preBrief?.customerSummary ?? '',
          priorityThemes: preBrief?.priorityThemes?.map((t) => t.title) ?? [],
        }),
      res,
    );
    if (!result) return;

    const reportDraft = {
      operatingModelHypothesis: result.operatingModelHypothesis,
      blocks: result.report,
      generatedAt: new Date().toISOString(),
      model: 'claude-sonnet-5',
      promptVersion: CATALOG_VERSION,
      handlerEditedAt: null,
    };
    await repo.saveReportDraftGenerated(id, reportDraft, result.hypotheses);
    res.json({ reportDraft, hypotheses: result.hypotheses });
  });

  router.patch('/:id/report-draft', async (req, res) => {
    const parsed = reportDraftPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const item = await repo.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const prev = (item.reportDraft ?? {}) as Record<string, unknown>;
    const updated = {
      ...prev,
      operatingModelHypothesis: parsed.data.operatingModelHypothesis ?? prev.operatingModelHypothesis,
      blocks: parsed.data.blocks,
      handlerEditedAt: new Date().toISOString(),
    };
    await repo.saveReportDraftEdited(req.params.id, updated);
    res.status(204).end();
  });

  router.patch('/:id/kaizen-hypotheses', async (req, res) => {
    const parsed = hypothesesPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const ok = await repo.saveHypotheses(req.params.id, parsed.data.hypotheses);
    if (!ok) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  // ---------------- 対応状況 / 有償転換 ----------------
  router.patch('/:id/status', async (req, res) => {
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    const ok = await repo.updateReviewStatus(req.params.id, parsed.data.status as ReviewStatus);
    if (!ok) {
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
    const ok = await repo.updateConversion(req.params.id, {
      convertedToAssessment: parsed.data.convertedToAssessment,
      assessmentCaseCode: parsed.data.assessmentCaseCode,
    });
    if (!ok) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
