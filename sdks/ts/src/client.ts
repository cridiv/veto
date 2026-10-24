import * as crypto from 'crypto';
import {
  type ActionRequest,
  type ActionSource,
  type Decision,
  type Approval,
  type FirewallStats,
  type UntrustedContent,
  DecisionSchema,
  ApprovalSchema,
} from '@veto/contracts';
import {
  VetoError,
  VetoBlockError,
  VetoNeedsApprovalError,
  VetoApprovalDeniedError,
  VetoApprovalTimeoutError,
  VetoConnectionError,
} from './errors';

export interface VetoOptions {
  /**
   * The base URL of the Veto Firewall service (e.g. "http://localhost:3000").
   * Defaults to process.env.VETO_URL or "http://localhost:3000".
   */
  baseUrl?: string;

  /**
   * The agent identifier matching the agent defined in veto-policy.yaml.
   */
  agentId?: string;

  /**
   * Optional session identifier for tracking multi-turn conversations.
   * Defaults to "default-session".
   */
  sessionId?: string;

  /**
   * HTTP request timeout in milliseconds. Defaults to 10000ms.
   */
  timeoutMs?: number;

  /**
   * Timeout when waiting for human approval tickets. Defaults to 30000ms.
   */
  approvalTimeoutMs?: number;

  /**
   * Polling interval when waiting for human approval. Defaults to 1000ms.
   */
  approvalPollIntervalMs?: number;

  /**
   * Optional custom headers to send with HTTP requests.
   */
  headers?: Record<string, string>;
}

export interface EnforceInput {
  /**
   * Tool name being invoked by the agent.
   */
  tool: string;

  /**
   * Arguments passed to the tool.
   */
  args?: Record<string, unknown>;

  /**
   * The user's original goal or prompt.
   */
  userGoal?: string;

  /**
   * Any untrusted content the agent recently ingested (emails, web pages, messages).
   */
  untrusted?: UntrustedContent[];

  /**
   * Optional override for agentId.
   */
  agentId?: string;

  /**
   * Optional override for sessionId.
   */
  sessionId?: string;

  /**
   * Source of the action (defaults to "agent").
   */
  source?: ActionSource;
}

export class Veto {
  private readonly baseUrl: string;
  private readonly defaultAgentId?: string;
  private readonly defaultSessionId: string;
  private readonly timeoutMs: number;
  private readonly approvalTimeoutMs: number;
  private readonly approvalPollIntervalMs: number;
  private readonly headers: Record<string, string>;

  constructor(options: VetoOptions = {}) {
    const rawUrl =
      options.baseUrl ??
      (typeof process !== 'undefined' ? process.env?.VETO_URL : undefined) ??
      'http://localhost:3000';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.defaultAgentId = options.agentId;
    this.defaultSessionId = options.sessionId ?? 'default-session';
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.approvalTimeoutMs = options.approvalTimeoutMs ?? 30000;
    this.approvalPollIntervalMs = options.approvalPollIntervalMs ?? 1000;
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }

  /**
   * Internal HTTP helper with timeout and error handling.
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.headers,
          ...options.headers,
        },
      });

      clearTimeout(timer);

      if (!response.ok) {
        let errorDetails = '';
        try {
          const body = await response.json();
          errorDetails = JSON.stringify(body);
        } catch {
          errorDetails = await response.text();
        }
        throw new VetoConnectionError(
          `Veto Firewall returned HTTP ${response.status} ${response.statusText}: ${errorDetails}`,
          response.status,
        );
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof VetoError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new VetoConnectionError(
          `Veto Firewall request to ${path} timed out after ${this.timeoutMs}ms`,
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new VetoConnectionError(
        `Failed to connect to Veto Firewall at ${url}: ${msg}`,
        undefined,
        err,
      );
    }
  }

  /**
   * Enforces veto-policy.yaml on an agent action.
   * - If allowed by policy: returns the Decision.
   * - If requires human approval: automatically pauses and polls until approved (or throws if denied).
   * - If blocked by policy: throws VetoBlockError.
   */
  public async enforce(input: EnforceInput): Promise<Decision> {
    const agentId = input.agentId ?? this.defaultAgentId;
    if (!agentId) {
      throw new VetoError(
        'agentId is required either in Veto options or in enforce(input)',
      );
    }

    const payload: ActionRequest = {
      id: crypto.randomUUID(),
      agentId,
      sessionId: input.sessionId ?? this.defaultSessionId,
      userGoal: input.userGoal ?? `Execute tool ${input.tool}`,
      tool: input.tool,
      args: input.args ?? {},
      untrusted: input.untrusted,
      source: input.source ?? 'agent',
      timestamp: new Date().toISOString(),
    };

    const decision = await this.check(payload);

    // Explicit Fail-Closed Matching: ONLY explicit 'allow' permits tool execution!
    switch (decision.verdict) {
      case 'allow':
        return decision;

      case 'block':
        throw new VetoBlockError(decision);

      case 'needs_approval': {
        if (!decision.approvalId) {
          throw new VetoError('Firewall required approval but returned no approvalId');
        }

        const approval = await this.waitForApproval(decision.approvalId);
        if (approval.state !== 'approved') {
          throw new VetoApprovalDeniedError(approval);
        }

        return decision;
      }

      default:
        throw new VetoError(
          `Security Violation: Unrecognized firewall verdict "${(decision as any)?.verdict}". Failing closed.`,
        );
    }
  }

