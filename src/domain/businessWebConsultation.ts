import { z } from 'zod';

export const DIAGNOSIS_DEFINITION = 'business_web_self_check';
export const DIAGNOSIS_VERSION = '1.0';
export const LOGIC_VERSION = '1.0';
export const PREPARATION_DEFINITION = 'business_web_consultation_preparation';
export const PREPARATION_VERSION = '1.0';

const unknown = z.literal('UNKNOWN');
const numericOrUnknown = z.union([z.number().int().min(0).max(3), unknown]);
const axisSchema = z.object({
  level: z.enum(['SMALL', 'SOME', 'MODERATE', 'LARGE', 'UNKNOWN']),
  coverage: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  knownCount: z.number().int().min(0), eligibleCount: z.number().int().min(0), average: z.number().min(0).max(3).nullable(),
}).strict();

export const diagnosisSnapshotSchema = z.object({
  diagnosisDefinition: z.literal(DIAGNOSIS_DEFINITION),
  diagnosisVersion: z.literal(DIAGNOSIS_VERSION),
  logicVersion: z.literal(LOGIC_VERSION),
  originalAnswers: z.object({
    Q01: z.enum(['EXECUTIVE', 'MANAGER', 'IT', 'OPERATOR', 'OTHER']),
    Q02: z.array(z.enum(['NO_DUPLICATE_ENTRY', 'INSTANT_INFORMATION', 'REALTIME_VISIBILITY', 'TRANSFERABLE_WORK', 'SMOOTH_WORKFLOW', 'SCALABLE_OPERATION', 'SHARED_INFORMATION', 'FIT_FOR_BUSINESS', 'UNKNOWN'])).min(1).max(3),
    Q03: z.enum(['OPEN', 'CONDITIONAL', 'PRESERVE', 'UNKNOWN']),
    Q04: numericOrUnknown, Q05: numericOrUnknown, Q06: numericOrUnknown, Q07: numericOrUnknown, Q08: numericOrUnknown, Q09: numericOrUnknown, Q10: numericOrUnknown,
    Q11: z.union([numericOrUnknown, z.literal('N_A')]),
    Q12: z.array(z.enum(['EXCEL', 'GOOGLE_SHEETS', 'LOW_CODE_NO_CODE', 'BUSINESS_SAAS', 'PACKAGE_SYSTEM', 'CUSTOM_SYSTEM', 'EMAIL_CHAT', 'PAPER', 'OTHER'])).min(1),
    Q13: numericOrUnknown, Q14: numericOrUnknown,
    Q15: z.enum(['LOCAL', 'MULTIPLE_INDEPENDENT', 'CONNECTED', 'MULTI_DEPARTMENT', 'COMPANY_WIDE', 'UNKNOWN']),
  }).strict(),
  targetState: z.object({ clarity: z.enum(['CLEAR', 'UNKNOWN']), selected: z.array(z.string()).min(1).max(3) }).strict(),
  sixAxisGaps: z.object({ workflow: axisSchema, information: axisSchema, decision: axisSchema, dependency: axisSchema, scalability: axisSchema, toolConstraint: axisSchema }).strict(),
  confirmedFacts: z.array(z.string().min(1).max(1000)).max(4),
  unknownItems: z.array(z.string().min(1).max(1000)).max(15),
  bottlenecks: z.array(z.enum(['B01', 'B02', 'B03', 'B04', 'B05', 'B06'])).max(3),
  direction: z.enum(['D', 'A', 'AB', 'B', 'BC', 'C']).nullable(),
  directionStatus: z.enum(['DETERMINED', 'TO_BE_CLARIFICATION', 'SCOPE_CLARIFICATION']),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  renderedImprovementDirection: z.string().min(1).max(5000),
}).strict().superRefine((snapshot, ctx) => {
  const unique = new Set(snapshot.originalAnswers.Q02);
  if (unique.size !== snapshot.originalAnswers.Q02.length || (unique.has('UNKNOWN') && unique.size !== 1)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['originalAnswers', 'Q02'], message: 'Invalid Q02 selection' });
  if (snapshot.targetState.clarity === 'UNKNOWN' !== (unique.size === 1 && unique.has('UNKNOWN'))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetState'], message: 'Target state does not match Q02' });
  if (snapshot.directionStatus !== 'DETERMINED' && snapshot.direction !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['direction'], message: 'Clarification status cannot include a direction' });
  if (snapshot.directionStatus === 'DETERMINED' && snapshot.direction === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['direction'], message: 'Determined status requires a direction' });
});

export type DiagnosisSnapshot = z.infer<typeof diagnosisSnapshotSchema>;
export type ConsultationLeadStatus = 'new' | 'contacted' | 'scheduled' | 'completed' | 'closed';

