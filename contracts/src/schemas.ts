import { z } from "zod";

export const ActionSourceSchema = z.enum(["agent", "human"]);

export const UntrustedContentSchema = z.object({
  source: z.string().min(1, "source cannot be empty"),
  excerpt: z.string(),
});

export const ActionRequestSchema = z.object({
  id: z.string().min(1, "id cannot be empty"),
  agentId: z.string().min(1, "agentId cannot be empty"),
  sessionId: z.string().min(1, "sessionId cannot be empty"),
  userGoal: z.string().min(1, "userGoal cannot be empty"),
  tool: z.string().min(1, "tool cannot be empty"),
  args: z.record(z.unknown()),
  source: ActionSourceSchema,
  untrusted: z.array(UntrustedContentSchema).optional(),
  timestamp: z.string().datetime({ message: "timestamp must be an ISO 8601 string" }),
});

export const DecisionVerdictSchema = z.enum(["allow", "block", "needs_approval"]);

export const DecisionLayerSchema = z.enum([
  "rule",
  "quota",
  "risk",
  "taint",
  "judge",
  "timeout",
  "off",
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

export const ApprovalStateSchema = z.enum(["pending", "approved", "denied"]);

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

export const QuotaActionSchema = z.enum(["block", "require_approval"]);

// Matches windows like 10s, 5m, 1h, 24h, 7d
const WindowRegex = /^\d+[smhd]$/;

export const QuotaRuleSchema = z
  .object({
    id: z.string().min(1),
    tool: z.string().min(1),
    window: z.string().regex(WindowRegex, "window must be formatted like 10s, 5m, 1h, 24h"),
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
      message:
        "QuotaRule must configure either 'count' (call frequency) or both 'sum' and 'max' (numerical field accumulation)",
    }
  );

export const PolicyRuleActionSchema = z.enum(["allow", "block", "require_approval"]);

export const PolicyRuleSchema = z.object({
  id: z.string().min(1),
  tool: z.union([z.string().min(1), z.array(z.string().min(1))]),
  when: z.string().optional(),
  action: PolicyRuleActionSchema,
});

export const AgentPolicySchema = z.object({
  context: z
    .object({
      company_domain: z.string().optional(),
      known_recipients: z.array(z.string()).optional(),
    })
    .catchall(z.unknown())
    .optional(),
  default: z.enum(["judge", "allow", "block"]).optional().default("judge"),
  quotas: z.array(QuotaRuleSchema).optional(),
  rules: z.array(PolicyRuleSchema).optional(),
});

export const PolicyConfigSchema = z.object({
  agents: z.record(AgentPolicySchema),
});

export const ResolveApprovalRequestSchema = z.object({
  decision: z.enum(["approve", "deny"]),
});

export const ToggleModeRequestSchema = z.object({
  enabled: z.boolean(),
});
