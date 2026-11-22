import {
  DIAGNOSIS_DEFINITION,
  DIAGNOSIS_VERSION,
  LOGIC_VERSION,
  diagnosisSnapshotSchema,
  businessKaizenAnswersSchema,
  type DiagnosisSnapshot,
} from './businessWebConsultation';

export const BUSINESS_KAIZEN_QUESTION_IDS = [
  'Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08',
  'Q09', 'Q10', 'Q11', 'Q12', 'Q13', 'Q14', 'Q15',
] as const;

export const BUSINESS_KAIZEN_OPTION_CODES = {
  Q01: ['EXECUTIVE', 'MANAGER', 'IT', 'OPERATOR', 'OTHER'],
  Q02: ['NO_DUPLICATE_ENTRY', 'INSTANT_INFORMATION', 'REALTIME_VISIBILITY', 'TRANSFERABLE_WORK', 'SMOOTH_WORKFLOW', 'SCALABLE_OPERATION', 'SHARED_INFORMATION', 'FIT_FOR_BUSINESS', 'UNKNOWN'],
  Q03: ['OPEN', 'CONDITIONAL', 'PRESERVE', 'UNKNOWN'],
  Q04: [0, 1, 2, 3, 'UNKNOWN'], Q05: [0, 1, 2, 3, 'UNKNOWN'],
  Q06: [0, 1, 2, 3, 'UNKNOWN'], Q07: [0, 1, 2, 3, 'UNKNOWN'],
  Q08: [0, 1, 2, 3, 'UNKNOWN'], Q09: [0, 1, 2, 3, 'UNKNOWN'],
  Q10: [0, 1, 2, 3, 'UNKNOWN'], Q11: [0, 1, 2, 3, 'UNKNOWN', 'N_A'],
  Q12: ['EXCEL', 'GOOGLE_SHEETS', 'LOW_CODE_NO_CODE', 'BUSINESS_SAAS', 'PACKAGE_SYSTEM', 'CUSTOM_SYSTEM', 'EMAIL_CHAT', 'PAPER', 'OTHER'],
  Q13: [0, 1, 2, 3, 'UNKNOWN'], Q14: [0, 1, 2, 3, 'UNKNOWN'],
  Q15: ['LOCAL', 'MULTIPLE_INDEPENDENT', 'CONNECTED', 'MULTI_DEPARTMENT', 'COMPANY_WIDE', 'UNKNOWN'],
} as const;

export type BusinessKaizenAnswers = DiagnosisSnapshot['originalAnswers'];
export const businessKaizenDraftAnswersSchema = businessKaizenAnswersSchema.partial().strict().superRefine((answers, ctx) => {
  const selected = answers.Q02;
  if (selected) {
    const unique = new Set(selected);
    if (unique.size !== selected.length || (unique.has('UNKNOWN') && unique.size !== 1)) {
      ctx.addIssue({ code: 'custom', path: ['Q02'], message: 'Invalid Q02 selection' });
    }
  }
  if (answers.Q12 && new Set(answers.Q12).size !== answers.Q12.length) {
    ctx.addIssue({ code: 'custom', path: ['Q12'], message: 'Invalid Q12 selection' });
  }
});

