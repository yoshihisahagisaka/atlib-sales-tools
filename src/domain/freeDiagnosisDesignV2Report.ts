import type { AnalysisResultV2, FreeDiagnosisNarrativeV2, LensV2 } from './freeDiagnosisDesignV2';

export const DESIGN_V2_REPORT_FORMAT_VERSION = 'free-diagnosis-design-v2-report-1' as const;
export const DESIGN_V2_REPORT_CONTEXT_VERSION = 'free-diagnosis-design-v2-report-context-1' as const;

export interface DesignV2ReportSection {
  key: 'FUTURE' | 'CURRENT_UNDERSTANDING' | 'LENSES' | 'UNKNOWNS' | 'NEXT_FACTS';
  title: string;
  entries: readonly string[];
}

export interface DesignV2ReportFactCandidate {
  id: string;
  whatToVerify: string;
  whyItMattersToFuture: string;
  whatMayBecomeKnowable: string;
  lenses: readonly LensV2[];
  sourceRuleIds: readonly string[];
}

/**
 * The stored customer-facing Draft.  This deliberately does not reuse the V1
 * Insight/Assessment block contract: Design v2 has its own immutable sources.
 */
export interface DesignV2ReportContent {
  formatVersion: typeof DESIGN_V2_REPORT_FORMAT_VERSION;
  recipient: { organizationDisplayName: string };
  diagnosisDate: string;
  issuer: { displayName: string };
  sections: readonly DesignV2ReportSection[];
  factCandidates: readonly DesignV2ReportFactCandidate[];
  assessmentProposal: {
    status: 'NOT_SELECTED';
    source: 'ANALYSIS_FACT_CANDIDATES';
    candidates: readonly DesignV2ReportFactCandidate[];
  };
}

export interface DesignV2ReportSources {
  organizationDisplayName: string;
  diagnosisDate: string;
  narrative: FreeDiagnosisNarrativeV2;
  analysis: AnalysisResultV2;
}

const section = (key: DesignV2ReportSection['key'], title: string, entries: readonly string[]): DesignV2ReportSection => ({
  key, title, entries: [...entries],
});

export function buildDesignV2ReportContent(source: DesignV2ReportSources): DesignV2ReportContent {
  const factCandidates = source.analysis.factCandidates.map(candidate => ({
    id: candidate.id,
    whatToVerify: candidate.whatToVerify,
    whyItMattersToFuture: candidate.whyItMattersToFuture,
    whatMayBecomeKnowable: candidate.whatMayBecomeKnowable,
    lenses: [...candidate.lenses],
    sourceRuleIds: [...candidate.sourceRuleIds],
  }));
  return {
    formatVersion: DESIGN_V2_REPORT_FORMAT_VERSION,
    recipient: { organizationDisplayName: source.organizationDisplayName },
    diagnosisDate: source.diagnosisDate,
    issuer: { displayName: 'atLIB株式会社' },
    sections: [
      section('FUTURE', '実現したい会社の未来', source.narrative.future.entries),
      section('CURRENT_UNDERSTANDING', '現在どこまで分かっているか', source.narrative.currentUnderstanding.entries),
      section('LENSES', '技術・運用・管理から見た確認ポイントと改善可能性', source.narrative.confirmationAndImprovement.entries),
      section('UNKNOWNS', 'まだ確認できていないこと', source.narrative.unknowns.entries),
      section('NEXT_FACTS', '次に確認する価値があること', source.narrative.nextFacts.entries),
    ],
    factCandidates,
    assessmentProposal: { status: 'NOT_SELECTED', source: 'ANALYSIS_FACT_CANDIDATES', candidates: factCandidates },
  };
}
