import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { RuleBasedV1Error, intakeAnswerEnvelopeSchema, type CaseStatus, type FocusSelectionInput, type IntakeAnswerInput, type IntakeAnswerEnvelopeV1, type ManagementFocus, type RecordStatementInput, REQUIRED_INTAKE_QUESTION_CODES } from '../domain/freeDiagnosisRuleBasedV1';
import { projectIntakeSemantics } from '../domain/intakeSemanticProjection';
import { runInitialRule, type InitialRuleResult } from '../domain/initialRuleEngine';
import { runFinalRule, type FinalRuleResult } from '../domain/finalRuleEngine';
import { hearingUnitForFocus, type StructuredHearingAnswer } from '../domain/structuredHearing';
import { runRuleAnalysis, type HearingStatementInput, type RuleAnalysisResult, type TriggerFinding } from '../domain/ruleAnalysisEngine';
import { suggestAssessmentScope, type AssessmentStructureSuggestion } from '../domain/assessmentStructureRule';

export interface CaseRow {
  id: string;
  companyId: string;
  contactId: string | null;
  salesActivityId: string;
  status: CaseStatus;
  primaryFocus: ManagementFocus | null;
  secondaryFocus: ManagementFocus | null;
  isInternalTest: boolean;
  version: number;
}

function mapCaseRow(row: Record<string, unknown>): CaseRow {
  return {
    id: row.id as string, companyId: row.company_id as string, contactId: row.contact_id as string | null,
    salesActivityId: row.sales_activity_id as string, status: row.status as CaseStatus,
    primaryFocus: row.primary_focus as ManagementFocus | null, secondaryFocus: row.secondary_focus as ManagementFocus | null,
    isInternalTest: row.is_internal_test as boolean, version: row.version as number,
  };
}

export class FreeDiagnosisRuleBasedCaseRepo {
  constructor(private readonly pool: Pool) {}