export const getBusinessKaizenQuestions = () => [
  { id:'Q01', text:'このセルフチェックに回答される方のお立場に最も近いものを教えてください。', multiple:false, options:[['経営者・役員','EXECUTIVE'],['管理職・部門責任者','MANAGER'],['IT・情報システム担当','IT'],['実際に対象業務を行っている方','OPERATOR'],['その他','OTHER']] },
  { id:'Q02', text:'これからの仕事で、特に実現したいことを選んでください。', multiple:true, maxSelections:3, options:[['同じ情報を何度も入力・転記しなくてよい','NO_DUPLICATE_ENTRY'],['必要な情報を探さず、すぐ確認できる','INSTANT_INFORMATION'],['集計作業をしなくても、状況や数字が分かる','REALTIME_VISIBILITY'],['担当者が変わっても、同じように仕事が進む','TRANSFERABLE_WORK'],['確認・承認・連絡などがスムーズに次へ進む','SMOOTH_WORKFLOW'],['人や案件が増えても、管理業務があまり増えない','SCALABLE_OPERATION'],['現場・管理者・経営者が必要な情報を共有できる','SHARED_INFORMATION'],['自社の仕事に合った仕組みで働ける','FIT_FOR_BUSINESS'],['まだ具体的には決まっていない','UNKNOWN']] },
  { id:'Q03', text:'今の業務をそのままシステム化するのではなく、仕事の流れそのものを整理することについてどう感じますか？', multiple:false, options:[['ぜひ整理・見直したい','OPEN'],['必要であれば見直したい','CONDITIONAL'],['できれば今の業務は変えたくない','PRESERVE'],['まだ分からない','UNKNOWN']] },
  { id:'Q04', text:QUESTION_TEXT.Q04!, multiple:false, options:[['ほとんどない',0],['一部の業務である',1],['よくある',2],['多くの業務で発生している',3],['分からない／把握していない','UNKNOWN']] },
  { id:'Q05', text:QUESTION_TEXT.Q05!, multiple:false, options:[['ほとんどない',0],['ときどきある',1],['よくある',2],['日常的にある',3],['分からない／把握していない','UNKNOWN']] },
  { id:'Q06', text:QUESTION_TEXT.Q06!, multiple:false, options:[['ほとんどない',0],['一部ある',1],['定期的にある',2],['多くの業務で必要',3],['分からない／把握していない','UNKNOWN']] },
  { id:'Q07', text:QUESTION_TEXT.Q07!, multiple:false, options:[['ほとんどない',0],['一部ある',1],['よくある',2],['多くの業務がそうなっている',3],['分からない／把握していない','UNKNOWN']] },
  { id:'Q08', text:QUESTION_TEXT.Q08!, multiple:false, options:[['ほとんどない',0],['一部ある',1],['よくある',2],['特定の人がいないと進まない業務がある',3],['分からない／把握していない','UNKNOWN']] },
  { id:'Q09', text:QUESTION_TEXT.Q09!, multiple:false, options:[['問題なく引き継げる',0],['少し確認すれば引き継げる',1],['引き継ぎにかなり手間がかかる',2],['特定の人でないと難しい',3],['分からない／把握していない','UNKNOWN']] },
  { id:'Q10', text:QUESTION_TEXT.Q10!, multiple:false, options:[['すぐ確認できる',0],['少し確認・集計すれば分かる',1],['誰かに確認・集計してもらう必要がある',2],['必要な情報を把握すること自体が難しい',3],['分からない／把握していない','UNKNOWN']] },
  { id:'Q11', text:QUESTION_TEXT.Q11!, multiple:false, options:[['ほとんど増えない',0],['少し増える',1],['かなり増える',2],['人を増やさないと対応が難しくなる',3],['分からない','UNKNOWN'],['まだその状況を経験していない','N_A']] },
  { id:'Q12', text:'現在の業務で利用しているものを選んでください。', multiple:true, options:[['Excel','EXCEL'],['Googleスプレッドシート','GOOGLE_SHEETS'],['kintoneなどのローコード・ノーコードツール','LOW_CODE_NO_CODE'],['業務用SaaS','BUSINESS_SAAS'],['パッケージシステム','PACKAGE_SYSTEM'],['自社専用システム','CUSTOM_SYSTEM'],['メール・チャット','EMAIL_CHAT'],['紙','PAPER'],['その他','OTHER']] },
  { id:'Q13', text:QUESTION_TEXT.Q13!, multiple:false, options:[['ほとんどない',0],['ときどきある',1],['よくある',2],['やりたいことを諦めていることがある',3],['分からない／把握していない','UNKNOWN']] },
  { id:'Q14', text:QUESTION_TEXT.Q14!, multiple:false, options:[['ほとんどない',0],['一部ある',1],['よくある',2],['ツールに合わせることが前提になっている',3],['分からない／把握していない','UNKNOWN']] },
  { id:'Q15', text:'これまで回答したような課題について、最も近い状態を選んでください。', multiple:false, options:[['特定の作業・一部の業務だけで発生している','LOCAL'],['いくつかの業務で発生しているが、それぞれ個別の課題である','MULTIPLE_INDEPENDENT'],['前後の業務や情報がつながっており、一つの課題が他の業務にも影響している','CONNECTED'],['複数の部門・業務にまたがっている','MULTI_DEPARTMENT'],['会社全体の仕事の進め方に関係している','COMPANY_WIDE'],['分からない','UNKNOWN']] },
] as const;
type AxisKey = keyof DiagnosisSnapshot['sixAxisGaps'];
type AxisResult = DiagnosisSnapshot['sixAxisGaps'][AxisKey];
type DirectionKey = NonNullable<DiagnosisSnapshot['direction']> | Exclude<DiagnosisSnapshot['directionStatus'], 'DETERMINED'>;

