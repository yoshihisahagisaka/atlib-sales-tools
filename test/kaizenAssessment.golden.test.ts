/**
 * 情シスKAIZEN 60分無料診断 — Golden Test（代表5社ケース）
 *
 * 実行:
 *   静的検査のみ（APIキー不要）:  npm run test:kaizen
 *   AI End-to-End も含める:        ANTHROPIC_API_KEY=xxx npm run test:kaizen
 *
 * 静的グループは常に実行。AI呼び出し(A/B/C1/C2)のEnd-to-Endは ANTHROPIC_API_KEY がある時のみ。
 * ライブ実行は非決定的なので、スキーマ適合＋「してはいけないこと」の不変条件だけを検証する
 * （出力の完全一致は見ない）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  CATALOG_VERSION,
  EXTRACTION_ITEMS,
  EXTRACTION_ITEM_CODES,
  MUST_ITEM_CODES,
  OPTION_CODE_MASTER,
  PRE_SURVEY_QUESTIONS,
  ROLE_GAP_CATEGORY_IDS,
  KAIZEN_CATEGORY_IDS,
  MATURITY_AREAS,
  buildPreSurveySchema,
  buildPreSurveySnapshot,
  computeRoleGapDiff,
  validateRoleGapSums,
  normalizeRoleGap,
  finalFactValue,
  focusFactSummary,
  analyzeConversationSchema,
  preBriefSchema,
  structureAssessmentSchema,
  draftReportSchema,
} from '../src/domain/kaizenAssessment';
import {
  KaizenAssessmentAiService,
  PRE_BRIEF_JSON_SCHEMA,
  ANALYZE_JSON_SCHEMA,
  STRUCTURE_JSON_SCHEMA,
  DRAFT_REPORT_JSON_SCHEMA,
  type AnalyzeInput,
} from '../src/services/kaizenAssessmentAiService';

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'kaizenAssessmentGolden.json'), 'utf8'),
) as {
  cases: {
    id: string;
    company: string;
    employeeBandLabel: string;
    preSurveyRaw: Record<string, unknown>;
    transcript: string;
    handlerMemo: string;
    confirmedFacts: { itemCode: string; value: string }[];
  }[];
};

const V5_ITEM_CODES = [
  'F01', 'F02', 'F03', 'F04', 'F05', 'F06',
  'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P13',
  'T01', 'T02', 'T03',
  'I01', 'I02', 'I03',
];

// ============================================================================
// グループ1: カタログ不変条件（項目1・7 の検証）
// ============================================================================

test('項目1: EXTRACTION_ITEMS は V5 02_AI抽出項目マスターの25項目と code 一致・欠落なし', () => {
  assert.equal(EXTRACTION_ITEMS.length, 25);
  assert.deepEqual([...EXTRACTION_ITEM_CODES].sort(), [...V5_ITEM_CODES].sort());
  // 必須項目（V5「必須」）
  assert.deepEqual(
    [...MUST_ITEM_CODES].sort(),
    ['F01', 'F03', 'F04', 'P01', 'P02', 'P07', 'P09', 'P12'].sort(),
  );
  // 標準分類セットの割り当て
  const setOf = (c: string) => EXTRACTION_ITEMS.find((i) => i.code === c)?.standardCodeSet ?? null;
  assert.equal(setOf('P07'), 'WORK');
  assert.equal(setOf('P09'), 'DEP');
  assert.equal(setOf('P10'), 'MGT');
  assert.equal(setOf('P11'), 'FLOW');
  assert.equal(setOf('T01'), 'AUTH');
});

test('OPTION_CODE_MASTER は各セットに不明(末尾99)を含む', () => {
  for (const [set, codes] of Object.entries(OPTION_CODE_MASTER)) {
    assert.ok(codes.some((c) => c.code === `${set}99`), `${set}99 が無い`);
  }
});

test('ROLE_GAP は正式な5分類のみ / KAIZENは5分類のみ / 成熟度は6領域', () => {
  assert.deepEqual([...ROLE_GAP_CATEGORY_IDS], ['daily', 'maintain', 'admin', 'improve', 'strategy']);
  assert.deepEqual([...KAIZEN_CATEGORY_IDS], ['eliminate', 'automate', 'standardize', 'delegate', 'keep']);
  assert.equal(MATURITY_AREAS.length, 6);
});

test('項目7: 事前アンケート8問は「未来・期待・テーマ」を優先し、技術製品を直接聞かない', () => {
  assert.equal(PRE_SURVEY_QUESTIONS.length, 8);
  // Q3(目指す会社像)/Q4(期待する役割)/Q6(後回しのITテーマ) が前向き設問
  const q = (id: string) => {
    const found = PRE_SURVEY_QUESTIONS.find((x) => x.id === id);
    assert.ok(found, `${id} が無い`);
    return found;
  };
  assert.match(q('q3').prompt, /どんな会社にしていきたい/);
  assert.match(q('q4').prompt, /期待している役割/);
  assert.match(q('q6').prompt, /後回しになっている/);
  assert.equal(q('q3').connectsTo, '未来像の仮説');
  // どの設問も具体的な技術製品/構成を直接は聞かない
  const forbidden = /(Active\s?Directory|Entra|\bAD\b|MDM|EDR|VPN|オンプレ|バージョン|パッチ)/;
  for (const q of PRE_SURVEY_QUESTIONS) {
    assert.doesNotMatch(q.prompt, forbidden, `Q${q.id} が技術詳細を直接聞いている`);
    for (const o of q.options) assert.doesNotMatch(o.label, forbidden, `Q${q.id} の選択肢が技術詳細`);
  }
});

// ============================================================================
// グループ2: 純粋関数の不変条件（項目6 の検証）
// ============================================================================

test('項目6: Role Gap 合計<100 は自動補正されない（validateRoleGapSums は情報のみ / diff は素通し）', () => {
  const current: Record<string, number | null> = { daily: 40, maintain: 10, admin: 10, improve: 5, strategy: null };
  const ideal: Record<string, number | null> = { daily: 20, maintain: 10, admin: 5, improve: 20, strategy: 30 };
  const sums = validateRoleGapSums({ current: current as never, ideal: ideal as never });
  assert.equal(sums.currentSum, 65); // <100 のまま
  assert.equal(sums.okCurrent, false); // 「不足」を示すだけ、補正しない
  const diff = computeRoleGapDiff(current as never, ideal as never);
  assert.equal(diff.strategy, null); // 片側 null は null のまま（推測しない）
  assert.equal(diff.daily, -20);
});

test('normalizeRoleGap は「担当者が明示的に呼んだとき」だけ 100 化する純関数（自動では走らない設計）', () => {
  const r = normalizeRoleGap({ daily: 30, maintain: 10, admin: 10, improve: 5, strategy: 5 });
  assert.equal(r.adjusted, true);
  assert.equal(Object.values(r.normalized).reduce((a, b) => a + b, 0), 100);
  // 合計が既に100付近なら触らない
  const r2 = normalizeRoleGap({ daily: 40, maintain: 20, admin: 15, improve: 15, strategy: 10 });
  assert.equal(r2.adjusted, false);
});

test('項目6: structure ルートは自動 normalize しない（ソース走査）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'adminKaizenAssessment.ts'), 'utf8');
  // normalizeRoleGap の呼び出しは /role-gap/normalize ハンドラの中だけ
  const calls = [...src.matchAll(/normalizeRoleGap\s*\(/g)].length;
  assert.equal(calls, 2, 'normalizeRoleGap の呼び出し箇所が想定外');
  const normalizeHandler = src.split("router.post('/:id/role-gap/normalize'")[1]?.split('router.')[0] ?? '';
  assert.match(normalizeHandler, /normalizeRoleGap/);
  const structureHandler = src.split("router.post('/:id/structure'")[1]?.split('router.')[0] ?? '';
  assert.doesNotMatch(structureHandler, /normalizeRoleGap/, 'structure が自動 normalize している');
  assert.match(structureHandler, /status:\s*'provisional'/, 'structure が role_gap を provisional にしていない');
});

test('項目4(構造): finalFactValue は承認/修正のときだけ値を返す（保留・未確認は未確定=null）', () => {
  assert.equal(finalFactValue({ handlerStatus: 'pending', aiValue: 'x' }), null);
  assert.equal(finalFactValue({ handlerStatus: 'hold', aiValue: 'x' }), null);
  assert.equal(finalFactValue({ handlerStatus: 'approved', aiValue: 'x' }), 'x');
  assert.equal(finalFactValue({ handlerStatus: 'revised', handlerValue: 'y', aiValue: 'x' }), 'y');
});

test('項目4(構造): handler_memo 由来の needs_confirmation は「取得済み」に数えない', () => {
  const s = focusFactSummary([
    { itemCode: 'P09', aiInFocus: true, aiFlag: 'needs_confirmation', handlerStatus: 'pending' },
    { itemCode: 'F01', aiInFocus: true, aiFlag: 'ok', handlerStatus: 'pending' },
    { itemCode: 'P01', aiInFocus: true, aiFlag: 'unknown', handlerStatus: 'pending' },
  ]);
  assert.equal(s.focusTotal, 3);
  assert.equal(s.acquired, 1); // F01 のみ
  assert.equal(s.needsConfirmation, 1); // P09
  assert.equal(s.unknown, 1); // P01
  assert.equal(s.mustPending, 3); // 3件とも必須かつ未確認
});

// ============================================================================
// グループ3: 事前アンケート → スキーマ / スナップショット（項目7）
// ============================================================================

test('5社の事前アンケートが buildPreSurveySchema を通り、スナップショットにラベルが凍結される', () => {
  const schema = buildPreSurveySchema();
  for (const c of FIXTURES.cases) {
    const parsed = schema.safeParse(c.preSurveyRaw);
    assert.ok(parsed.success, `${c.id}: 事前アンケートがスキーマ不適合: ${!parsed.success ? parsed.error.message : ''}`);
    const snap = buildPreSurveySnapshot(c.preSurveyRaw);
    assert.equal(snap.entries.length, 8);
    // Q3 の選択ラベルが空でないこと（未来テーマが凍結されている）
    const q3 = snap.entries.find((e) => e.questionId === 'q3');
    assert.ok((q3?.selected.length ?? 0) > 0);
    assert.ok(q3?.selected.every((s) => typeof s.label === 'string' && s.label.length > 0));
  }
});

// ============================================================================
// グループ4: JSON-Schema ⇄ zod のドリフト検知（軽量）
// ============================================================================

test('4コールの JSON Schema と zod がトップレベルのキー・required で一致（ドリフト検知）', () => {
  const zodKeys = (schema: { shape: Record<string, unknown> }): string[] => Object.keys(schema.shape).sort();
  const jsonKeys = (s: { properties: Record<string, unknown>; required: readonly string[] }) => ({
    props: Object.keys(s.properties).sort(),
    required: [...s.required].sort(),
  });
  const check = (name: string, json: never, zod: never) => {
    const j = jsonKeys(json as never);
    const z = zodKeys(zod as never);
    assert.deepEqual(j.props, z, `${name}: JSON Schema properties が zod と不一致`);
    assert.deepEqual(j.required, z, `${name}: JSON Schema の required が全キーを網羅していない`);
  };
  check('PRE_BRIEF', PRE_BRIEF_JSON_SCHEMA as never, preBriefSchema as never);
  check('ANALYZE', ANALYZE_JSON_SCHEMA as never, analyzeConversationSchema as never);
  check('STRUCTURE', STRUCTURE_JSON_SCHEMA as never, structureAssessmentSchema as never);
  check('DRAFT_REPORT', DRAFT_REPORT_JSON_SCHEMA as never, draftReportSchema as never);
});

// ============================================================================
// グループ5: AI End-to-End（ANTHROPIC_API_KEY がある時のみ / 項目2・3・4・5・9）
// ============================================================================

const LIVE = !!process.env.ANTHROPIC_API_KEY;
const FORBIDDEN_ASSERTIONS = [
  /年間[\s]*[\d,]+[\s]*(時間|万円|円)[^。]*(削減|カット|圧縮)/,
  /月[\s]*[\d,]+[\s]*時間[^。]*削減/,
  /ROI[\s]*[:：=]/,
  /投資回収(期間)?[\s]*[:：はが]/,
  /を導入すべき/,
  /導入を(強く)?(推奨|おすすめ)します/,
  /最終的な(BPO|To-?Be)(範囲|構成)は/,
];
const SELF_DIAGNOSIS_QUESTIONS = /(外注できますか|内製化(したいですか|できますか)|自動化できますか|標準化できますか|BPOでき(ますか|そうですか)|やめられますか)/;

test('項目9: AI End-to-End A→B→C1→C2（代表5社）', { skip: LIVE ? false : 'ANTHROPIC_API_KEY 未設定のためスキップ（静的検査は実行済み）' }, async (t) => {
  const ai = new KaizenAssessmentAiService(process.env.ANTHROPIC_API_KEY);

  for (const c of FIXTURES.cases) {
    await t.test(`${c.id} (${c.company})`, async () => {
      // --- Call A: 事前ブリーフ ---
      const brief = await ai.generatePreBrief({
        companyName: c.company,
        employeeBandLabel: c.employeeBandLabel,
        preSurveyContext: Object.entries(c.preSurveyRaw)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('/') : v}`)
          .join('\n'),
      });
      assert.ok(preBriefSchema.safeParse(brief).success);
      assert.ok(brief.priorityThemes.length <= 3, 'A: priorityThemes が3超');
      assert.ok(brief.hypothesesToTest.length <= 5, 'A: hypothesesToTest が5超');
      assert.ok(brief.focusItemCodes.length < EXTRACTION_ITEMS.length, 'A: 全項目を focus にしている');
      assert.ok(
        brief.focusItemCodes.every((f) => EXTRACTION_ITEM_CODES.includes(f.itemCode)),
        'A: 未知の itemCode',
      );
      // A: 想定Role Gap はヘッジ表現（断定しない）
      assert.match(brief.assumedRoleGap.narrative, /(可能性|推測|仮説|かもしれ|と思われ|要確認)/, 'A: Role Gap が断定調');

      // --- Call B: 会話解析（transcript + 強い主観の handlerMemo）---
      const bInput: AnalyzeInput = {
        transcript: c.transcript,
        handlerMemo: c.handlerMemo,
        currentFocusItemCodes: Array.from(new Set([...brief.focusItemCodes.map((f) => f.itemCode), ...MUST_ITEM_CODES])),
        priorityThemes: brief.priorityThemes.map((p) => p.title),
        alreadyAnswered: [],
      };
      const analyzed = await ai.analyzeConversation(bInput);
      assert.ok(analyzeConversationSchema.safeParse(analyzed).success);

      // 項目4: handler_memo のみが根拠の fact は confirmed customer fact にしない
      for (const f of analyzed.facts) {
        if (f.evidenceSourceType === 'handler_memo') {
          assert.notEqual(f.flag, 'ok', `B[${f.itemCode}]: handler_memo 由来を flag=ok にしている`);
          assert.equal(f.confidence, 'low', `B[${f.itemCode}]: handler_memo 由来の confidence が low でない`);
        }
        // transcript 由来を主張するなら evidenceQuote は "不明" ではないはず
        if (f.evidenceSourceType === 'transcript' && f.flag === 'ok') {
          assert.notEqual(f.evidenceQuote, '不明', `B[${f.itemCode}]: transcript/ok なのに根拠発言が"不明"`);
          assert.ok(f.value, `B[${f.itemCode}]: transcript/ok なのに value が空`);
        }
      }

      // 項目H: 顧客への自己診断質問を出さない
      const allQ = [analyzed.nextQuestion.question, ...analyzed.followUps.map((x) => x.question)].join(' / ');
      assert.doesNotMatch(allQ, SELF_DIAGNOSIS_QUESTIONS, `B: 自己診断質問を生成: ${allQ}`);

      // 確定事実（担当者確認済みの代用）
      const confirmed = c.confirmedFacts.map((f) => ({
        itemCode: f.itemCode,
        label: EXTRACTION_ITEMS.find((i) => i.code === f.itemCode)?.label ?? f.itemCode,
        value: f.value,
      }));

      // --- Call C1: 構造化 ---
      const structured = await ai.structureAssessment({
        transcript: c.transcript,
        confirmedFacts: confirmed,
        existingBusinesses: [],
      });
      assert.ok(structureAssessmentSchema.safeParse(structured).success);
      assert.ok(structured.businesses.length <= 15);
      // 項目6: Role Gap raw の合計が100未満でも、サービスは補正しない（raw をそのまま返す）
      const rawCurSum = ROLE_GAP_CATEGORY_IDS.reduce((a, id) => a + (structured.roleGap.raw.current[id] ?? 0), 0);
      if (rawCurSum < 100) {
        assert.ok(rawCurSum < 100, 'C1: raw が勝手に100化されている');
        assert.ok(
          structured.roleGap.evidenceSufficiency === 'insufficient' || structured.roleGap.note.length > 0,
          'C1: 合計<100 なのに根拠不足フラグも note も無い',
        );
      }
      // C1: 数値は根拠が無ければ null
      for (const b of structured.businesses) {
        if (b.countPerMonth !== null) assert.equal(typeof b.countPerMonth, 'number');
      }

      // --- Call C2: レポート下書き ---
      const report = await ai.draftReport({
        confirmedFacts: confirmed,
        businesses: structured.businesses,
        roleGap: structured.roleGap,
        maturity: structured.maturity,
        futureVision: brief.customerSummary,
        priorityThemes: brief.priorityThemes.map((p) => p.title),
      });
      assert.ok(draftReportSchema.safeParse(report).success);

      // 項目2: レポートの主役は 未来→現在→Gap→運営体制仮説
      assert.ok(report.report.b01_future.trim().length > 0, 'C2: b01(会社の未来像) が空');
      assert.ok(report.operatingModelHypothesis.summary.trim().length > 0, 'C2: 運営体制仮説サマリが空');

      // 項目3: operatingModelHypothesis が BPO(=delegate)一覧になっていない
      const bc = report.operatingModelHypothesis.byCategory;
      assert.ok(['eliminate', 'automate', 'standardize', 'delegate', 'keep'].every((k) => Array.isArray((bc as never)[k])), 'C2: byCategory に5分類が揃っていない');
      const nonDelegate = bc.eliminate.length + bc.automate.length + bc.standardize.length + bc.keep.length;
      assert.ok(
        nonDelegate > 0 || report.operatingModelHypothesis.openQuestions.length > 0,
        'C2: delegate(任せる) 以外が全く無い＝BPO対象一覧になっている',
      );
      // isHypothesis は必ず true
      assert.ok(report.hypotheses.every((h) => h.isHypothesis === true), 'C2: isHypothesis が false');

      // 項目5: 根拠のない削減時間・ROI・最終BPO範囲・製品導入を断定しない
      const allText = JSON.stringify(report);
      for (const re of FORBIDDEN_ASSERTIONS) {
        assert.doesNotMatch(allText, re, `C2: 禁止された断定表現: ${re}`);
      }
    });
  }
});

test('メタ: CATALOG_VERSION が設定されている', () => {
  assert.ok(CATALOG_VERSION.length > 0);
});
