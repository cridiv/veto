export type ActionSource = "agent" | "human";

export type UntrustedContent = {
  source: string;
  excerpt: string;
};

export type ActionRequest = {
  id: string;
  agentId: string;
  sessionId: string;
  userGoal: string;
  tool: string;
  args: Record<string, unknown>;
  source: ActionSource;
  untrusted?: UntrustedContent[];
  timestamp: string;
};

export type DecisionVerdict = "allow" | "block" | "needs_approval";

export type DecisionLayer =
  | "rule"
  | "quota"
  | "risk"
  | "taint"
  | "judge"
  | "timeout"
  | "off";

export type JudgeResult = {
  aligned: boolean;
  confidence: number;
  explanation: string;
};

export type Decision = {
  requestId: string;
  verdict: DecisionVerdict;
  reason: string;
  layer: DecisionLayer;
  riskScore: number;
  matchedRule?: string;
  approvalId?: string;
  judge?: JudgeResult;
};

export type ApprovalState = "pending" | "approved" | "denied";

export type Approval = {
  id: string;
  requestId: string;
  agentId: string;
  tool: string;
  args: Record<string, unknown>;
  userGoal: string;
  reason: string;
  state: ApprovalState;
  createdAt: string;
  resolvedAt?: string;
};

export type QuotaAction = "block" | "require_approval";

export type QuotaRule = {
  id: string;
  tool: string;
  window: string; // e.g. "10s", "5m", "1h", "24h"
  over: QuotaAction;
  count?: number; // frequency limit (call count in window)
  sum?: string;   // numerical argument property path (e.g. "args.amount", "args.bytes")
  max?: number;   // cumulative threshold when using sum
};

export type PolicyRuleAction = "allow" | "block" | "require_approval";

export type PolicyRule = {
  id: string;
  tool: string | string[];
  when?: string;
  action: PolicyRuleAction;
};

export type AgentPolicy = {
  context?: {
    company_domain?: string;
    known_recipients?: string[];
    [key: string]: unknown;
  };
  default?: "judge" | "allow" | "block";
  quotas?: QuotaRule[];
  rules?: PolicyRule[];
};

export type PolicyConfig = {
  agents: Record<string, AgentPolicy>;
};

export type ResolveApprovalRequest = {
  decision: "approve" | "deny";
};

export type ToggleModeRequest = {
  enabled: boolean;
};

export type FirewallStats = {
  total: number;
  allowed: number;
  blocked: number;
  escalated: number;
  byLayer: Record<DecisionLayer, number>;
  byAgent: Record<string, number>;
};