const UNKNOWN = 'UNKNOWN' as const;
const NA = 'N_A' as const;
const AXES: Record<AxisKey, readonly (keyof BusinessKaizenAnswers)[]> = {
  workflow: ['Q04', 'Q06', 'Q07', 'Q14'], information: ['Q04', 'Q05', 'Q09'],
  decision: ['Q06', 'Q10'], dependency: ['Q08', 'Q09'], scalability: ['Q11'],
  toolConstraint: ['Q13', 'Q14'],
};
const NON_TOOL: AxisKey[] = ['workflow', 'information', 'decision', 'dependency', 'scalability'];
const CURRENT_ISSUE_IDS = ['Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10', 'Q11', 'Q12', 'Q13', 'Q14'] as const;
const A_CURRENT_ISSUE_IDS = ['Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10', 'Q11'] as const;

const QUESTION_TEXT: Partial<Record<keyof BusinessKaizenAnswers, string>> = {
  Q03: '今の業務をそのままシステム化するのではなく、仕事の流れそのものを整理することについてどう感じますか？',
  Q04: '同じ情報を複数の場所へ入力・転記することがありますか？',
  Q05: '必要な情報を確認するために、複数の管理表・ファイル・システム・メールなどを探すことがありますか？',
  Q06: '集計・報告・進捗確認のために、人がデータをまとめる作業がありますか？',
  Q07: '入力・確認・承認・連絡など、「人が次の人へつなぐ」ことで進んでいる業務がありますか？',
  Q08: '「この仕事は○○さんに聞かないと分からない」という業務がありますか？',
  Q09: '担当者が休んだり退職したりした場合でも、他の人が状況を把握して仕事を引き継げますか？',
  Q10: '管理者や経営者が状況を知りたいとき、必要な数字や進捗をすぐ確認できますか？',
  Q11: '顧客・案件・社員などが増えた場合、管理や事務の作業量はどうなりますか？',
  Q13: '今使っている仕組みについて、「本当はこうしたいけれど、今のツールでは難しい」と感じることがありますか？',
  Q14: '今使っているツールに合わせるために、本来の仕事の進め方を変えていることがありますか？',
};