  async createCase(companyId: string, contactId: string | null, salesActivityId: string, staffEmail: string, isInternalTest = true): Promise<CaseRow> {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO it_management_diagnosis_case_v2 (id,company_id,contact_id,sales_activity_id,status,is_internal_test,created_by_user_id)
       VALUES ($1,$2,$3,$4,'INTAKE_IN_PROGRESS',$5,$6) RETURNING *`,
      [id, companyId, contactId, salesActivityId, isInternalTest, staffEmail],
    );
    return mapCaseRow(rows[0]);
  }

  async getCase(id: string): Promise<CaseRow | null> {
    const { rows } = await this.pool.query(`SELECT * FROM it_management_diagnosis_case_v2 WHERE id = $1`, [id]);
    return rows[0] ? mapCaseRow(rows[0]) : null;
  }

  private async transition(caseId: string, fromStatuses: CaseStatus[], toStatus: CaseStatus, expectedVersion: number, extraSetSql = '', extraParams: unknown[] = []): Promise<CaseRow> {
    const { rows } = await this.pool.query(
      `UPDATE it_management_diagnosis_case_v2 SET status=$1, version=version+1, updated_at=now() ${extraSetSql}
       WHERE id=$2 AND version=$3 AND status = ANY($4) RETURNING *`,
      [toStatus, caseId, expectedVersion, fromStatuses, ...extraParams],
    );
    if (!rows[0]) throw new RuleBasedV1Error(409, 'CASE_VERSION_CONFLICT_OR_INVALID_STATUS');
    return mapCaseRow(rows[0]);
  }

  async recordIntakeAnswer(caseId: string, answer: IntakeAnswerInput, staffEmail: string): Promise<void> {
    const provenance = answer.channel === 'SELF' ? 'CUSTOMER_SELF' : 'SALES_PROXY';
    await this.pool.query(
      `INSERT INTO hearing_intake_response_v2 (id,case_id,question_code,channel,raw_value_json,entered_by_user_id,provenance)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (case_id, question_code) DO UPDATE SET raw_value_json=$5, channel=$4, entered_by_user_id=$6, provenance=$7, updated_at=now()`,
      [randomUUID(), caseId, answer.questionCode, answer.channel, JSON.stringify(answer.value ?? null), staffEmail, provenance],
    );
  }

  async listIntakeAnswers(caseId: string): Promise<{ questionCode: string; value: unknown }[]> {
    const { rows } = await this.pool.query<{ question_code: string; raw_value_json: unknown }>(
      `SELECT question_code, raw_value_json FROM hearing_intake_response_v2 WHERE case_id = $1`, [caseId],
    );
    return rows.map(r => ({ questionCode: r.question_code, value: r.raw_value_json }));
  }

  async initialRule(caseId: string): Promise<{ result: InitialRuleResult; q7: string | null }> {
    const answers = await this.listIntakeAnswers(caseId);
    const envelopes: IntakeAnswerEnvelopeV1[] = answers.map(x => intakeAnswerEnvelopeSchema.parse(x.value));
    const q7 = envelopes.find(x => x.questionCode === 'Q7');
    return { result: runInitialRule(projectIntakeSemantics(envelopes)), q7: typeof q7?.answerValue === 'string' ? q7.answerValue : null };
  }

  async hearingUnits(caseId: string) {
    const initial = await this.initialRule(caseId);
    const contexts = initial.result.focusItems.length
      ? initial.result.focusItems.map(x => x.focus)
      : initial.result.relevanceReferences.map(x => x.focus);
    return [...new Set(contexts)].map(hearingUnitForFocus);
  }

  async completeIntake(caseId: string, expectedVersion: number): Promise<CaseRow> {
    const answered = new Set((await this.listIntakeAnswers(caseId)).map(a => a.questionCode));
    const missing = REQUIRED_INTAKE_QUESTION_CODES.filter(q => !answered.has(q));
    if (missing.length > 0) throw new RuleBasedV1Error(422, 'INTAKE_REQUIRED_QUESTIONS_MISSING');
    return this.transition(caseId, ['INTAKE_IN_PROGRESS'], 'INTAKE_COMPLETED', expectedVersion);
  }

  /** A public self submission awaits an external booking before staff preparation. */
  async markBookingPending(caseId: string, expectedVersion: number): Promise<CaseRow> {
    return this.transition(caseId, ['INTAKE_COMPLETED'], 'BOOKING_PENDING', expectedVersion);
  }

  async selectFocus(caseId: string, input: FocusSelectionInput, expectedVersion: number): Promise<CaseRow> {
    return this.transition(caseId, ['INTAKE_COMPLETED'], 'FOCUS_SELECTED', expectedVersion,
      ', primary_focus=$5, secondary_focus=$6', [input.primaryFocus, input.secondaryFocus ?? null]);
  }

  async startPreparation(caseId: string, expectedVersion: number): Promise<CaseRow> {
    const initial = await this.initialRule(caseId);
    const primary = initial.result.focusItems.find(x => x.role === 'PRIMARY')?.focus ?? null;
    const secondary = initial.result.focusItems.find(x => x.role === 'RELATED')?.focus ?? null;
    const answers = await this.listIntakeAnswers(caseId);
    await this.pool.query(`INSERT INTO rule_analysis_execution (id,case_id,status,rule_version,analysis_stage,input_snapshot_json,started_at,completed_at) VALUES ($1,$2,'SUCCEEDED',$3,'INITIAL',$4,now(),now())`,
      [randomUUID(), caseId, 'current-design-v1-initial-rule-1.0.0', JSON.stringify({ intake: answers.map(a => a.value) })]);
    return this.transition(caseId, ['INTAKE_COMPLETED', 'FOCUS_SELECTED', 'BOOKING_PENDING'], 'PREPARATION_IN_PROGRESS', expectedVersion,
      ', primary_focus=$5, secondary_focus=$6', [primary, secondary]);
  }

  async startHearing(caseId: string, expectedVersion: number): Promise<CaseRow> {
    return this.transition(caseId, ['PREPARATION_IN_PROGRESS'], 'HEARING_IN_PROGRESS', expectedVersion);
  }

  async enterOrganizingMode(caseId: string, expectedVersion: number): Promise<CaseRow> {
    return this.transition(caseId, ['HEARING_IN_PROGRESS'], 'HEARING_ORGANIZING', expectedVersion);
  }

  async recordStatement(caseId: string, input: RecordStatementInput, staffEmail: string): Promise<string> {
    const current = await this.getCase(caseId);
    if (!current || (current.status !== 'HEARING_IN_PROGRESS' && current.status !== 'HEARING_ORGANIZING')) {
      throw new RuleBasedV1Error(409, 'HEARING_NOT_IN_PROGRESS');
    }
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO hearing_statement_v2 (id,case_id,plan_item_ref,statement_text,operator_note_text,knowledge_state,requires_individual_confirmation,is_negative_answer,structured_answer_json,recorded_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, caseId, input.planItemRef ?? null, input.statementText, input.operatorNoteText ?? null, input.knowledgeState, input.requiresIndividualConfirmation, input.isNegativeAnswer, input.structuredAnswer ? JSON.stringify(input.structuredAnswer) : null, staffEmail],
    );
    return id;
  }

  async listStatements(caseId: string): Promise<HearingStatementInput[]> {
    const { rows } = await this.pool.query<{ plan_item_ref: string | null; knowledge_state: string; requires_individual_confirmation: boolean }>(
      `SELECT plan_item_ref, knowledge_state, requires_individual_confirmation FROM hearing_statement_v2 WHERE case_id = $1 ORDER BY recorded_at ASC`,
      [caseId],
    );
    return rows.map(r => ({
      planItemRef: r.plan_item_ref,
      knowledgeState: r.knowledge_state as HearingStatementInput['knowledgeState'],
      requiresIndividualConfirmation: r.requires_individual_confirmation,
    }));
  }

  /** UI表示用（Rule Engineには渡さない）。statementText/isNegativeAnswerを含む。 */
  async listStatementsForDisplay(caseId: string): Promise<{ planItemRef: string | null; statementText: string; knowledgeState: string; isNegativeAnswer: boolean; recordedAt: string }[]> {
    const { rows } = await this.pool.query<{ plan_item_ref: string | null; statement_text: string; knowledge_state: string; is_negative_answer: boolean; recorded_at: string }>(
      `SELECT plan_item_ref, statement_text, knowledge_state, is_negative_answer, recorded_at FROM hearing_statement_v2 WHERE case_id = $1 ORDER BY recorded_at ASC`,
      [caseId],
    );
    return rows.map(r => ({ planItemRef: r.plan_item_ref, statementText: r.statement_text, knowledgeState: r.knowledge_state, isNegativeAnswer: r.is_negative_answer, recordedAt: r.recorded_at }));
  }

  async listStructuredAnswers(caseId: string): Promise<{ answer: StructuredHearingAnswer; knowledgeState: HearingStatementInput['knowledgeState'] }[]> {
    const { rows } = await this.pool.query<{ structured_answer_json: unknown; knowledge_state: string }>(`SELECT structured_answer_json,knowledge_state FROM hearing_statement_v2 WHERE case_id=$1 AND structured_answer_json IS NOT NULL ORDER BY recorded_at ASC`, [caseId]);
    return rows.map(r => ({ answer: r.structured_answer_json as StructuredHearingAnswer, knowledgeState: r.knowledge_state as HearingStatementInput['knowledgeState'] }));
  }

  async completeHearing(caseId: string, expectedVersion: number): Promise<CaseRow> {
    return this.transition(caseId, ['HEARING_IN_PROGRESS', 'HEARING_ORGANIZING'], 'HEARING_COMPLETED', expectedVersion);
  }

  private isAnswerPresent(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }

  async runAndPersistRuleAnalysis(caseId: string, expectedVersion: number): Promise<{ executionId: string; result: RuleAnalysisResult & { final: FinalRuleResult }; findings: (TriggerFinding & { id: string })[] }> {
    const kase = await this.getCase(caseId);
    if (!kase || kase.status !== 'HEARING_COMPLETED') throw new RuleBasedV1Error(409, 'HEARING_NOT_COMPLETED');
    const [statements, answers, structuredAnswerEntries] = await Promise.all([this.listStatements(caseId), this.listIntakeAnswers(caseId), this.listStructuredAnswers(caseId)]);
    const structuredAnswers = structuredAnswerEntries.map(x => x.answer);
    const hearingKnowledgeStates = structuredAnswerEntries.map(x => ({ hearingUnitCode: x.answer.hearingUnitCode, semanticKey: x.answer.semanticKey, knowledgeState: x.knowledgeState }));
    const q2 = answers.find(a => a.questionCode === 'Q2');
    const q3 = answers.find(a => a.questionCode === 'Q3');
    const initial = await this.initialRule(caseId);
    const healthyVerificationFocus = initial.result.focusItems.length === 0
      ? initial.result.relevanceReferences[0]?.focus ?? null
      : null;
    if (!kase.primaryFocus && !healthyVerificationFocus) throw new RuleBasedV1Error(409, 'FOCUS_NOT_SELECTED');
    const legacyResult = runRuleAnalysis({
      primaryFocus: kase.primaryFocus ?? healthyVerificationFocus!,
      secondaryFocus: kase.secondaryFocus,
      statements,
      hasStatedChangeIntent: this.isAnswerPresent(q2?.value),
      hasStatedOpportunityIntent: this.isAnswerPresent(q3?.value), verificationPurposes: initial.result.focusItems.filter(x => x.role !== 'OPPORTUNITY').flatMap(x => [{ focus: x.focus, triggerType: 'T1_KNOWLEDGE' as const }, { focus: x.focus, triggerType: 'T2_DECISION' as const }]),
    });
    const envelopes = answers.map(a => intakeAnswerEnvelopeSchema.parse(a.value));
    const finalResult = runFinalRule({ intake: projectIntakeSemantics(envelopes), answers: structuredAnswers, knowledgeStates: hearingKnowledgeStates });
    const executionId = randomUUID();
    await this.pool.query(
      `INSERT INTO rule_analysis_execution (id,case_id,status,rule_version,analysis_stage,input_snapshot_json,started_at,completed_at) VALUES ($1,$2,'SUCCEEDED',$3,'FINAL',$4,now(),now())`,
      [executionId, caseId, finalResult.ruleVersion, JSON.stringify({ intake: envelopes, hearing: structuredAnswers, hearingKnowledgeStates })],
    );
    const findings: (TriggerFinding & { id: string })[] = [];
    for (const f of legacyResult.findings) {
      const id = randomUUID();
      await this.pool.query(
        `INSERT INTO investigation_output (id,rule_analysis_execution_id,trigger_type,investigation_need,grounds_json) VALUES ($1,$2,$3,$4,$5)`,
        [id, executionId, f.triggerType, f.investigationNeed, JSON.stringify(f.grounds)],
      );
      findings.push({ ...f, id });
    }
    await this.transition(caseId, ['HEARING_COMPLETED'], 'HUMAN_REVIEW_REQUIRED', expectedVersion);
    return { executionId, result: { ...legacyResult, final: finalResult }, findings };
  }

  async listInvestigationOutputs(executionId: string): Promise<(TriggerFinding & { id: string })[]> {
    const { rows } = await this.pool.query<{ id: string; trigger_type: string; investigation_need: string; grounds_json: unknown }>(
      `SELECT id, trigger_type, investigation_need, grounds_json FROM investigation_output WHERE rule_analysis_execution_id = $1 ORDER BY created_at ASC`,
      [executionId],
    );
    return rows.map(r => ({ id: r.id, triggerType: r.trigger_type as TriggerFinding['triggerType'], investigationNeed: r.investigation_need as TriggerFinding['investigationNeed'], grounds: r.grounds_json as TriggerFinding['grounds'] }));
  }

  /**
   * reviewNotes: Doc E #9 Human Review -- 編集して採用(wordingOverrides)／却下(omittedFindingIds)。
   * これらは既存のgrounds_json/Gatesを書き換えず、提示方法・採否のみをHuman決定として別途記録する。
   */
  async humanReview(
    caseId: string, executionId: string, decision: 'APPROVED' | 'REJECTED', staffEmail: string, expectedVersion: number,
    reviewNotes: { omittedFindingIds: string[]; wordingOverrides: Record<string, string> } = { omittedFindingIds: [], wordingOverrides: {} },
  ): Promise<CaseRow> {
    const { rowCount } = await this.pool.query(
      `UPDATE rule_analysis_execution SET review_status=$1, reviewed_by_user_id=$2, reviewed_at=now(), review_notes_json=$5
       WHERE id=$3 AND case_id=$4 AND review_status IS NULL`,
      [decision, staffEmail, executionId, caseId, JSON.stringify(reviewNotes)],
    );
    if (!rowCount) throw new RuleBasedV1Error(409, 'RULE_ANALYSIS_EXECUTION_ALREADY_REVIEWED_OR_NOT_FOUND');
    const toStatus: CaseStatus = decision === 'APPROVED' ? 'ANALYSIS_APPROVED' : 'ANALYSIS_REJECTED';
    return this.transition(caseId, ['HUMAN_REVIEW_REQUIRED'], toStatus, expectedVersion);
  }

  async generatePreliminaryScope(caseId: string, expectedVersion: number): Promise<AssessmentStructureSuggestion> {
    const kase = await this.getCase(caseId);
    if (!kase || kase.status !== 'ANALYSIS_APPROVED') throw new RuleBasedV1Error(409, 'ANALYSIS_NOT_APPROVED');
    if (!kase.primaryFocus) throw new RuleBasedV1Error(409, 'FOCUS_NOT_SELECTED');
    const [statements, answers] = await Promise.all([this.listStatements(caseId), this.listIntakeAnswers(caseId)]);
    const q2 = answers.find(a => a.questionCode === 'Q2');
    const q3 = answers.find(a => a.questionCode === 'Q3');
    // 同じ immutable statement set から再計算する（Gatesを別途保存しない）。Rule Analysis時点
    // から状態が変わっていない限り、Human Reviewで承認されたものと常に同一の結果になる。
    const result = runRuleAnalysis({
      primaryFocus: kase.primaryFocus, secondaryFocus: kase.secondaryFocus, statements,
      hasStatedChangeIntent: this.isAnswerPresent(q2?.value), hasStatedOpportunityIntent: this.isAnswerPresent(q3?.value),
    });
    const suggestion = suggestAssessmentScope(result.assessmentStructureGates);
    await this.pool.query(
      `INSERT INTO assessment_structure_suggestion (id,case_id,stage,structure,suggested_scope,suggested_base_price,grounds_json,gate_flags_json)
       VALUES ($1,$2,'PRELIMINARY',$3,$4,$5,$6,$7)`,
      [randomUUID(), caseId, suggestion.structure, suggestion.suggestedScope, suggestion.suggestedBasePriceYen,
        JSON.stringify(suggestion.grounds), JSON.stringify(suggestion.grounds)],
    );
    await this.transition(caseId, ['ANALYSIS_APPROVED'], 'PRELIMINARY_SCOPE_READY', expectedVersion);
    return suggestion;
  }

  async getLatestPreliminaryScope(caseId: string): Promise<AssessmentStructureSuggestion | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM assessment_structure_suggestion WHERE case_id = $1 AND stage = 'PRELIMINARY' ORDER BY created_at DESC LIMIT 1`,
      [caseId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      structure: row.structure, suggestedScope: row.suggested_scope, suggestedBasePriceYen: row.suggested_base_price,
      requiresIndividualQuote: row.structure === 'EXTENDED', grounds: row.grounds_json,
    };
  }
}
