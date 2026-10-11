import {
  type AnalysisResultV2,
  type CurrentStructuredStateV2,
  type FreeDiagnosisNarrativeV2,
} from './freeDiagnosisDesignV2';

/** Generates the five Design v2 report sections without upgrading survey recognition to FACT. */
export function generateFreeDiagnosisNarrativeV2(
  _state: CurrentStructuredStateV2,
  analysis: AnalysisResultV2,
): FreeDiagnosisNarrativeV2 {
  return {
    future: { heading: '目指している会社の姿', entries: analysis.futureUnderstanding.map((item) => item.text) },
    currentUnderstanding: { heading: '今、確認できていること / まだ分かっていないこと', entries: analysis.currentUnderstanding.map((item) => item.text) },
    confirmationAndImprovement: {
      heading: '確認ポイントと改善可能性',
      entries: analysis.lensFindings.map((item) => item.text),
    },
    unknowns: {
      heading: 'まだ確認できていないこと',
      entries: analysis.unknowns.map((item) => item.text),
    },
    nextFacts: {
      heading: '次に確認・判断すること',
      entries: analysis.factCandidates.map((item) => item.whatToVerify),
    },
  };
}
