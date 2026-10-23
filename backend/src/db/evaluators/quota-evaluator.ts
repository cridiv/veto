import type { Database } from 'better-sqlite3';
import type { QuotaRule, ActionRequest } from '@veto/contracts';

export type QuotaCheckResult = {
  exceeded: boolean;
  currentValue: number;
  limit: number;
  rule: QuotaRule;
};

/**
 * Parses a window duration string (e.g. "10s", "5m", "1h", "24h", "7d") into milliseconds.
 */
export function parseWindowMs(window: string): number {
  const match = window.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid window duration format: ${window}`);
  }

  const val = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return val * 1000;
    case 'm':
      return val * 60 * 1000;
    case 'h':
      return val * 60 * 60 * 1000;
    case 'd':
      return val * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unsupported window unit: ${unit}`);
  }
}

/**
 * Evaluates a single QuotaRule dynamically against past allowed actions in SQLite.
 * Supports both frequency count ("count") and field accumulation ("sum" + "max").
 */
export function checkQuota(
  db: Database,
  agentId: string,
  request: ActionRequest,
  rule: QuotaRule
): QuotaCheckResult {
  const windowStart = new Date(Date.now() - parseWindowMs(rule.window)).toISOString();

  // Mode 1: Frequency / Call Count (e.g. max 5 deletions per hour)
  if (rule.count !== undefined) {
    const stmt = db.prepare(`
      SELECT COUNT(*) AS total
      FROM actions
      WHERE agent_id = ?
        AND tool = ?
        AND verdict = 'allow'
        AND created_at >= ?
    `);

    const row = stmt.get(agentId, rule.tool, windowStart) as { total: number };
    const nextCount = (row?.total ?? 0) + 1;

    return {
      exceeded: nextCount > rule.count,
      currentValue: nextCount,
      limit: rule.count,
      rule,
    };
  }

  // Mode 2: Field Accumulation (e.g. max ₦300k, or max 10MB data exported)
  if (rule.sum && rule.max !== undefined) {
    // Sanitize path and convert "args.amount" or "amount" -> "$.amount"
    const cleanedPath = rule.sum.replace(/^args\./, "");
    if (!/^[a-zA-Z0-9_.]+$/.test(cleanedPath)) {
      throw new Error(`Invalid property path for quota sum: ${rule.sum}`);
    }

    const jsonPath = `$.${cleanedPath}`;

    const stmt = db.prepare(`
      SELECT COALESCE(SUM(CAST(json_extract(args, ?) AS REAL)), 0) AS total
      FROM actions
      WHERE agent_id = ?
        AND tool = ?
        AND verdict = 'allow'
        AND created_at >= ?
    `);

    const row = stmt.get(jsonPath, agentId, rule.tool, windowStart) as { total: number };

    // Extract incoming request value
    const incomingVal = Number(request.args[cleanedPath] ?? 0);
    const nextSum = (row?.total ?? 0) + incomingVal;

    return {
      exceeded: nextSum > rule.max,
      currentValue: nextSum,
      limit: rule.max,
      rule,
    };
  }

  return {
    exceeded: false,
    currentValue: 0,
    limit: 0,
    rule,
  };
}
