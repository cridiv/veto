import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { Approval, ApprovalState } from '@veto/contracts';
import { randomUUID } from 'crypto';

type CreateApprovalPayload = {
  id?: string;
  requestId: string;
  agentId: string;
  tool: string;
  args: Record<string, unknown>;
  userGoal: string;
  reason: string;
};


@Injectable()
export class ApprovalsRepository {
  constructor(private readonly dbService: DatabaseService) {}

  private get db() {
    return this.dbService.connection;
  }

  create(payload: CreateApprovalPayload): Approval {
    const approval: Approval = {
      id: payload.id ?? randomUUID(),
      requestId: payload.requestId,
      agentId: payload.agentId,
      tool: payload.tool,
      args: payload.args,
      userGoal: payload.userGoal,
      reason: payload.reason,
      state: 'pending',
      createdAt: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO approvals (
        id, request_id, agent_id, tool, args, user_goal, reason, state, created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      approval.id,
      approval.requestId,
      approval.agentId,
      approval.tool,
      JSON.stringify(approval.args),
      approval.userGoal,
      approval.reason,
      approval.state,
      approval.createdAt,
      approval.resolvedAt ?? null,
    );

    return approval;
  }

  findById(id: string): Approval | null {
    const stmt = this.db.prepare('SELECT * FROM approvals WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  findByRequestId(requestId: string): Approval | null {
    const stmt = this.db.prepare('SELECT * FROM approvals WHERE request_id = ?');
    const row = stmt.get(requestId) as any;
    return row ? this.mapRow(row) : null;
  }

  findPending(): Approval[] {
    const stmt = this.db.prepare(
      "SELECT * FROM approvals WHERE state = 'pending' ORDER BY created_at DESC",
    );
    const rows = stmt.all() as any[];
    return rows.map((r) => this.mapRow(r));
  }

  resolve(id: string, decision: 'approve' | 'deny'): Approval | null {
    const state: ApprovalState = decision === 'approve' ? 'approved' : 'denied';
    const resolvedAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE approvals
      SET state = ?, resolved_at = ?
      WHERE id = ? AND state = 'pending'
    `);

    const info = stmt.run(state, resolvedAt, id);
    if (info.changes === 0) {
      return null; // Already resolved or does not exist
    }

    return this.findById(id);
  }

  private mapRow(row: any): Approval {
    return {
      id: row.id,
      requestId: row.request_id,
      agentId: row.agent_id,
      tool: row.tool,
      args: JSON.parse(row.args),
      userGoal: row.user_goal,
      reason: row.reason,
      state: row.state,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at ?? undefined,
    };
  }
}