  /**
   * Universal Agent Tool Wrapper.
   * Wraps an entire dictionary of tool functions in one single call.
   * Every tool call made by the agent automatically routes through veto-policy.yaml.
   */
  public wrap<TTools extends Record<string, (args: any) => any>>(tools: TTools): TTools {
    const wrapped: Record<string, (args: any) => any> = {};

    for (const [toolName, toolFn] of Object.entries(tools)) {
      wrapped[toolName] = async (args: any) => {
        // Automatically enforce policy before tool execution
        await this.enforce({
          tool: toolName,
          args: typeof args === 'object' && args !== null ? args : { value: args },
        });

        // Policy permitted the action: execute the underlying tool
        return await toolFn(args);
      };
    }

    return wrapped as TTools;
  }

  /**
   * Retrieves the current state of an approval ticket.
   */
  public async getApproval(approvalId: string): Promise<Approval> {
    const raw = await this.request<unknown>(`/v1/approvals/${approvalId}`);
    const parsed = ApprovalSchema.safeParse(raw);
    if (!parsed.success) {
      throw new VetoError(
        `Invalid approval schema received from Veto Firewall: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  /**
   * Resolves an approval ticket with "approve" or "deny".
   */
  public async resolveApproval(
    approvalId: string,
    decision: 'approve' | 'deny' | { decision: 'approve' | 'deny' },
  ): Promise<Approval> {
    const body = typeof decision === 'string' ? { decision } : decision;
    return this.request<Approval>(`/v1/approvals/${approvalId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Polls the approval ticket until it transitions to approved, denied, or times out.
   */
  public async waitForApproval(
    approvalId: string,
    options?: { timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<Approval> {
    const timeoutMs = options?.timeoutMs ?? this.approvalTimeoutMs;
    const pollIntervalMs = options?.pollIntervalMs ?? this.approvalPollIntervalMs;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const approval = await this.getApproval(approvalId);
      if (approval.state === 'approved') {
        return approval;
      }
      if (approval.state === 'denied') {
        throw new VetoApprovalDeniedError(approval);
      }
      if (approval.state !== 'pending') {
        throw new VetoError(
          `Security Violation: Unrecognized approval state "${approval.state}". Failing closed.`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new VetoApprovalTimeoutError(approvalId, timeoutMs);
  }

  /**
   * Raw low-level check endpoint returning the Decision without throwing or waiting.
   * Validates the response against DecisionSchema at runtime.
   */
  public async check(request: ActionRequest): Promise<Decision> {
    const raw = await this.request<unknown>('/v1/check', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    const parsed = DecisionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new VetoError(
        `Invalid decision schema received from Veto Firewall: ${parsed.error.message}`,
      );
    }

    return parsed.data;
  }

  /**
   * Retrieves the master mode of the firewall.
   */
  public async getMode(): Promise<{ enabled: boolean }> {
    return this.request<{ enabled: boolean }>('/v1/mode');
  }

  /**
   * Toggles the master mode of the firewall.
   */
  public async setMode(enabled: boolean): Promise<{ enabled: boolean }> {
    return this.request<{ enabled: boolean }>('/v1/mode', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  /**
   * Retrieves aggregated audit metrics and firewall statistics.
   */
  public async getStats(): Promise<FirewallStats> {
    return this.request<FirewallStats>('/v1/stats');
  }

  /**
   * Retrieves recent audit log actions.
   */
  public async getActions(limit = 50): Promise<ActionRequest[]> {
    return this.request<ActionRequest[]>(`/v1/actions?limit=${limit}`);
  }
}

// Alias for convenience
export const VetoClient = Veto;
export type VetoClientOptions = VetoOptions;
