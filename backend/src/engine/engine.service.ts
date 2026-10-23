import { Injectable, Logger } from '@nestjs/common';
import type { ActionRequest, Decision, DecisionVerdict, PolicyRule } from '@veto/contracts';
import { PolicyLoaderService } from './loader/policy-loader.service';
import { ruleApplies } from './evaluators/rule-evaluator';
import { checkQuota } from '../db/evaluators/quota-evaluator';
import { DatabaseService } from '../db/database.service';

/**
 * Sentinel ordering for the one-way ratchet invariant.
 * A later layer can only keep or tighten the decision — never loosen it.
 *
 * allow (0) < needs_approval (1) < block (2)
 */
const VERDICT_SEVERITY: Record<DecisionVerdict, number> = {
  allow: 0,
  needs_approval: 1,
  block: 2,
};

function tighten(current: DecisionVerdict, candidate: DecisionVerdict): DecisionVerdict {
  return VERDICT_SEVERITY[candidate] > VERDICT_SEVERITY[current] ? candidate : current;
}

@Injectable()
export class PolicyEngineService {
  private readonly logger = new Logger(PolicyEngineService.name);

  constructor(
    private readonly policyLoader: PolicyLoaderService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Core evaluation entrypoint.
   *
   * Evaluation order (strict — a later layer can only tighten):
   *   1. `when:` expression check  →  rule-evaluator
   *   2. `quota:` sliding-window   →  quota-evaluator (SQLite)   [gate: only fires on exceeded]
   *   3. `action:` directive       →  allow | block | require_approval | judge
   *
   * Returns a fully populated Decision ready for the firewall to persist and emit.
   */
  evaluate(request: ActionRequest): Decision {
    const policy = this.policyLoader.getConfig();
    const rules = this.policyLoader.getRulesForAction(request.agentId, request.tool);

    this.logger.debug(
      `Evaluating ${request.agentId}/${request.tool} — ${rules.length} candidate rule(s)`,
    );

    let verdict: DecisionVerdict = 'allow';
    let reason = 'No matching policy rule — action permitted by default.';
    let matchedRule: string | undefined;
    let layer: Decision['layer'] = 'rule';

    for (const rule of rules) {
      // ── Layer 1: when: expression ─────────────────────────────────────────
      let conditionMet: boolean;
      try {
        conditionMet = ruleApplies(rule, request, policy);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Rule "${rule.name}" when: eval error — ${msg}`);
        // Fail-closed: treat unrecognised expressions as matching
        conditionMet = true;
      }

      if (!conditionMet) continue;

      // ── Layer 2: quota: sliding-window ────────────────────────────────────
      //
      // GATE semantics: quota is a condition, not an unconditional action.
      // The rule's action only fires when the quota IS exceeded.
      // When not exceeded, skip to the next rule (never fall through to Layer 3).
      if (rule.quota) {
        let quotaResult;
        try {
          quotaResult = checkQuota(
            this.db.connection,
            request.agentId,
            request,
            this.buildQuotaRule(rule, request.tool),
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Rule "${rule.name}" quota eval error — ${msg}`);
          // Fail-closed: treat quota errors as exceeded
          quotaResult = {
            exceeded: true,
            currentValue: 0,
            limit: 0,
            rule: this.buildQuotaRule(rule, request.tool),
          };
        }

        if (quotaResult.exceeded) {
          const candidate = this.policyActionToVerdict(rule.action);
          verdict = tighten(verdict, candidate);
          reason = `Quota exceeded for rule "${rule.name}": ${quotaResult.currentValue} / ${quotaResult.limit} within ${rule.quota.window}.`;
          matchedRule = rule.name;
          layer = 'quota';

          this.logger.log(`Quota hit — rule: "${rule.name}", verdict: ${verdict}`);

          // Quota block is final — no later rule can loosen it
          if (verdict === 'block') break;
        }

        // Quota rule always ends here — never fall through to Layer 3
        continue;
      }

      // ── Layer 3: action directive ─────────────────────────────────────────
      const actionVerdict = this.policyActionToVerdict(rule.action);
      verdict = tighten(verdict, actionVerdict);

      // Always record attribution for the firing rule
      reason = `Rule "${rule.name}" matched — ${rule.description ?? rule.action}.`;
      matchedRule = rule.name;
      layer = rule.action === 'judge' ? 'judge' : 'rule';

      this.logger.log(
        `Rule "${rule.name}" — action: ${rule.action}, verdict: ${verdict}`,
      );

      // A block is final — stop evaluating further rules
      if (verdict === 'block') break;

      // An explicit allow terminates immediately (first-match-wins)
      if (rule.action === 'allow') break;
    }

    const decision: Decision = {
      requestId: request.id,
      verdict,
      reason,
      layer,
      riskScore: this.computeRiskScore(verdict),
      matchedRule,
    };

    this.logger.log(
      `Final decision — agent: ${request.agentId}, tool: ${request.tool}, verdict: ${verdict}, layer: ${layer}`,
    );

    return decision;
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Maps a PolicyAction to a DecisionVerdict.
   * `judge` routes to the intent judge (currently stubs to needs_approval).
   */
  private policyActionToVerdict(action: PolicyRule['action']): DecisionVerdict {
    switch (action) {
      case 'allow':            return 'allow';
      case 'block':            return 'block';
      case 'require_approval': return 'needs_approval';
      case 'judge':            return 'needs_approval'; // TODO: replace with LLM judge call
    }
  }

  /**
   * Bridges a PolicyRule's quota block into the QuotaRule shape
   * expected by the existing quota-evaluator.
   *
   * Takes the actual request tool rather than tools[0] so that
   * wildcard rules (tools: ["*"]) and multi-tool rules count correctly.
   */
  private buildQuotaRule(rule: PolicyRule, requestTool: string) {
    const q = rule.quota!;
    return {
      id: rule.name,
      tool: requestTool,
      window: q.window,
      over: (rule.action === 'block' ? 'block' : 'require_approval') as 'block' | 'require_approval',
      count: q.count,
      sum: q.sum,
      max: q.max,
    };
  }

  /**
   * Simple risk score mapping for dashboard metrics.
   */
  private computeRiskScore(verdict: DecisionVerdict): number {
    switch (verdict) {
      case 'allow':          return 0.0;
      case 'needs_approval': return 0.5;
      case 'block':          return 1.0;
    }
  }
}
