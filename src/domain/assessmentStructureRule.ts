// Assessment Structure / Suggested Assessment Scope Rule.
// Canonical: docs/free-diagnosis-rule-based-v1-assessment-structure-and-suggested-scope-rule-20261003.md
// (commit f416119442219bb0d9c112eaf40d17f66b11befe). Applied as-is, not re-derived.
//
// Guardrail enforced at the TYPE level, not just by convention: this function's only
// parameter is the 4 Structural Gates below. Investigation Need, UNKNOWN counts, Concern
// counts, Investigation Candidate counts, headcount/site-count/vendor-count etc. have no
// parameter to be passed through even by mistake (§6, §11 Guardrails; Regression Case 9/10).

export interface AssessmentStructureGates {
  /** Assessment Structureの分類自体に必要な構造情報が、無料診断の情報から確認できているか。 */
  structure_determinable: boolean;
  /** 識別されたテーマについて、単一の代表的な確認経路でFactを成立させられるか。 */
  single_management_scope: boolean;
  /** 1件以上のInvestigation Candidateについて、対象ごとに個別確認を行わなければ必要なFactが成立しないか。 */
  requires_individual_confirmation_per_target: boolean;
  /** 複数のIssue Pattern/テーマが相互に関連し、横断して確認する必要があるか。 */
  cross_theme_dependency: boolean;
}

export const ASSESSMENT_STRUCTURES = ['LIMITED', 'STANDARD_CROSS_FUNCTIONAL', 'EXTENDED', 'UNRESOLVED'] as const;
export type AssessmentStructure = typeof ASSESSMENT_STRUCTURES[number];

export const SUGGESTED_SCOPES = ['COMPACT', 'STANDARD', 'EXPANDED', 'REVIEW'] as const;
export type SuggestedScope = typeof SUGGESTED_SCOPES[number];

/** 判定順序（§6）：この順で評価し、最初に真になった条件で確定する。 */
export function classifyAssessmentStructure(gates: AssessmentStructureGates): AssessmentStructure {
  if (!gates.structure_determinable) return 'UNRESOLVED';
  if (gates.requires_individual_confirmation_per_target) return 'EXTENDED';
  if (gates.cross_theme_dependency) return 'STANDARD_CROSS_FUNCTIONAL';
  if (gates.single_management_scope) return 'LIMITED';
  // 5. 上記いずれにも該当しない中間的な場合: デフォルトはSTANDARD_CROSS_FUNCTIONAL（過小提示しない）。
  return 'STANDARD_CROSS_FUNCTIONAL';
}

const SUGGESTED_SCOPE_BY_STRUCTURE: Record<AssessmentStructure, SuggestedScope> = {
  LIMITED: 'COMPACT',
  STANDARD_CROSS_FUNCTIONAL: 'STANDARD',
  EXTENDED: 'EXPANDED',
  UNRESOLVED: 'REVIEW',
};
// 税別・円。§7のDECIDED価格と完全一致（doc83 §5.1-5.4）。EXPANDEDはSTANDARDと同額の基準価格に
// 個別見積が追加される（requiresIndividualQuoteで明示、金額そのものはこのSliceでは確定しない）。
const SUGGESTED_BASE_PRICE_YEN: Record<SuggestedScope, number | null> = {
  COMPACT: 800_000,
  STANDARD: 1_200_000,
  EXPANDED: 1_200_000,
  REVIEW: null,
};

export interface AssessmentStructureSuggestion {
  structure: AssessmentStructure;
  suggestedScope: SuggestedScope;
  suggestedBasePriceYen: number | null;
  requiresIndividualQuote: boolean;
  /** 4 Gateのうちどれが真でどれが偽だったか。System Suggestionの構造的根拠（§9 Human Override）。 */
  grounds: AssessmentStructureGates;
}

export function suggestAssessmentScope(gates: AssessmentStructureGates): AssessmentStructureSuggestion {
  const structure = classifyAssessmentStructure(gates);
  const suggestedScope = SUGGESTED_SCOPE_BY_STRUCTURE[structure];
  return {
    structure,
    suggestedScope,
    suggestedBasePriceYen: SUGGESTED_BASE_PRICE_YEN[suggestedScope],
    requiresIndividualQuote: structure === 'EXTENDED',
    grounds: gates,
  };
}

// 担当者向け日本語翻訳（Doc UI Wireframe #12: 内部enum名を直接露出しない）。
export const ASSESSMENT_STRUCTURE_GATE_LABEL_JA: Record<keyof AssessmentStructureGates, string> = {
  structure_determinable: '調査構造を今回の情報だけで判定できるか',
  single_management_scope: '単一の代表的な確認経路でFactを成立させられるか',
  requires_individual_confirmation_per_target: '対象ごとに個別の確認が必要か',
  cross_theme_dependency: '複数テーマを横断して確認する必要があるか',
};
