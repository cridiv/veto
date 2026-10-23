import { z } from 'zod';

export const ActionSourceSchema = z.enum(['agent', 'human']);

export const UntrustedContentSchema = z.object({
  source: z.string().min(1, 'source cannot be empty'),
  excerpt: z.string(),
});

export const ActionRequestSchema = z.object({
  id: z.string().min(1, 'id cannot be empty'),
  agentId: z.string().min(1, 'agentId cannot be empty'),
  sessionId: z.string().min(1, 'sessionId cannot be empty'),
  userGoal: z.string().min(1, 'userGoal cannot be empty'),
  tool: z.string().min(1, 'tool cannot be empty'),
  args: z.record(z.unknown()),
  source: ActionSourceSchema,
  untrusted: z.array(UntrustedContentSchema).optional(),
  timestamp: z.string().datetime({ message: 'timestamp must be an ISO 8601 string' }),
});

export const DecisionVerdictSchema = z.enum(['allow', 'block', 'needs_approval']);

export const DecisionLayerSchema = z.enum([
  'rule',
  'quota',
  'risk',
  'taint',
  'judge',
  'timeout',
  'off',
]);

export const JudgeResultSchema = z.object({
  aligned: z.boolean(),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
});

export const DecisionSchema = z.object({
  requestId: z.string().min(1),
  verdict: DecisionVerdictSchema,
  reason: z.string(),
  layer: DecisionLayerSchema,
  riskScore: z.number().min(0).max(1),
  matchedRule: z.string().optional(),
  approvalId: z.string().optional(),
  judge: JudgeResultSchema.optional(),
});

export const ApprovalStateSchema = z.enum(['pending', 'approved', 'denied']);

export const ApprovalSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  agentId: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.unknown()),
  userGoal: z.string(),
  reason: z.string(),
  state: ApprovalStateSchema,
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});

// --- DECLARATIVE POLICY VALIDATION (Auvis-inspired) ---

export const PolicyActionSchema = z.enum(['allow', 'block', 'require_approval', 'judge']);

export const PolicyMatchSchema = z.object({
  agents: z.array(z.string().min(1)).optional().default(['*']),
  tools: z.array(z.string().min(1)).min(1, "match.tools must contain at least one tool name or '*'"),
});

// Matches window durations like 10s, 5m, 1h, 24h, 7d
const WindowRegex = /^\d+[smhd]$/;

export const PolicyQuotaSchema = z
  .object({
    window: z.string().regex(WindowRegex, 'window must be formatted like 10s, 5m, 1h, 24h'),
    count: z.number().int().positive().optional(),
    sum: z.string().min(1).optional(),
    max: z.number().positive().optional(),
  })
  .refine(
    (data) => {
      const hasCount = data.count !== undefined;
      const hasSum = data.sum !== undefined && data.max !== undefined;
      return hasCount || hasSum;
    },
    {
      message: "quota must configure either 'count' (frequency) or both 'sum' and 'max' (accumulation)",
    },
  );

export const PolicyRuleSchema = z.object({
  name: z.string().min(1, 'name cannot be empty'),
  description: z.string().optional(),
  match: PolicyMatchSchema,
  when: z.string().optional(),
  quota: PolicyQuotaSchema.optional(),
  action: PolicyActionSchema,
});

export const PolicyConfigSchema = z.object({
  context: z
    .object({
      known_recipients: z.array(z.string()).optional(),
    })
    .catchall(z.unknown())
    .optional(),
  policies: z.array(PolicyRuleSchema),
});

// Database quota compatibility helper
export const QuotaActionSchema = z.enum(['block', 'require_approval']);
export const QuotaRuleSchema = z
  .object({
    id: z.string().min(1),
    tool: z.string().min(1),
    window: z.string().regex(WindowRegex, 'window must be formatted like 10s, 5m, 1h, 24h'),
    over: QuotaActionSchema,
    count: z.number().int().positive().optional(),
    sum: z.string().min(1).optional(),
    max: z.number().positive().optional(),
  })
  .refine(
    (data) => {
      const hasCount = data.count !== undefined;
      const hasSum = data.sum !== undefined && data.max !== undefined;
      return hasCount || hasSum;
    },
    {
      message: "QuotaRule must configure either 'count' or both 'sum' and 'max'",
    },
  );

export const ResolveApprovalRequestSchema = z.object({
  decision: z.enum(['approve', 'deny']),
});

export const ToggleModeRequestSchema = z.object({
  enabled: z.boolean(),
});