const FACT: Partial<Record<keyof BusinessKaizenAnswers, readonly string[]>> = {
  Q04: ['', '同じ情報を複数の場所へ入力・転記する業務が一部あります。', '同じ情報を複数の場所へ入力・転記することがよくあります。', '多くの業務で、同じ情報の入力・転記が発生しています。'],
  Q05: ['', '必要な情報を探すために、複数の管理場所を確認することがあります。', '必要な情報を確認するために、複数の管理場所を探すことがよくあります。', '必要な情報を探すために、複数の管理場所を日常的に確認しています。'],
  Q06: ['', '集計・報告・進捗確認のため、人がデータをまとめる作業が一部あります。', '集計・報告・進捗確認のため、人が定期的にデータをまとめています。', '多くの業務で、人による集計・報告・進捗確認が必要です。'],
  Q07: ['', '人が次の人へつなぐことで進む業務が一部あります。', '入力・確認・承認・連絡など、人による受渡しで進む業務がよくあります。', '多くの業務が、人による確認・連絡・受渡しで進んでいます。'],
  Q08: ['', '特定の人に確認しないと分からない業務が一部あります。', '特定の人に確認しないと分からない業務がよくあります。', '特定の人がいないと進まない業務があります。'],
  Q09: ['', '担当者変更時には、少し確認すれば業務を引き継げます。', '担当者変更時の引継ぎに、かなり手間がかかります。', '担当者変更時、特定の人でなければ引継ぎが難しい状態です。'],
  Q10: ['', '必要な数字や進捗を把握するために、少し確認・集計が必要です。', '必要な数字や進捗を把握するために、誰かによる確認・集計が必要です。', '管理者や経営者が必要な情報を把握すること自体が難しい状態です。'],
  Q11: ['', '顧客・案件・社員などが増えると、管理や事務作業も少し増えます。', '顧客・案件・社員などが増えると、管理や事務作業がかなり増えます。', '顧客・案件・社員などが増える場合、人を増やさないと対応が難しい状態です。'],
  Q13: ['', '現在のツールでは実現しにくいと感じることが、ときどきあります。', '現在のツールでは実現しにくいと感じることが、よくあります。', '現在のツールの制約により、やりたいことを諦めていることがあります。'],
  Q14: ['', '現在のツールに合わせて、本来の仕事の進め方を変えている部分があります。', '現在のツールに合わせて、仕事の進め方を変えていることがよくあります。', '現在のツールに合わせることを前提に、仕事を進めています。'],
};
const SCOPE_FACT: Partial<Record<BusinessKaizenAnswers['Q15'], string>> = {
  LOCAL: '今回挙げられた課題は、特定の作業・一部の業務で発生しています。',
  MULTIPLE_INDEPENDENT: 'いくつかの業務で課題がありますが、それぞれ個別に発生しています。',
  CONNECTED: '前後の業務や情報がつながっており、一つの課題が他の業務にも影響しています。',
  MULTI_DEPARTMENT: '課題が複数の部門・業務にまたがっています。',
  COMPANY_WIDE: '課題が会社全体の仕事の進め方に関係しています。',
};

