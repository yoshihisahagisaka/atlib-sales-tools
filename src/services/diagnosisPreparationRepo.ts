import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DiagnosisError, type Actor } from '../domain/itManagementDiagnosis';
import { PROMPT_VERSION, POLICY_VERSION, type OrganizerOutput, type SourceRef, type HumanTheme, type HumanPlan } from '../domain/diagnosisPreparation';
import { buildPreDiagnosisContext, type PreDiagnosisContext } from './preDiagnosisContext';

export interface Execution<T = PreDiagnosisContext> {
  id: string; diagnosis_case_id: string; status: string; input_snapshot_json: T;
}
interface Proposal {
  id: string; proposal_type: string; status: string; content_json: Record<string, any>; title: string;
}
interface PreparationCaseRow {
  id: string; diagnosis_status: string; version: number;
  plan_confirmed_by_user_id: string | null; plan_confirmed_at: Date | null;
  plan_snapshot_json: { themes: { id: string }[]; plan_items: { id: string }[]; version: number } | null;
}
/** Transactions never span provider calls. Staff commands lock their Case first. */
export class DiagnosisPreparationRepo {
  constructor(private readonly pool: Pool) {}
  private async tx<T>(work: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  private staff(actor: Actor): string {
    if (actor.kind !== 'STAFF' || !actor.userId) throw new DiagnosisError(403, 'スタッフによる操作が必要です。');
    return actor.userId;
  }
  private async locked(c: PoolClient, id: string, actor: Actor, statuses?: string[]) {
    this.staff(actor);
    const { rows } = await c.query<PreparationCaseRow>('SELECT id,diagnosis_status,version,plan_confirmed_by_user_id,plan_confirmed_at,plan_snapshot_json FROM diagnosis_cases WHERE id=$1 FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) throw new DiagnosisError(404, '案件が見つかりません。');
    if (statuses && !statuses.includes(row.diagnosis_status)) throw new DiagnosisError(409, 'この案件の状態では操作できません。');
    return row;
  }
  private async audit(c: PoolClient, id: string, actor: Actor, command: string, detail: unknown): Promise<void> {
    await c.query(`INSERT INTO diagnosis_audit_logs (id,diagnosis_case_id,command,actor_type,actor_user_id,detail_json)
      VALUES ($1,$2,$3,'STAFF',$4,$5)`, [randomUUID(),id,command,this.staff(actor),JSON.stringify(detail)]);
  }
  private async changed(c: PoolClient, id: string, actor: Actor, command: string, detail: unknown): Promise<void> {
    await c.query('UPDATE diagnosis_cases SET version=version+1,updated_at=now() WHERE id=$1',[id]);
    await this.audit(c,id,actor,command,detail);
  }
  private async transition(c: PoolClient, id: string, actor: Actor, from: string, to: string, command: string, detail: unknown) {
    await c.query('UPDATE diagnosis_cases SET diagnosis_status=$2 WHERE id=$1',[id,to]);
    await c.query(`INSERT INTO case_transitions (id,diagnosis_case_id,from_status,to_status,command,actor_type,actor_user_id)
      VALUES ($1,$2,$3,$4,$5,'STAFF',$6)`,[randomUUID(),id,from,to,command,this.staff(actor)]);
    await this.changed(c,id,actor,command,detail);
  }
  async enqueue(id: string, actor: Actor, provider: string, model: string) {
    return this.tx(async c => {
      await this.locked(c,id,actor,['SURVEY_COMPLETED','PREPARATION_IN_PROGRESS']);
      const pending = await c.query('SELECT id FROM ai_executions WHERE diagnosis_case_id=$1 AND status IN (\'PENDING\',\'RUNNING\')',[id]);
      if (pending.rows.length) throw new DiagnosisError(409, 'AI事前整理は実行待ちまたは実行中です。');
      const context = await buildPreDiagnosisContext(c,id);
      const executionId = randomUUID();
      await c.query(`INSERT INTO ai_executions (id,diagnosis_case_id,process_type,status,provider,model,prompt_version,policy_version,input_snapshot_json,requested_by_user_id)
        VALUES ($1,$2,'PRE_DIAGNOSIS_ORGANIZER','PENDING',$3,$4,$5,$6,$7,$8)`,
      [executionId,id,provider,model,PROMPT_VERSION,POLICY_VERSION,JSON.stringify(context),this.staff(actor)]);
      await this.audit(c,id,actor,'RunPreDiagnosisOrganizer',{ execution_id: executionId });
      return { execution_id: executionId, status: 'PENDING' };
    });
  }
  async claimExecution<T = PreDiagnosisContext>(processType = 'PRE_DIAGNOSIS_ORGANIZER'): Promise<Execution<T> | null> {
    return this.tx(async c => {
      // Recovery after timeout/process restart. Retries are new explicit executions.
      await c.query(`UPDATE ai_executions SET status='FAILED',error_code='AI_WORKER_INTERRUPTED',completed_at=now(),updated_at=now()
        WHERE status='RUNNING' AND lease_expires_at < now() AND process_type=$1`,[processType]);
      const { rows } = await c.query<Execution<T>>(`SELECT id,diagnosis_case_id,status,input_snapshot_json FROM ai_executions
        WHERE status='PENDING' AND process_type=$1 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,[processType]);
      const row = rows[0]; if (!row) return null;
      await c.query(`UPDATE ai_executions SET status='RUNNING',started_at=now(),lease_expires_at=now()+interval '2 minutes',updated_at=now() WHERE id=$1`,[row.id]);
      return row;
    });
  }
  async failExecution(execution: { id: string }, code: string, raw: unknown = null): Promise<void> {
    await this.pool.query(`UPDATE ai_executions SET status='FAILED',error_code=$2,raw_output_json=$3,
      validation_status=$4,completed_at=now(),updated_at=now() WHERE id=$1 AND status='RUNNING'`,
    [execution.id,code,JSON.stringify(raw),raw === null ? 'NOT_VALIDATED' : 'INVALID']);
  }
  async finishExecution(execution: Execution, output: OrganizerOutput, raw: unknown): Promise<void> {
    await this.tx(async c => {
      const { rows: cases } = await c.query('SELECT diagnosis_status FROM diagnosis_cases WHERE id=$1 FOR UPDATE',[execution.diagnosis_case_id]);
      const { rows } = await c.query('SELECT status FROM ai_executions WHERE id=$1 FOR UPDATE',[execution.id]);
      if (rows[0]?.status !== 'RUNNING') return; // expired worker cannot overwrite recovery/retry
      if (!['SURVEY_COMPLETED','PREPARATION_IN_PROGRESS'].includes(cases[0]?.diagnosis_status)) {
        await c.query(`UPDATE ai_executions SET status='FAILED',error_code='CASE_STATE_CHANGED',raw_output_json=$2,validation_status='VALID',completed_at=now(),updated_at=now() WHERE id=$1`,[execution.id,JSON.stringify(raw)]);
        return;
      }
      let order = 0;
      const add = async (type: string, title: string, content: unknown, parent: string | null, refs: SourceRef[]) => {
        const id = randomUUID();
        await c.query(`INSERT INTO ai_proposals (id,diagnosis_case_id,ai_execution_id,parent_theme_proposal_id,proposal_type,title,content_json,display_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[id,execution.diagnosis_case_id,execution.id,parent,type,title,JSON.stringify(content),++order]);
        for (const ref of refs) await c.query(`INSERT INTO ai_proposal_sources (ai_proposal_id,diagnosis_case_id,source_ref_type,source_ref_id,relation)
          VALUES ($1,$2,'SURVEY_RESPONSE',$3,$4) ON CONFLICT DO NOTHING`,[id,execution.diagnosis_case_id,ref.source_ref_id,ref.relation]);
        return id;
      };
      for (const theme of output.themes) {
        const refs = theme.available_context.flatMap(x => x.source_refs);
        const parent = await add('THEME',theme.title,theme,null,refs);
        // Children inherit related Theme context, not a new evidence claim.
        const related = refs.map(ref => ({ ...ref, relation: 'RELATED' as const }));
        for (const [type, items] of [['UNKNOWN',theme.unknowns],['HYPOTHESIS',theme.hypotheses],['QUESTION',theme.recommended_questions],['EVIDENCE_CANDIDATE',theme.evidence_candidates]] as const) {
          for (const item of items) await add(type,item.text,item,parent,related);
        }
      }
      await c.query(`UPDATE ai_executions SET status='SUCCEEDED',raw_output_json=$2,validation_status='VALID',completed_at=now(),updated_at=now() WHERE id=$1`,[execution.id,JSON.stringify(raw)]);
      // Deliberately no Case transition, Theme, Plan item or human approval here.
    });
  }
  async start(id: string, actor: Actor): Promise<void> {
    await this.tx(async c => { await this.locked(c,id,actor,['SURVEY_COMPLETED']);
      await this.transition(c,id,actor,'SURVEY_COMPLETED','PREPARATION_IN_PROGRESS','StartDiagnosisPreparation',{}); });
  }
  private async proposal(c: PoolClient, id: string, proposalId: string): Promise<Proposal> {
    const { rows } = await c.query<Proposal>(`SELECT p.id,p.proposal_type,p.status,p.content_json,p.title FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.id=$1 AND p.diagnosis_case_id=$2 AND e.process_type='PRE_DIAGNOSIS_ORGANIZER'`,[proposalId,id]);
    const p = rows[0]; if (!p) throw new DiagnosisError(404, '提案が見つかりません。');
    if (!['GENERATED','UNDER_REVIEW'].includes(p.status)) throw new DiagnosisError(409, 'この提案は既に判断済みです。');
    return p;
  }
  private async insertTheme(c: PoolClient, id: string, actor: Actor, input: HumanTheme, source: string | null) {
    const key = randomUUID();
    await c.query(`INSERT INTO diagnosis_themes (id,diagnosis_case_id,title,description,future_relation,priority_order,source_ai_proposal_id,created_by,created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(max(priority_order),0)+1 FROM diagnosis_themes WHERE diagnosis_case_id=$2),$6,$7,$8)`,
    [key,id,input.title,input.description,input.future_relation,source,source ? 'AI_ACCEPTED' : 'HUMAN',this.staff(actor)]);
    return key;
  }
  private async checkTheme(c: PoolClient, id: string, themeId: string | null) {
    if (themeId && !(await c.query(`SELECT id FROM diagnosis_themes WHERE id=$1 AND diagnosis_case_id=$2 AND status='ACTIVE'`,[themeId,id])).rows.length)
      throw new DiagnosisError(422, '同じ案件の有効なテーマを選択してください。');
  }
  private async insertPlan(c: PoolClient, id: string, actor: Actor, input: HumanPlan, source: string | null) {
    await this.checkTheme(c,id,input.diagnosis_theme_id);
    const key = randomUUID();
    await c.query(`INSERT INTO diagnosis_plan_items (id,diagnosis_case_id,diagnosis_theme_id,item_type,text,purpose,priority_order,source_ai_proposal_id,created_by,created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(priority_order),0)+1 FROM diagnosis_plan_items WHERE diagnosis_case_id=$2),$7,$8,$9)`,
    [key,id,input.diagnosis_theme_id,input.item_type,input.text,input.purpose,source,source ? 'AI_ACCEPTED' : 'HUMAN',this.staff(actor)]);
    return key;
  }
  async accept(id: string, proposalId: string, actor: Actor, edit?: HumanTheme | HumanPlan) {
    return this.tx(async c => {
      await this.locked(c,id,actor,['PREPARATION_IN_PROGRESS']);
      const p = await this.proposal(c,id,proposalId);
      let key: string;
      if (p.proposal_type === 'THEME') {
        if (edit && !('title' in edit)) throw new DiagnosisError(422,'テーマの編集形式が不正です。');
        key = await this.insertTheme(c,id,actor,edit as HumanTheme ?? { title: p.title, description: p.content_json.why_it_matters, future_relation: p.content_json.future_relation },proposalId);
      } else {
        if (edit && !('item_type' in edit)) throw new DiagnosisError(422,'確認項目の編集形式が不正です。');
        const type = p.proposal_type === 'QUESTION' ? 'QUESTION' : p.proposal_type === 'EVIDENCE_CANDIDATE' ? 'EVIDENCE_CANDIDATE_CHECK' : 'CONFIRMATION';
        if (edit && (edit as HumanPlan).item_type !== type) throw new DiagnosisError(422,'提案の意味区分を変更できません。');
        key = await this.insertPlan(c,id,actor,edit as HumanPlan ?? { text: p.content_json.text, purpose: p.content_json.purpose ?? p.content_json.unknown_type ?? p.proposal_type, item_type: type, diagnosis_theme_id: null },proposalId);
      }
      await c.query('UPDATE ai_proposals SET status=$2,updated_at=now() WHERE id=$1',[proposalId,edit ? 'ACCEPTED_WITH_EDIT' : 'ACCEPTED']);
      await this.changed(c,id,actor,edit ? 'EditAndAcceptAIProposal' : 'AcceptAIProposal',{ proposal_id: proposalId, created_id: key, edit: edit ?? null });
      return { id: key };
    });
  }
  async reject(id: string, proposalId: string, actor: Actor): Promise<void> {
    await this.tx(async c => { await this.locked(c,id,actor,['PREPARATION_IN_PROGRESS']); await this.proposal(c,id,proposalId);
      await c.query(`UPDATE ai_proposals SET status='REJECTED',updated_at=now() WHERE id=$1`,[proposalId]);
      await this.changed(c,id,actor,'RejectAIProposal',{ proposal_id: proposalId }); });
  }
  async addTheme(id: string, actor: Actor, input: HumanTheme) {
    return this.tx(async c => { await this.locked(c,id,actor,['PREPARATION_IN_PROGRESS']); const key = await this.insertTheme(c,id,actor,input,null);
      await this.changed(c,id,actor,'CreateHumanTheme',{ id: key, input }); return { id: key }; });
  }
  async addPlan(id: string, actor: Actor, input: HumanPlan) {
    return this.tx(async c => { await this.locked(c,id,actor,['PREPARATION_IN_PROGRESS']); const key = await this.insertPlan(c,id,actor,input,null);
      await this.changed(c,id,actor,'AddDiagnosisPlanItem',{ id: key, input }); return { id: key }; });
  }
  async update(id: string, key: string, actor: Actor, kind: 'themes' | 'plan-items', input: HumanTheme | HumanPlan) {
    return this.tx(async c => {
      await this.locked(c,id,actor,['PREPARATION_IN_PROGRESS']);
      const table = kind === 'themes' ? 'diagnosis_themes' : 'diagnosis_plan_items';
      const { rows } = await c.query(`SELECT * FROM ${table} WHERE id=$1 AND diagnosis_case_id=$2 AND status='ACTIVE'`,[key,id]);
      if (!rows[0]) throw new DiagnosisError(404,'有効な項目が見つかりません。');
      if (kind === 'themes') {
        const t = input as HumanTheme;
        await c.query('UPDATE diagnosis_themes SET title=$2,description=$3,future_relation=$4,updated_at=now() WHERE id=$1',[key,t.title,t.description,t.future_relation]);
      } else {
        const p = input as HumanPlan; await this.checkTheme(c,id,p.diagnosis_theme_id);
        if (rows[0].source_ai_proposal_id && p.item_type !== rows[0].item_type) throw new DiagnosisError(422,'採用した提案の意味区分を変更できません。');
        await c.query('UPDATE diagnosis_plan_items SET text=$2,purpose=$3,item_type=$4,diagnosis_theme_id=$5,updated_at=now() WHERE id=$1',[key,p.text,p.purpose,p.item_type,p.diagnosis_theme_id]);
      }
      await this.changed(c,id,actor,kind === 'themes' ? 'UpdateDiagnosisTheme' : 'UpdateDiagnosisPlanItem',{ id: key, before: rows[0], after: input });
    });
  }
  async remove(id: string, key: string, actor: Actor, kind: 'themes' | 'plan-items') {
    await this.tx(async c => {
      await this.locked(c,id,actor,['PREPARATION_IN_PROGRESS']);
      const table = kind === 'themes' ? 'diagnosis_themes' : 'diagnosis_plan_items';
      if (kind === 'themes' && (await c.query(`SELECT id FROM diagnosis_plan_items WHERE diagnosis_theme_id=$1 AND diagnosis_case_id=$2 AND status='ACTIVE'`,[key,id])).rows.length)
        throw new DiagnosisError(409,'このテーマに紐づく確認項目を先に移動または削除してください。');
      const result = await c.query(`UPDATE ${table} SET status='REMOVED',updated_at=now() WHERE id=$1 AND diagnosis_case_id=$2 AND status='ACTIVE' RETURNING id`,[key,id]);
      if (!result.rows.length) throw new DiagnosisError(404,'有効な項目が見つかりません。');
      await this.changed(c,id,actor,kind === 'themes' ? 'RemoveDiagnosisTheme' : 'RemoveDiagnosisPlanItem',{ id: key });
    });
  }
  async reorder(id: string, actor: Actor, themeIds: string[], planIds: string[]) {
    await this.tx(async c => {
      await this.locked(c,id,actor,['PREPARATION_IN_PROGRESS']);
      for (const [table, ids] of [['diagnosis_themes',themeIds],['diagnosis_plan_items',planIds]] as const) {
        const { rows } = await c.query<{ id: string }>(`SELECT id FROM ${table} WHERE diagnosis_case_id=$1 AND status='ACTIVE'`,[id]);
        if (ids.length !== rows.length || new Set(ids).size !== ids.length || rows.some(row => !ids.includes(row.id))) throw new DiagnosisError(422,'現在の全項目を重複なく指定してください。');
        for (let i=0;i<ids.length;i++) await c.query(`UPDATE ${table} SET priority_order=$2,updated_at=now() WHERE id=$1`,[ids[i],i+1]);
      }
      await this.changed(c,id,actor,'ReorderDiagnosisPlan',{ theme_ids: themeIds, plan_item_ids: planIds });
    });
  }
  async confirm(id: string, actor: Actor, expectedVersion: number) {
    await this.tx(async c => {
      const row = await this.locked(c,id,actor,['PREPARATION_IN_PROGRESS']);
      if (row.version !== expectedVersion) throw new DiagnosisError(409,'準備内容が更新されています。再読み込みして確認してください。');
      const { rows: themes } = await c.query(`SELECT * FROM diagnosis_themes WHERE diagnosis_case_id=$1 AND status='ACTIVE' ORDER BY priority_order`,[id]);
      const { rows: items } = await c.query(`SELECT * FROM diagnosis_plan_items WHERE diagnosis_case_id=$1 AND status='ACTIVE' ORDER BY priority_order`,[id]);
      if (!themes.length || !items.length) throw new DiagnosisError(422,'有効なテーマと確認項目がそれぞれ1件以上必要です。');
      await c.query(`UPDATE diagnosis_cases SET plan_confirmed_by_user_id=$2,plan_confirmed_at=now(),plan_snapshot_json=$3 WHERE id=$1`,
        [id,this.staff(actor),JSON.stringify({ themes, plan_items: items, version: row.version })]);
      await this.transition(c,id,actor,'PREPARATION_IN_PROGRESS','READY_FOR_DIAGNOSIS','ConfirmDiagnosisPlan',{ version: row.version, theme_ids: themes.map(t=>t.id), plan_item_ids: items.map(p=>p.id) });
    });
  }
  async read(id: string, actor: Actor) {
    return this.tx(async c => {
      const row = await this.locked(c,id,actor);
      const { rows: executions } = await c.query(`SELECT id,status,provider,model,prompt_version,policy_version,validation_status,error_code,started_at,completed_at,created_at
        FROM ai_executions WHERE diagnosis_case_id=$1 AND process_type='PRE_DIAGNOSIS_ORGANIZER' ORDER BY created_at DESC`,[id]);
      const { rows: proposals } = await c.query(`SELECT p.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('source_ref_id',s.source_ref_id,'source_ref_type',s.source_ref_type,'relation',s.relation))
        FROM ai_proposal_sources s WHERE s.ai_proposal_id=p.id),'[]'::jsonb) AS sources FROM ai_proposals p JOIN ai_executions e ON e.id=p.ai_execution_id WHERE p.diagnosis_case_id=$1 AND e.process_type='PRE_DIAGNOSIS_ORGANIZER' ORDER BY p.created_at,p.display_order`,[id]);
      const { rows: themes } = await c.query(`SELECT * FROM diagnosis_themes WHERE diagnosis_case_id=$1 AND status='ACTIVE' ORDER BY priority_order`,[id]);
      const { rows: plan_items } = await c.query(`SELECT * FROM diagnosis_plan_items WHERE diagnosis_case_id=$1 AND status='ACTIVE' ORDER BY priority_order`,[id]);
      return { ...row, executions, proposals, themes, plan_items };
    });
  }
}
