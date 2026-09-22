import type { Pool } from 'pg';
import type { CustomerFitCheckInput, FitCheckAnswer, HumanDecision } from '../domain/customerFitCheck';

export interface CustomerFitCheckItem {
  itemNo: number;
  answer: FitCheckAnswer;
  factNote: string | null;
  unknownNote: string | null;
  hypothesisNote: string | null;
}

export interface CustomerFitCheckListItem {
  id: string;
  customerName: string;
  salesRepEmail: string;
  checkedOn: string;
  humanDecision: HumanDecision | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerFitCheckDetail extends CustomerFitCheckListItem {
  decisionMakerContext: string | null;
  engagementContext: string | null;
  sourceContext: string | null;
  overallFacts: string | null;
  overallUnknowns: string | null;
  overallHypotheses: string | null;
  nextActions: string | null;
  decisionReason: string | null;
  items: CustomerFitCheckItem[];
}

interface HeaderRow {
  id: string;
  customer_name: string;
  sales_rep_email: string;
  checked_on: string;
  decision_maker_context: string | null;
  engagement_context: string | null;
  source_context: string | null;
  overall_facts: string | null;
  overall_unknowns: string | null;
  overall_hypotheses: string | null;
  next_actions: string | null;
  human_decision: HumanDecision | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  item_no: number;
  answer: FitCheckAnswer;
  fact_note: string | null;
  unknown_note: string | null;
  hypothesis_note: string | null;
}

/**
 * customer_fit_checks / customer_fit_check_items への問い合わせを一手に引き受けるリポジトリ。
 * ヘッダ・7項目を1つのチェックとして原子的に書き込む必要があるため、create/updateは
 * pool.connect() + BEGIN/COMMIT/ROLLBACKでトランザクションを取る（services/estimateRepo.tsと同じ形）。
 * organizations等の既存テーブルは参照しない（疎結合）。
 */
export class CustomerFitCheckRepo {
  constructor(private readonly pool: Pool) {}

  async create(salesRepEmail: string, input: CustomerFitCheckInput): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO customer_fit_checks
           (customer_name, sales_rep_email, checked_on, decision_maker_context, engagement_context, source_context,
            overall_facts, overall_unknowns, overall_hypotheses, next_actions, human_decision, decision_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          input.customerName,
          salesRepEmail,
          input.checkedOn,
          input.decisionMakerContext ?? null,
          input.engagementContext ?? null,
          input.sourceContext ?? null,
          input.overallFacts ?? null,
          input.overallUnknowns ?? null,
          input.overallHypotheses ?? null,
          input.nextActions ?? null,
          input.humanDecision ?? null,
          input.decisionReason ?? null,
        ],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('create: insert returned no id');

      await insertItems(client, id, input.items);

      await client.query('COMMIT');
      return id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** ヘッダ・7項目をまとめて全置換する（既存項目は一旦削除して再作成）。存在しないidの場合はfalseを返す。 */
  async update(id: string, input: CustomerFitCheckInput): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE customer_fit_checks
         SET customer_name = $1, checked_on = $2, decision_maker_context = $3, engagement_context = $4, source_context = $5,
             overall_facts = $6, overall_unknowns = $7, overall_hypotheses = $8, next_actions = $9,
             human_decision = $10, decision_reason = $11, updated_at = now()
         WHERE id = $12`,
        [
          input.customerName,
          input.checkedOn,
          input.decisionMakerContext ?? null,
          input.engagementContext ?? null,
          input.sourceContext ?? null,
          input.overallFacts ?? null,
          input.overallUnknowns ?? null,
          input.overallHypotheses ?? null,
          input.nextActions ?? null,
          input.humanDecision ?? null,
          input.decisionReason ?? null,
          id,
        ],
      );
      if ((rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      await client.query('DELETE FROM customer_fit_check_items WHERE check_id = $1', [id]);
      await insertItems(client, id, input.items);

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM customer_fit_checks WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  async list(opts: { humanDecision?: HumanDecision; limit: number; offset: number }): Promise<{
    items: CustomerFitCheckListItem[];
    total: number;
  }> {
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (opts.humanDecision) {
      params.push(opts.humanDecision);
      conditions.push(`human_decision = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM customer_fit_checks ${where}`,
      params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    params.push(opts.limit, opts.offset);
    const { rows } = await this.pool.query<HeaderRow>(
      `SELECT id, customer_name, sales_rep_email, checked_on::text AS checked_on, decision_maker_context,
              engagement_context, source_context, overall_facts, overall_unknowns, overall_hypotheses, next_actions,
              human_decision, decision_reason, created_at, updated_at
       FROM customer_fit_checks
       ${where}
       ORDER BY checked_on DESC, created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { items: rows.map(mapListRow), total };
  }

  async findById(id: string): Promise<CustomerFitCheckDetail | null> {
    const { rows } = await this.pool.query<HeaderRow>(
      `SELECT id, customer_name, sales_rep_email, checked_on::text AS checked_on, decision_maker_context,
              engagement_context, source_context, overall_facts, overall_unknowns, overall_hypotheses, next_actions,
              human_decision, decision_reason, created_at, updated_at
       FROM customer_fit_checks WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;

    const { rows: itemRows } = await this.pool.query<ItemRow>(
      `SELECT item_no, answer, fact_note, unknown_note, hypothesis_note
       FROM customer_fit_check_items WHERE check_id = $1 ORDER BY item_no`,
      [id],
    );

    return {
      ...mapListRow(row),
      decisionMakerContext: row.decision_maker_context,
      engagementContext: row.engagement_context,
      sourceContext: row.source_context,
      overallFacts: row.overall_facts,
      overallUnknowns: row.overall_unknowns,
      overallHypotheses: row.overall_hypotheses,
      nextActions: row.next_actions,
      decisionReason: row.decision_reason,
      items: itemRows.map((r) => ({
        itemNo: r.item_no,
        answer: r.answer,
        factNote: r.fact_note,
        unknownNote: r.unknown_note,
        hypothesisNote: r.hypothesis_note,
      })),
    };
  }
}

async function insertItems(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  checkId: string,
  items: CustomerFitCheckInput['items'],
): Promise<void> {
  for (const item of items) {
    await client.query(
      `INSERT INTO customer_fit_check_items (check_id, item_no, answer, fact_note, unknown_note, hypothesis_note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [checkId, item.itemNo, item.answer, item.factNote ?? null, item.unknownNote ?? null, item.hypothesisNote ?? null],
    );
  }
}

function mapListRow(row: HeaderRow): CustomerFitCheckListItem {
  return {
    id: row.id,
    customerName: row.customer_name,
    salesRepEmail: row.sales_rep_email,
    checkedOn: row.checked_on,
    humanDecision: row.human_decision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