export interface ConsultationPreparation {
  preparationDefinition: typeof PREPARATION_DEFINITION;
  preparationVersion: typeof PREPARATION_VERSION;
  preparationGeneratedAt: string;
  targetState: DiagnosisSnapshot['targetState']; confirmedFacts: string[]; unknownItems: string[];
  majorImprovementAreas: Array<{ axis: keyof DiagnosisSnapshot['sixAxisGaps']; level: 'MODERATE' | 'LARGE' }>;
  bottlenecks: string[]; direction: DiagnosisSnapshot['direction']; directionStatus: DiagnosisSnapshot['directionStatus'];
  confirmationPurposes: Array<{ key: string; purpose: string }>;
  standardQuestions: Array<{ key: string; purpose: string; question: string }>;
  deepDiveCandidates: Array<{ key: string; reason: string; question: string }>;
  skipQuestions: string[]; priorityOrder: string[]; consultationStory: string[];
}

const bottleneckQuestions: Record<string, string> = {
  B01: '情報を探す作業と転記作業は、どの業務のどの時点で発生していますか？', B02: '集計・報告・進捗確認は、誰が・どの頻度で・何の判断のために行っていますか？',
  B03: '引継ぎが難しくなる情報・手順・判断は、どこに集中していますか？', B04: '人による受渡しは、どの業務間で、どの情報を渡すために発生していますか？',
  B05: '案件や人員が増えた時、最初に増える管理・事務作業は何ですか？', B06: '現在のツールに合わせて変えている進め方は、どのようなものですか？',
};

export function prepareConsultation(snapshot: DiagnosisSnapshot, generatedAt = new Date().toISOString()): ConsultationPreparation {
  type AxisKey = keyof DiagnosisSnapshot['sixAxisGaps'];
  type AxisValue = DiagnosisSnapshot['sixAxisGaps'][AxisKey];
  const entries = Object.entries(snapshot.sixAxisGaps) as Array<[AxisKey, AxisValue]>;
  const majorImprovementAreas = entries
    .filter(([, axis]) => axis.coverage !== 'LOW' && (axis.level === 'MODERATE' || axis.level === 'LARGE')).map(([axis, value]) => ({ axis, level: value.level as 'MODERATE' | 'LARGE' }));
  const unknownItems = snapshot.unknownItems;
  const confirmationPurposes = [
    { key: 'target_state', purpose: '目指す業務の状態と優先順位を、具体的な業務場面に結び付けて確認する。' },
    ...unknownItems.map((_, index) => ({ key: `unknown_${index + 1}`, purpose: 'セルフチェックでは確認できなかった事項を、推測せずに確認する。' })),
    ...majorImprovementAreas.map(({ axis }) => ({ key: `area_${axis}`, purpose: '改善余地が大きいと確認された領域を、実際の業務・情報・関係者で具体化する。' })),
  ];
  const standardQuestions = [
    { key: 'target_state', purpose: confirmationPurposes[0]!.purpose, question: '目指している仕事の状態が実現できると、どの業務の何が最も変わりますか？' },
    ...(snapshot.originalAnswers.Q15 === 'UNKNOWN' ? [{ key: 'scope_unknown', purpose: '改善対象が局所なのか、前後業務・複数部門へ接続しているのかを確認する。', question: '今回挙げていただいた課題は、この業務の中だけで発生していますか。それとも前後の業務や他の部門にも影響していますか？' }] : []),
  ];
  const deepDiveCandidates = [
    ...majorImprovementAreas.map(({ axis, level }) => ({ key: `area_${axis}`, reason: `${level}の改善余地が確認されたため`, question: `「${axis}」に関する負担が最も大きい業務場面を教えてください。` })),
    ...snapshot.bottlenecks.map(key => ({ key, reason: 'ボトルネック候補が確認されたため', question: bottleneckQuestions[key]! })),
  ];
  return {
    preparationDefinition: PREPARATION_DEFINITION, preparationVersion: PREPARATION_VERSION, preparationGeneratedAt: generatedAt,
    targetState: snapshot.targetState, confirmedFacts: snapshot.confirmedFacts, unknownItems, majorImprovementAreas,
    bottlenecks: snapshot.bottlenecks, direction: snapshot.direction, directionStatus: snapshot.directionStatus, confirmationPurposes, standardQuestions, deepDiveCandidates,
    skipQuestions: snapshot.confirmedFacts.map(fact => `確認済み: ${fact}`),
    priorityOrder: ['target_state', ...(snapshot.originalAnswers.Q15 === 'UNKNOWN' ? ['scope_unknown'] : []), ...deepDiveCandidates.map(item => item.key)],
    consultationStory: ['TO-BEの確認', 'UNKNOWNの解消', '大きい改善余地の具体化', 'Bottleneckの実業務確認', 'Scope / Connection確認', '改善優先順位の確認', '次のアクション判断'],
  };
}
