import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { FirewallStats, DecisionLayer } from '@veto/contracts';

@Injectable()
export class StatsRepository {
  constructor(private readonly dbService: DatabaseService) {}

  private get db() {
    return this.dbService.connection;
  }

  getStats(agentId?: string): FirewallStats {
    const where = agentId ? 'WHERE agent_id = ?' : '';
    const params = agentId ? [agentId] : [];

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) as total FROM actions ${where}`)
      .get(...params) as { total: number };

    const verdictRows = this.db
      .prepare(`SELECT verdict, COUNT(*) as count FROM actions ${where} GROUP BY verdict`)
      .all(...params) as { verdict: string; count: number }[];

    const layerRows = this.db
      .prepare(`SELECT layer, COUNT(*) as count FROM actions ${where} GROUP BY layer`)
      .all(...params) as { layer: string; count: number }[];

    const agentRows = this.db
      .prepare('SELECT agent_id, COUNT(*) as count FROM actions GROUP BY agent_id')
      .all() as { agent_id: string; count: number }[];

    const verdictMap = Object.fromEntries(verdictRows.map((r) => [r.verdict, r.count]));
    const layerMap = Object.fromEntries(layerRows.map((r) => [r.layer, r.count]));
    const agentMap = Object.fromEntries(agentRows.map((r) => [r.agent_id, r.count]));

    const layers: DecisionLayer[] = [
      'rule',
      'quota',
      'risk',
      'taint',
      'judge',
      'timeout',
      'off',
    ];

    const byLayer: Record<DecisionLayer, number> = {} as any;
    for (const l of layers) {
      byLayer[l] = layerMap[l] ?? 0;
    }

    return {
      total: totalRow.total,
      allowed: verdictMap['allow'] ?? 0,
      blocked: verdictMap['block'] ?? 0,
      escalated: verdictMap['needs_approval'] ?? 0,
      byLayer,
      byAgent: agentMap,
    };
  }
}
