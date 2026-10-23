import type { PolicyRule, PolicyConfig, ActionRequest } from '@veto/contracts';

/**
 * Resolves a dotted path (e.g. "args.amount", "context.known_recipients")
 * from the evaluation context object. Returns undefined if any segment is missing.
 */
function resolvePath(
  path: string,
  ctx: { args: Record<string, unknown>; context: Record<string, unknown> },
): unknown {
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = ctx;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Coerces a resolved value to a number. Returns NaN if not possible.
 */
function toNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val);
  return NaN;
}

/**
 * Evaluates a single `when:` expression string against the action context.
 *
 * Supported operators (all case-sensitive, space-delimited):
 *  - `args.x > 100`              numeric comparison (>, <, >=, <=, ==, !=)
 *  - `args.to in context.list`   array membership
 *  - `args.to not in context.list`
 *  - `args.path startswith "/workspace/"`
 *  - `not args.path startswith "/workspace/"`
 *
 * Returns true if the condition holds (i.e. the rule should apply).
 * Throws if the expression is malformed or the operator is unrecognised.
 */
export function evaluateWhen(
  expression: string,
  request: ActionRequest,
  policy: PolicyConfig,
): boolean {
  const ctx = {
    args: request.args,
    context: policy.context ?? {},
  };

  const expr = expression.trim();

  // ── "not <lhs> startswith <rhs>" ─────────────────────────────────────────
  const notStartswithMatch = expr.match(
    /^not\s+([a-zA-Z0-9_.]+)\s+startswith\s+"([^"]*)"$/,
  );
  if (notStartswithMatch) {
    const lhs = resolvePath(notStartswithMatch[1], ctx);
    const rhs = notStartswithMatch[2];
    if (typeof lhs !== 'string') return true; // non-string can't start with anything
    return !lhs.startsWith(rhs);
  }

  // ── "<lhs> startswith <rhs>" ─────────────────────────────────────────────
  const startswithMatch = expr.match(
    /^([a-zA-Z0-9_.]+)\s+startswith\s+"([^"]*)"$/,
  );
  if (startswithMatch) {
    const lhs = resolvePath(startswithMatch[1], ctx);
    const rhs = startswithMatch[2];
    if (typeof lhs !== 'string') return false;
    return lhs.startsWith(rhs);
  }

  // ── "<lhs> not in <rhs>" ─────────────────────────────────────────────────
  const notInMatch = expr.match(/^([a-zA-Z0-9_.]+)\s+not\s+in\s+([a-zA-Z0-9_.]+)$/);
  if (notInMatch) {
    const lhs = resolvePath(notInMatch[1], ctx);
    const rhs = resolvePath(notInMatch[2], ctx);
    if (!Array.isArray(rhs)) return true; // no list → treat as not-in
    return !rhs.includes(lhs);
  }

  // ── "<lhs> in <rhs>" ─────────────────────────────────────────────────────
  const inMatch = expr.match(/^([a-zA-Z0-9_.]+)\s+in\s+([a-zA-Z0-9_.]+)$/);
  if (inMatch) {
    const lhs = resolvePath(inMatch[1], ctx);
    const rhs = resolvePath(inMatch[2], ctx);
    if (!Array.isArray(rhs)) return false;
    return rhs.includes(lhs);
  }

  // ── Numeric comparisons: >, <, >=, <=, ==, != ────────────────────────────
  const numericMatch = expr.match(
    /^([a-zA-Z0-9_.]+)\s*(>=|<=|!=|==|>|<)\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (numericMatch) {
    const lhs = toNum(resolvePath(numericMatch[1], ctx));
    const op = numericMatch[2];
    const rhs = parseFloat(numericMatch[3]);

    switch (op) {
      case '>':  return lhs > rhs;
      case '<':  return lhs < rhs;
      case '>=': return lhs >= rhs;
      case '<=': return lhs <= rhs;
      case '==': return lhs === rhs;
      case '!=': return lhs !== rhs;
    }
  }

  throw new Error(`Unsupported when: expression — "${expr}"`);
}

/**
 * Returns true if the rule's `when:` condition applies to this request,
 * or if the rule has no `when:` (unconditional match).
 */
export function ruleApplies(
  rule: PolicyRule,
  request: ActionRequest,
  policy: PolicyConfig,
): boolean {
  if (!rule.when) return true;
  return evaluateWhen(rule.when, request, policy);
}