export const BUSINESS_KAIZEN_DIRECTION_TEXT: Record<DirectionKey, string> = {
  D: '今回の回答では、現在の業務と目指している状態との間に、大きな隔たりは比較的少ないことが確認できました。新しいシステムの導入や大きな作り直しを前提にせず、現在の運用や既存ツールの使い方を見直すことから始める方法が考えられます。',
  A: '今回の回答では、一部の業務に手作業や情報確認の負担が見られる一方、現在の仕組みそのものを大きく変える必要性は強く確認されませんでした。まずは既存ツールの設定や使い方、情報の持ち方、業務フローを整理することで改善できる可能性があります。',
  AB: '今回の回答では、既存ツールの使い方や業務フローを整理することで改善できそうな部分がある一方、現在のツールでは実現しにくいことも確認されました。そのため、すべてを作り直すのではなく、まず既存環境で改善できる範囲を整理し、それでも残る課題について部分的なシステム化を検討する方法が考えられます。',
  B: '今回の回答では、特定の業務に手作業や現在のツールによる制約が集中していることが確認されました。すべての仕組みを変更するのではなく、課題の大きい業務を整理し、必要な部分だけをWebシステム化する方法が選択肢になりそうです。',
  BC: '今回の回答では、特定の業務に手作業やツールの制約がある一方、その課題が前後の業務や情報ともつながっていることが確認されました。課題の大きい部分だけをシステム化する方法も考えられますが、その部分だけを変更すると、前後の業務に手作業や情報分断が残る可能性もあります。まず業務の流れと情報のつながりを整理したうえで、部分的なシステム化で十分なのか、より広い業務設計から見直すのかを検討する方法が考えられます。',
  C: '今回の回答では、現在のツールだけでなく、情報の流れ、業務の進め方、担当者への依存、事業拡大時の負荷など、複数の観点で改善余地が確認されました。個別のツールを追加・変更する前に、「誰が・いつ・どの情報を扱い、その情報を次の業務や判断にどうつなげるのか」を整理することで、よりシンプルな仕組みにできる可能性があります。そのうえで、既存ツールを残す部分、改善する部分、新しくシステム化する部分を決める方法が考えられます。',
  TO_BE_CLARIFICATION: '今回の回答からは、現在の業務にいくつか改善余地が確認されました。一方で、どのような仕事の状態を目指しているのか、または改善方法を考えるために必要な一部の情報については、今回の回答だけでは確認できませんでした。現在のツールを変更したり、新しいシステムを導入したりすることを先に決めず、「何を減らしたいのか」「何を見えるようにしたいのか」「人や事業が増えたときにどう働きたいのか」から整理する方法が考えられます。',
  SCOPE_CLARIFICATION: '改善余地は確認されています。改善する範囲を判断するために、もう少し確認したいことがあります。今回の回答では、手作業、情報の分散、担当者への依存など、複数の改善余地が確認されました。一方、それぞれの課題が個別に発生しているのか、前後の業務や複数部門をまたいでつながっているのかについては、今回の回答だけでは確認できませんでした。この点を整理すると、部分的な改善から始めるのか、業務全体から整理するのかを判断しやすくなります。',
};

function numericAnswer(answers: BusinessKaizenAnswers, id: keyof BusinessKaizenAnswers): number | undefined {
  const value = answers[id];
  return typeof value === 'number' ? value : undefined;
}

function axis(ids: readonly (keyof BusinessKaizenAnswers)[], answers: BusinessKaizenAnswers): AxisResult {
  const eligible = ids.filter(id => answers[id] !== NA);
  const known = eligible.map(id => numericAnswer(answers, id)).filter((value): value is number => value !== undefined);
  const average = known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
  const level = average === null ? 'UNKNOWN' : average < 0.75 ? 'SMALL' : average < 1.5 ? 'SOME' : average < 2.25 ? 'MODERATE' : 'LARGE';
  const ratio = known.length / (eligible.length || 1);
  const coverage = eligible.length === 0 || ratio < 0.5 ? 'LOW' : ratio < 0.75 ? 'MEDIUM' : 'HIGH';
  return { level, coverage, knownCount: known.length, eligibleCount: eligible.length, average };
}

function confirmedFacts(answers: BusinessKaizenAnswers, materialCurrentIssueKnown: boolean): string[] {
  const facts = Object.keys(FACT)
    .filter(id => (numericAnswer(answers, id as keyof BusinessKaizenAnswers) ?? 0) >= 1)
    .sort((left, right) => (numericAnswer(answers, right as keyof BusinessKaizenAnswers)! - numericAnswer(answers, left as keyof BusinessKaizenAnswers)!) || left.localeCompare(right))
    .slice(0, 4)
    .map(id => FACT[id as keyof BusinessKaizenAnswers]![numericAnswer(answers, id as keyof BusinessKaizenAnswers)!])
    .filter((text): text is string => typeof text === 'string' && text.trim() !== '' && text !== 'undefined');
  const scopeFact = SCOPE_FACT[answers.Q15];
  if (materialCurrentIssueKnown && scopeFact) facts.push(scopeFact);
  return facts.slice(0, 4);
}

