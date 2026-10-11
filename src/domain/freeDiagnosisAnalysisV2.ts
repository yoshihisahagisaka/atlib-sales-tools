import {
  type AnalysisResultV2,
  type CurrentStructuredStateV2,
  type FactCandidateV2,
  type HearingViewpointV2,
  type LensFindingV2,
  type LensV2,
  type NarrativeBlockV2,
  type UnknownItemV2,
} from './freeDiagnosisDesignV2';
import { projectFreeDiagnosisSemanticV2 } from './freeDiagnosisSemanticProjectionV2';

const MATERIAL_FUTURE = new Set([
  'BUSINESS_GROWTH',
  'FOCUS_ON_CORE_WORK',
  'LEAN_GROWTH',
  'NEW_BUSINESS_OR_WORKSTYLE',
  'BUSINESS_CONTINUITY',
]);
const LIMITED_VISIBILITY = new Set(['VISIBLE_PARTIAL', 'RELIES_ON_OTHERS', 'LOW_VISIBILITY', 'UNKNOWN']);

function hasAny(values: readonly string[], expected: readonly string[]): boolean {
  return expected.some((value) => values.includes(value));
}

function block(id: string, ruleId: string, text: string, sourceQuestionCodes: readonly string[]): NarrativeBlockV2 {
  return { id, ruleId, text, epistemicType: 'DIRECT_RECOGNITION', sourceQuestionCodes };
}

function finding(id: string, ruleId: string, text: string, lenses: readonly LensV2[], sourceQuestionCodes: readonly string[]): LensFindingV2 {
  return { id, ruleId, text, lenses, sourceQuestionCodes };
}

function unknown(id: string, text: string, lenses: readonly LensV2[], sourceRuleIds: readonly string[]): UnknownItemV2 {
  return { id, text, lenses, sourceRuleIds };
}

function viewpoint(id: string, label: string, whyUseful: string, lenses: readonly LensV2[], sourceRuleIds: readonly string[], exampleQuestions?: readonly string[]): HearingViewpointV2 {
  return { id, label, whyUseful, lenses, sourceRuleIds, ...(exampleQuestions === undefined ? {} : { exampleQuestions }) };
}

function fact(id: string, whatToVerify: string, whyItMattersToFuture: string, whatMayBecomeKnowable: string, lenses: readonly LensV2[], sourceRuleIds: readonly string[]): FactCandidateV2 {
  return { id, whatToVerify, whyItMattersToFuture, whatMayBecomeKnowable, lenses, sourceRuleIds };
}

function futureText(state: CurrentStructuredStateV2): string | undefined {
  const values = state.q2Future;
  if (values.includes('UNDECIDED')) return '今後1〜3年で実現したい会社の姿は、現時点ではまだ具体化の途中です。まず、経営として優先したい変化を確認する価値があります。';
  if (values.includes('BUSINESS_GROWTH') && values.includes('LEAN_GROWTH')) return '事業を拡大しながら、少人数でも無理なく成長・運営できる会社を目指しています。';
  if (values.includes('BUSINESS_GROWTH')) return '事業を拡大しながら、持続的に成長できる会社を目指しています。';
  if (values.includes('LEAN_GROWTH')) return '少人数でも無理なく成長・運営できる会社を目指しています。';
  if (values.includes('FOCUS_ON_CORE_WORK')) return '本来注力したい仕事へ、より時間を使える会社を目指しています。';
  if (values.includes('NEW_BUSINESS_OR_WORKSTYLE')) return '新しい事業や働き方に対応できる会社を目指しています。';
  if (values.includes('BUSINESS_CONTINUITY')) return '事業を安定して継続できる会社を目指しています。';
  if (values.includes('NO_MAJOR_CHANGE')) return '現時点では、大きな変化よりも現在の事業を安定して運営することを重視しています。';
  return undefined;
}

function addRule(ruleIds: string[], id: string): void {
  if (!ruleIds.includes(id)) ruleIds.push(id);
}

function addUnknown(items: UnknownItemV2[], item: UnknownItemV2): void {
  if (!items.some((existing) => existing.id === item.id)) items.push(item);
}

/**
 * The one deterministic Design v2 analyser. Survey answers are recognition and
 * confirmation candidates; this function never turns them into verified FACT.
 */
