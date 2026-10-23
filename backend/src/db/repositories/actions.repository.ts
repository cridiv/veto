import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { ActionRequest, Decision } from '@veto/contracts';

export type ActionFilterOptions = {
  limit?: number;
  verdict?: string;
  agentId?: string;
};

@Injectable()
export class ActionsRepository {
  constructor(private readonly dbService: DatabaseService) {}

  private get db() {
    return this.dbService.connection;
  }

  insert(request: ActionRequest, decision: Decision): void {
    // NOTE: created_at is set by the server, NOT taken from request.timestamp.
    // Using client-provided timestamps would allow agents to backdate calls
    // and evade quota sliding-window checks.
    const serverNow = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO actions (
        id, agent_id, session_id, user_goal, tool, args, source, untrusted,
        verdict, layer, risk_score, reason, matched_rule, approval_id,
        judge_aligned, judge_confidence, judge_explanation, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      request.id,
      request.agentId,
      request.sessionId,
      request.userGoal,
      request.tool,
      JSON.stringify(request.args),
      request.source,
      request.untrusted ? JSON.stringify(request.untrusted) : null,
      decision.verdict,
      decision.layer,
      decision.riskScore,
      decision.reason,
      decision.matchedRule ?? null,
      decision.approvalId ?? null,
      decision.judge ? (decision.judge.aligned ? 1 : 0) : null,
      decision.judge?.confidence ?? null,
      decision.judge?.explanation ?? null,
      serverNow,
    );
  }


  findById(id: string): any {
    const stmt = this.db.prepare('SELECT * FROM actions WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  findRecent(options: ActionFilterOptions = {}): any[] {
    const limit = options.limit ?? 50;
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.verdict) {
      conditions.push('verdict = ?');
      params.push(options.verdict);
    }
    if (options.agentId) {
      conditions.push('agent_id = ?');
      params.push(options.agentId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = this.db.prepare(`
      SELECT * FROM actions
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `);

    params.push(limit);
    const rows = stmt.all(...params) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: any) {
    return {
      id: row.id,
      agentId: row.agent_id,
      sessionId: row.session_id,
      userGoal: row.user_goal,
      tool: row.tool,
      args: JSON.parse(row.args),
      source: row.source,
      untrusted: row.untrusted ? JSON.parse(row.untrusted) : undefined,
      verdict: row.verdict,
      layer: row.layer,
      riskScore: row.risk_score,
      reason: row.reason,
      matchedRule: row.matched_rule ?? undefined,
      approvalId: row.approval_id ?? undefined,
      judge:
        row.judge_confidence !== null
          ? {
              aligned: row.judge_aligned === 1,
              confidence: row.judge_confidence,
              explanation: row.judge_explanation,
            }
          : undefined,
      createdAt: row.created_at,
    };
  }
}