export interface BusinessKaizenDiagnosisResult {
  answers: BusinessKaizenAnswers;
  axes: DiagnosisSnapshot['sixAxisGaps'];
  toBe: DiagnosisSnapshot['targetState'];
  bottlenecks: DiagnosisSnapshot['bottlenecks'];
  direction: DiagnosisSnapshot['direction'];
  directionStatus: DiagnosisSnapshot['directionStatus'];
  confidence: DiagnosisSnapshot['confidence'];
  facts: string[];
  unknowns: string[];
  showItManagementKaizen: boolean;
}

/** Pure port of Corporate self-check logicVersion 1.0. */
export function diagnoseBusinessKaizen(answers: BusinessKaizenAnswers): BusinessKaizenDiagnosisResult {
  const axes = Object.fromEntries(Object.entries(AXES).map(([key, ids]) => [key, axis(ids, answers)])) as DiagnosisSnapshot['sixAxisGaps'];
  const problem = (key: AxisKey) => ['SOME', 'MODERATE', 'LARGE'].includes(axes[key].level) && axes[key].coverage !== 'LOW';
  const major = (key: AxisKey) => ['MODERATE', 'LARGE'].includes(axes[key].level) && axes[key].coverage !== 'LOW';
  const majorCount = (Object.keys(axes) as AxisKey[]).filter(major).length;
  const nonToolMajor = NON_TOOL.filter(major).length;
  const current = CURRENT_ISSUE_IDS.some(id => (numericAnswer(answers, id) ?? 0) >= 1);
  const material = CURRENT_ISSUE_IDS.some(id => (numericAnswer(answers, id) ?? 0) >= 2);
  const toBe = answers.Q02;
  const clarity = toBe.length === 1 && toBe[0] === UNKNOWN ? 'UNKNOWN' : 'CLEAR';
  const scope = answers.Q15;
  const structural = ['CONNECTED', 'MULTI_DEPARTMENT', 'COMPANY_WIDE'].includes(scope);
  const toolStrong = major('toolConstraint');
  const toolWeak = ['SMALL', 'SOME'].includes(axes.toolConstraint.level) && axes.toolConstraint.coverage !== 'LOW';
  const aBase = current && (Object.keys(axes) as AxisKey[]).some(problem) && ['LOCAL', 'MULTIPLE_INDEPENDENT'].includes(scope) && !structural;
  const b = toolStrong && material && (
    ['LOCAL', 'MULTIPLE_INDEPENDENT', 'CONNECTED'].includes(scope)
    || (scope === UNKNOWN && axes.toolConstraint.coverage !== 'LOW' && NON_TOOL.some(major))
  );
  const a = aBase && (toolWeak || axes.toolConstraint.level === UNKNOWN || (b && A_CURRENT_ISSUE_IDS.some(id => (numericAnswer(answers, id) ?? 0) >= 1)));
  const c = majorCount >= 3 && nonToolMajor >= 2 && structural;
  const d = majorCount === 0 && !toolStrong && NON_TOOL.filter(key => axes[key].level === UNKNOWN || axes[key].coverage === 'LOW').length <= 2 && !material;

  let direction: DiagnosisSnapshot['direction'] = null;
  let directionStatus: DiagnosisSnapshot['directionStatus'] = 'DETERMINED';
  let confidenceCap: DiagnosisSnapshot['confidence'] | null = null;
  if (clarity === 'UNKNOWN') {
    if (b && axes.toolConstraint.coverage !== 'LOW' && material) { direction = 'B'; confidenceCap = 'MEDIUM'; }
    else directionStatus = 'TO_BE_CLARIFICATION';
  } else if (scope === UNKNOWN) {
    if (majorCount >= 3 && nonToolMajor >= 2) directionStatus = 'SCOPE_CLARIFICATION';
    else if (b) { direction = 'B'; confidenceCap = 'MEDIUM'; }
    else if (majorCount >= 2) directionStatus = 'SCOPE_CLARIFICATION';
    else if (d) direction = 'D';
    else directionStatus = 'TO_BE_CLARIFICATION';
  } else if (a && b && c) direction = 'BC';
  else if (a && b) direction = 'AB';
  else if (b && c) direction = 'BC';
  else if (c) direction = 'C';
  else if (b) direction = 'B';
  else if (a) direction = 'A';
  else if (d) direction = 'D';
  else if (majorCount >= 2) directionStatus = 'SCOPE_CLARIFICATION';
  else directionStatus = 'TO_BE_CLARIFICATION';

  const confidence: DiagnosisSnapshot['confidence'] = directionStatus !== 'DETERMINED' ? 'LOW'
    : confidenceCap ?? ((Object.entries(axes) as Array<[AxisKey, AxisResult]>)
      .filter(([key]) => direction === 'B' ? key === 'toolConstraint' || major(key) : major(key))
      .some(([, value]) => value.coverage === 'MEDIUM') ? 'MEDIUM' : 'HIGH');
  const n = (id: keyof BusinessKaizenAnswers) => numericAnswer(answers, id) ?? -1;
  const bottlenecks = [
    n('Q04') >= 2 && n('Q05') >= 2 && 'B01', n('Q06') >= 2 && n('Q10') >= 2 && 'B02',
    n('Q08') >= 2 && n('Q09') >= 2 && 'B03',
    n('Q07') >= 2 && structural && 'B04',
    n('Q11') >= 2 && (n('Q04') >= 2 || n('Q06') >= 2 || n('Q07') >= 2) && 'B05',
    n('Q13') >= 2 && n('Q14') >= 2 && 'B06',
  ].filter((value): value is DiagnosisSnapshot['bottlenecks'][number] => typeof value === 'string').slice(0, 3);
  const unknowns = BUSINESS_KAIZEN_QUESTION_IDS
    .filter(id => answers[id] === UNKNOWN)
    .map(id => id === 'Q10'
      ? '管理者や経営者が、必要な数字や進捗をどのように確認しているかについては、今回の回答では確認できませんでした。'
      : id === 'Q15'
        ? '今回確認された課題が、特定の業務だけで発生しているのか、前後の業務や他部門にも関係しているのかについては確認できませんでした。'
        : `${QUESTION_TEXT[id]}については、今回の回答では確認できませんでした。`);

  return {
    answers: structuredClone(answers), axes, toBe: { clarity, selected: [...toBe] }, bottlenecks,
    direction, directionStatus, confidence, facts: confirmedFacts(answers, material), unknowns,
    showItManagementKaizen: answers.Q01 === 'EXECUTIVE'
      && (clarity === 'UNKNOWN' || directionStatus === 'TO_BE_CLARIFICATION')
      && ['MULTI_DEPARTMENT', 'COMPANY_WIDE'].includes(scope)
      && (Object.keys(axes) as AxisKey[]).filter(problem).length >= 3 && nonToolMajor >= 2,
  };
}

/** Converts the shared result into the existing public persistence contract. */
export function toBusinessKaizenDiagnosisSnapshot(result: BusinessKaizenDiagnosisResult): DiagnosisSnapshot {
  const textKey = (result.direction ?? result.directionStatus) as DirectionKey;
  return diagnosisSnapshotSchema.parse({
    diagnosisDefinition: DIAGNOSIS_DEFINITION,
    diagnosisVersion: DIAGNOSIS_VERSION,
    logicVersion: LOGIC_VERSION,
    originalAnswers: result.answers,
    targetState: result.toBe,
    sixAxisGaps: result.axes,
    confirmedFacts: result.facts,
    unknownItems: result.unknowns,
    bottlenecks: result.bottlenecks,
    direction: result.direction,
    directionStatus: result.directionStatus,
    confidence: result.confidence,
    renderedImprovementDirection: BUSINESS_KAIZEN_DIRECTION_TEXT[textKey],
  });
}

export function diagnoseBusinessKaizenSnapshot(answers: BusinessKaizenAnswers): DiagnosisSnapshot {
  return toBusinessKaizenDiagnosisSnapshot(diagnoseBusinessKaizen(answers));
}