export function analyzeFreeDiagnosisV2(input: CurrentStructuredStateV2): AnalysisResultV2 {
  const state = projectFreeDiagnosisSemanticV2(input);
  const futureUnderstanding: NarrativeBlockV2[] = [];
  const currentUnderstanding: NarrativeBlockV2[] = [];
  const lensFindings: LensFindingV2[] = [];
  const unknowns: UnknownItemV2[] = [];
  const hearingViewpoints: HearingViewpointV2[] = [];
  const factCandidates: FactCandidateV2[] = [];
  const appliedRuleIds: string[] = [];

  const future = futureText(state);
  if (future !== undefined) {
    futureUnderstanding.push(block('future', 'V2-D-Q2-FUTURE', future, ['Q2']));
    addRule(appliedRuleIds, 'V2-D-Q2-FUTURE');
  }
  if (hasAny(state.q3ItExpectations, ['PRODUCTIVITY', 'LEAN_OPERATION']) && state.q3ItExpectations.includes('MANAGEMENT_DECISION_SUPPORT')) {
    futureUnderstanding.push(block('it-expectation', 'V2-D-Q3-EXPECTATION', 'その実現に向けて、ITには業務生産性の向上と経営判断を支える役割を期待しています。', ['Q3']));
    addRule(appliedRuleIds, 'V2-D-Q3-EXPECTATION');
  } else if (hasAny(state.q3ItExpectations, ['PRODUCTIVITY', 'LEAN_OPERATION'])) {
    futureUnderstanding.push(block('it-expectation', 'V2-D-Q3-EXPECTATION', 'その実現に向けて、ITには業務生産性を支える役割を期待しています。', ['Q3']));
    addRule(appliedRuleIds, 'V2-D-Q3-EXPECTATION');
  } else if (state.q3ItExpectations.includes('MANAGEMENT_DECISION_SUPPORT')) {
    futureUnderstanding.push(block('it-expectation', 'V2-D-Q3-EXPECTATION', 'その実現に向けて、ITには経営判断を支える役割を期待しています。', ['Q3']));
    addRule(appliedRuleIds, 'V2-D-Q3-EXPECTATION');
  }

  const visibilityText: Record<string, string> = {
    VISIBLE_FULL: '現在の業務・ITについて、必要な状況は把握できているという認識です。',
    VISIBLE_MOSTLY: '現在の業務・ITについて、おおむね把握できているという認識です。',
    VISIBLE_PARTIAL: '現在の業務・ITについて、分かることと分からないことがあるという認識です。',
    RELIES_ON_OTHERS: '現在の業務・ITについて、担当者へ確認しないと分からないことが多いという認識です。',
    LOW_VISIBILITY: '現在の業務・ITについて、確認しても分からないことがあるという認識です。',
    UNKNOWN: '現在の業務・ITについての把握状況は、現時点では未確認です。',
  };
  currentUnderstanding.push(block('visibility', 'V2-D-Q5-VISIBILITY', visibilityText[state.q5Visibility]!, ['Q5']));
  addRule(appliedRuleIds, 'V2-D-Q5-VISIBILITY');
  if (state.q5Visibility === 'UNKNOWN') addUnknown(unknowns, unknown('unknown-visibility', '現在の業務・ITについて、経営としてどこまで把握できているかは未確認です。', ['OPERATION', 'MANAGEMENT'], ['V2-D-Q5-VISIBILITY']));

  const managementText: Record<string, string> = {
    UNMANAGED_OR_NOT_VISIBLE: 'ITについて、経営として継続的に把握するための情報がどこまで管理されているかは未確認です。',
    MANAGED_NOT_REPORTED: 'ITの管理自体は行われている一方、経営へどの情報がどの頻度で共有されているかは未確認です。',
    REPORTED_NOT_DECISION_USABLE: 'ITに関する報告・共有はあるものの、経営判断に使える形へ十分に整理されていないという認識です。',
    DECISION_USABLE: '会社の状況について得られる情報は、経営判断に使える状態にあるという認識です。',
    STRATEGICALLY_CONNECTED: 'ITに関する情報や提案が、経営課題や事業計画と結びついた形で経営判断に活用されているという認識です。',
    UNKNOWN: '会社の状況について得られる情報が経営判断にどこまで使えているかは、現時点では未確認です。',
  };
  currentUnderstanding.push(block('management-connection', 'V2-D-Q6-MANAGEMENT_CONNECTION', managementText[state.q6ManagementConnection]!, ['Q6']));
  addRule(appliedRuleIds, 'V2-D-Q6-MANAGEMENT_CONNECTION');
  if (state.q6ManagementConnection === 'UNKNOWN') addUnknown(unknowns, unknown('unknown-management-connection', '会社の状況について得られる情報が経営判断にどう使われているかは未確認です。', ['MANAGEMENT'], ['V2-D-Q6-MANAGEMENT_CONNECTION']));
  if (state.q6ManagementConnection === 'REPORTED_NOT_DECISION_USABLE') {
    addUnknown(unknowns, unknown('unknown-management-report-detail', '何が経営へ届き、何が判断に使えているか、使いにくい情報や届いていない情報は何かは未確認です。', ['MANAGEMENT'], ['V2-U-003-REPORT']));
    addRule(appliedRuleIds, 'V2-U-003-REPORT');
  }
  if (state.q6ManagementConnection === 'MANAGED_NOT_REPORTED') {
    addUnknown(unknowns, unknown('unknown-management-sharing-detail', 'どの管理情報が経営へ届いていないか、どの頻度・経路で共有されているかは未確認です。', ['MANAGEMENT'], ['V2-U-003-SHARING']));
    addRule(appliedRuleIds, 'V2-U-003-SHARING');
  }

  if (state.q7InterestThemes.includes('AI')) {
    currentUnderstanding.push(block('interest-ai', 'V2-D-Q7-INTEREST', 'AI・生成AIに関心があります。', ['Q7']));
    addRule(appliedRuleIds, 'V2-D-Q7-INTEREST');
  }
  if (state.q7InterestThemes.includes('SECURITY')) {
    currentUnderstanding.push(block('interest-security', 'V2-D-Q7-INTEREST', 'セキュリティに関心があります。', ['Q7']));
    addRule(appliedRuleIds, 'V2-D-Q7-INTEREST');
  }
  if (hasAny(state.q7InterestThemes, ['AI', 'AUTOMATION'])) {
    addUnknown(unknowns, unknown('unknown-automation-applicability', 'どの業務へAI・自動化を適用する価値があるかは未確認です。', ['TECHNOLOGY', 'OPERATION'], ['V2-U-002-APPLICABILITY']));
    addRule(appliedRuleIds, 'V2-U-002-APPLICABILITY');
  }

  const growthAndEfficiency = hasAny(state.q2Future, ['BUSINESS_GROWTH', 'LEAN_GROWTH']) && hasAny(state.q3ItExpectations, ['PRODUCTIVITY', 'LEAN_OPERATION']);
  if (growthAndEfficiency) {
    lensFindings.push(finding('growth-workflow', 'V2-C-001', '現在の仕事の進め方が、事業規模が大きくなっても無理なく回るかを確認する価値があります。', ['OPERATION'], ['Q2', 'Q3']));
    hearingViewpoints.push(viewpoint('growth-workflow', '成長時にも無理なく回る仕事の進め方', '成長と生産性への期待が両方あるため、日々の仕事の流れを確認すると有用です。', ['OPERATION'], ['V2-C-001'], ['まず、日々の仕事で時間や確認が集中している場面を教えてください。', 'その仕事量が増えた場合、どこに負担が出そうですか。']));
    factCandidates.push(fact('growth-workflow', '仕事量が増えた場合に、どの業務で手作業・確認待ち・属人化が起きるか。', '事業成長と少人数での運営を両立するため。', '確認価値の高い業務と、改善可能性のある仕事の流れ。', ['OPERATION'], ['V2-C-001']));
    addUnknown(unknowns, unknown('unknown-growth-operation-detail', 'どの業務が事業拡大時に負担増となるか、手作業・転記・集計・確認待ち・情報探索・属人化の実態は未確認です。', ['OPERATION'], ['V2-C-001']));
    addRule(appliedRuleIds, 'V2-C-001');
  }
  if (growthAndEfficiency && hasAny(state.q7InterestThemes, ['AI', 'AUTOMATION'])) {
    lensFindings.push(finding('automation-fit', 'V2-C-002', '自動化・効率化・AI活用など、技術を使って事業成長を支えられる可能性があります。ただし、どの業務へ適用する価値があるかは現時点では分かっていません。', ['TECHNOLOGY', 'OPERATION'], ['Q2', 'Q3', 'Q7']));
    hearingViewpoints.push(viewpoint('automation-fit', '自動化・AI活用の確認価値', '関心だけで導入を決めず、業務上の適用価値を確かめるためです。', ['TECHNOLOGY', 'OPERATION'], ['V2-C-002'], ['Excel、SaaS、手作業、転記のうち、繰り返し発生している仕事はありますか。']));
    factCandidates.push(fact('automation-fit', '自動化やAI活用の前に、対象となる業務・データ・確認作業が何か。', '技術活用を成長の支えにできるかを見極めるため。', '技術適用の候補と、その前に整える必要のある条件。', ['TECHNOLOGY', 'OPERATION'], ['V2-C-002']));
    addRule(appliedRuleIds, 'V2-C-002');
  }

  const hasMaterialFuture = state.q2Future.some((value) => MATERIAL_FUTURE.has(value));
  if (hasMaterialFuture && LIMITED_VISIBILITY.has(state.q5Visibility)) {
    lensFindings.push(finding('future-visibility', 'V2-C-003', '今後の会社の変化に対して、現在十分に把握できていない部分が、事業運営や経営判断にどのように関係するかを確認する価値があります。', ['OPERATION', 'MANAGEMENT'], ['Q2', 'Q5']));
    hearingViewpoints.push(viewpoint('future-visibility', '変化に備えるための現在地の確認', '将来像と現在把握できていない部分の関係を、推測で埋めずに確かめるためです。', ['OPERATION', 'MANAGEMENT'], ['V2-C-003'], ['今後の変化に向けて、いま経営として把握しておきたい状況は何ですか。']));
    factCandidates.push(fact('future-visibility', '把握しにくい業務・ITの状況が、事業運営や経営判断にどう関係しているか。', '将来の変化に備える判断材料を得るため。', '追加確認が必要な領域と、経営への影響の可能性。', ['OPERATION', 'MANAGEMENT'], ['V2-C-003']));
    addRule(appliedRuleIds, 'V2-C-003');
  }
  if (state.q4CurrentInterest === 'MANAGEMENT_DECISION' && LIMITED_VISIBILITY.has(state.q5Visibility) && state.q6ManagementConnection === 'REPORTED_NOT_DECISION_USABLE') {
    lensFindings.push(finding('decision-usable', 'V2-C-004', 'ITや業務について一定の情報は得られている一方、その情報が経営判断に使える形へ整理されているかを具体的に確認する価値があります。', ['MANAGEMENT'], ['Q4', 'Q5', 'Q6']));
    hearingViewpoints.push(viewpoint('decision-usable', '経営判断に使える情報の形', '報告の有無だけでなく、判断に使える形かを具体的に確かめるためです。', ['MANAGEMENT'], ['V2-C-004'], ['現在、経営で確認している数字や報告には何がありますか。', '判断しにくいと感じるのは、どのような場面ですか。']));
    factCandidates.push(fact('decision-usable', '経営へ共有されるIT・業務情報の内容、頻度、判断への使われ方。', '経営判断を支える情報の形を確認するため。', '報告・共有・判断の間で追加確認が必要な箇所。', ['MANAGEMENT'], ['V2-C-004']));
    addRule(appliedRuleIds, 'V2-C-004');
  }
  const threeLensInformationFlow = growthAndEfficiency
    && state.q3ItExpectations.includes('MANAGEMENT_DECISION_SUPPORT')
    && state.q4CurrentInterest === 'MANAGEMENT_DECISION'
    && LIMITED_VISIBILITY.has(state.q5Visibility)
    && state.q6ManagementConnection === 'REPORTED_NOT_DECISION_USABLE'
    && hasAny(state.q7InterestThemes, ['AI', 'AUTOMATION']);
  if (threeLensInformationFlow) {
    lensFindings.push(finding('growth-decision-information-flow', 'V2-C-011', '事業拡大を少人数で支えるために、経営判断に必要な情報を作る・届ける・使う流れを、技術・運用・管理の各面から確認する価値があります。', ['TECHNOLOGY', 'OPERATION', 'MANAGEMENT'], ['Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']));
    hearingViewpoints.push(viewpoint('growth-decision-information-flow', '経営判断に必要な情報を作る・届ける・使う流れ', '情報作成を支える技術、収集・集計・報告の仕事の進め方、経営への届け方と判断での使い方を一つの流れとして確認するためです。', ['TECHNOLOGY', 'OPERATION', 'MANAGEMENT'], ['V2-C-011']));
    factCandidates.push(fact('growth-decision-information-flow', '経営判断に必要な情報が、どのように作られ、届けられ、使われているか。', '少人数での事業拡大を、技術・運用・管理のつながりから支えられるかを確認するため。', '情報作成の技術的な支援可能性、業務の見直し可能性、経営判断への接続状況。', ['TECHNOLOGY', 'OPERATION', 'MANAGEMENT'], ['V2-C-011']));
    addRule(appliedRuleIds, 'V2-C-011');
  }
  if (state.q6ManagementConnection === 'MANAGED_NOT_REPORTED') {
    lensFindings.push(finding('management-not-reported', 'V2-C-005', 'ITの管理自体は行われている一方、経営へどの情報がどの頻度で共有されているかを確認する価値があります。', ['MANAGEMENT'], ['Q6']));
    hearingViewpoints.push(viewpoint('management-not-reported', '経営への共有', '管理している情報と経営が受け取る情報のつながりを確認するためです。', ['MANAGEMENT'], ['V2-C-005']));
    factCandidates.push(fact('management-not-reported', 'ITについて管理されている情報と、経営へ共有される情報の差。', '経営として継続的に判断するため。', '共有すべき情報と確認頻度の候補。', ['MANAGEMENT'], ['V2-C-005']));
    addRule(appliedRuleIds, 'V2-C-005');
  }
  if (state.q6ManagementConnection === 'UNMANAGED_OR_NOT_VISIBLE') {
    lensFindings.push(finding('management-not-visible', 'V2-C-006', 'ITについて経営として継続的に把握・判断するために、現在どの情報が管理されているかを確認する価値があります。', ['MANAGEMENT'], ['Q6']));
    hearingViewpoints.push(viewpoint('management-not-visible', '経営として把握する情報', '現在の管理状況を推測せず、経営が継続的に判断できる情報を確認するためです。', ['MANAGEMENT'], ['V2-C-006']));
    factCandidates.push(fact('management-not-visible', '経営として継続的に把握するため、現在どの情報が管理されているか。', '経営判断の土台を確認するため。', '未確認の情報領域と確認の優先度。', ['MANAGEMENT'], ['V2-C-006']));
    addRule(appliedRuleIds, 'V2-C-006');
  }
  if (state.q7InterestThemes.includes('SECURITY')) {
    lensFindings.push(finding('security-interest', 'V2-C-008', 'セキュリティに関心があります。現在の対策の有無だけではなく、経営としてリスクや事業への影響をどこまで把握・判断できているかを確認する価値があります。', ['TECHNOLOGY', 'MANAGEMENT'], ['Q7']));
    hearingViewpoints.push(viewpoint('security-interest', 'セキュリティを経営として把握すること', '関心をリスク断定にせず、判断に必要な情報を確認するためです。', ['TECHNOLOGY', 'MANAGEMENT'], ['V2-C-008']));
    addRule(appliedRuleIds, 'V2-C-008');
  }
  if (state.q7InterestThemes.includes('SYSTEM_LIFECYCLE')) {
    lensFindings.push(finding('system-lifecycle-interest', 'V2-C-009', 'システムの更新や見直しに関心があります。現在の仕組みが事業の変化へ対応できるかを確認する価値があります。', ['TECHNOLOGY', 'MANAGEMENT'], ['Q7']));
    hearingViewpoints.push(viewpoint('system-lifecycle-interest', '仕組みの更新と事業の変化', '更新時期や技術だけでなく、事業上の必要性を確認するためです。', ['TECHNOLOGY', 'MANAGEMENT'], ['V2-C-009']));
    addRule(appliedRuleIds, 'V2-C-009');
  }
  if (state.q2Future.includes('UNDECIDED')) {
    addUnknown(unknowns, unknown('unknown-future', '今後1〜3年で実現したい会社の未来は、現時点ではまだ具体化されていません。', ['MANAGEMENT'], ['V2-C-010']));
    hearingViewpoints.push(viewpoint('future-undecided', '経営として優先したい変化', '将来像が具体化の途中であるため、まず優先したい変化を確認するためです。', ['MANAGEMENT'], ['V2-C-010']));
    addRule(appliedRuleIds, 'V2-C-010');
  }

  const healthy = (state.q5Visibility === 'VISIBLE_FULL' || state.q5Visibility === 'VISIBLE_MOSTLY') && (state.q6ManagementConnection === 'DECISION_USABLE' || state.q6ManagementConnection === 'STRATEGICALLY_CONNECTED');
  if (healthy) addRule(appliedRuleIds, 'V2-C-007');

  return {
    futureUnderstanding,
    currentUnderstanding,
    lensFindings,
    unknowns,
    hearingViewpoints,
    factCandidates,
    healthyGuard: {
      noImportantGapIdentified: healthy,
      reasons: healthy ? ['ITの把握と経営判断への接続について、現時点で大きな懸念は見えにくい状態です。'] : [],
    },
    appliedRuleIds,
  };
}
