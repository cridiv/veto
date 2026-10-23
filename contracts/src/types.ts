export type ActionSource = 'agent' | 'human';

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

export type DecisionVerdict = 'allow' | 'block' | 'needs_approval';

export type DecisionLayer =
  | 'rule'
  | 'quota'
  | 'risk'
  | 'taint'
  | 'judge'
  | 'timeout'
  | 'off';

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

export type ApprovalState = 'pending' | 'approved' | 'denied';

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

// --- DECLARATIVE POLICY SCHEMA ---

export type PolicyAction = 'allow' | 'block' | 'require_approval' | 'judge';

export type PolicyMatch = {
  agents?: string[]; // Defaults to ["*"] if omitted
  tools: string[];   // e.g. ["transfer_money"] or ["read_inbox", "read_file"]
};

export type PolicyQuota = {
  window: string;    // e.g. "1h", "10m", "24h"
  count?: number;    // Frequency limit (call count in window)
  sum?: string;      // Argument property path (e.g. "args.amount")
  max?: number;      // Cumulative ceiling for sum
};

export type PolicyRule = {
  name: string;
  description?: string;
  match: PolicyMatch;
  when?: string;     // Boolean expression e.g. "args.amount > 100000"
  quota?: PolicyQuota;
  action: PolicyAction;
};

export type PolicyConfig = {
  context?: {
    known_recipients?: string[];
    [key: string]: unknown;
  };
  policies: PolicyRule[];
};

// Database quota compatibility helper
export type QuotaAction = 'block' | 'require_approval';
export type QuotaRule = {
  id: string;
  tool: string;
  window: string;
  over: QuotaAction;
  count?: number;
  sum?: string;
  max?: number;
};

export type ResolveApprovalRequest = {
  decision: 'approve' | 'deny';
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
