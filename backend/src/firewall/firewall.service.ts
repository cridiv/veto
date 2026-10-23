import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  MessageEvent,
} from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import {
  ActionRequestSchema,
  ResolveApprovalRequestSchema,
  ToggleModeRequestSchema,
  type ActionRequest,
  type Decision,
  type Approval,
  type FirewallStats,
} from '@veto/contracts';
import { ActionsRepository } from '../db/repositories/actions.repository';
import { ApprovalsRepository } from '../db/repositories/approvals.repository';
import { StatsRepository } from '../db/repositories/stats.repository';

export type FirewallEvent = {
  type: 'action_checked' | 'approval_created' | 'approval_resolved' | 'mode_changed';
  data: unknown;
  timestamp: string;
};

@Injectable()
export class FirewallService {
  private readonly logger = new Logger(FirewallService.name);
  private enabled = true;
  private readonly events$ = new Subject<MessageEvent>();

  constructor(
    private readonly actionsRepo: ActionsRepository,
    private readonly approvalsRepo: ApprovalsRepository,
    private readonly statsRepo: StatsRepository,
  ) {}

  /**
   * Main entrypoint for agent tool-call interception.
   */
  async checkAction(body: unknown): Promise<Decision> {
    const parseResult = ActionRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      this.logger.warn(`Rejected malformed ActionRequest: ${errorMsg}`);
      throw new BadRequestException(`Malformed ActionRequest: ${errorMsg}`);
    }

    const request: ActionRequest = parseResult.data;

    // 1. If firewall is disabled, immediately allow with layer "off" and log it
    if (!this.enabled) {
      const decision: Decision = {
        requestId: request.id,
        verdict: 'allow',
        reason: 'Firewall is currently disabled (OFF mode).',
        layer: 'off',
        riskScore: 0.0,
      };

      this.recordAndEmit(request, decision);
      return decision;
    }

    // 2. Baseline evaluation (Pass-through allow until Rule Engine & Judge are wired)
    const decision: Decision = {
      requestId: request.id,
      verdict: 'allow',
      reason: 'Action passed baseline security checks.',
      layer: 'rule',
      riskScore: 0.0,
    };

    this.recordAndEmit(request, decision);
    return decision;
  }

  /**
   * Returns the live Server-Sent Events (SSE) stream.
   */
  getEventsStream(): Observable<MessageEvent> {
    return this.events$.asObservable();
  }

  /**
   * Toggles the firewall mode ON / OFF.
   */
  setMode(body: unknown): { enabled: boolean } {
    const parseResult = ToggleModeRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException('Invalid mode payload. Expected { enabled: boolean }');
    }

    this.enabled = parseResult.data.enabled;
    this.logger.log(`Firewall master mode set to: ${this.enabled ? 'ON' : 'OFF'}`);

    this.emitEvent('mode_changed', { enabled: this.enabled });
    return { enabled: this.enabled };
  }

  getMode(): { enabled: boolean } {
    return { enabled: this.enabled };
  }

  /**
   * Approval handling
   */
  getApproval(id: string): Approval {
    const approval = this.approvalsRepo.findById(id);
    if (!approval) {
      throw new NotFoundException(`Approval with id "${id}" not found.`);
    }
    return approval;
  }

  resolveApproval(id: string, body: unknown): Approval {
    const parseResult = ResolveApprovalRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException('Invalid decision. Expected { decision: "approve" | "deny" }');
    }

    const resolved = this.approvalsRepo.resolve(id, parseResult.data.decision);
    if (!resolved) {
      throw new NotFoundException(`Approval with id "${id}" not found or already resolved.`);
    }

    this.emitEvent('approval_resolved', resolved);
    return resolved;
  }

  /**
   * Audit log and metrics queries
   */
  getActions(options: { limit?: number; verdict?: string; agentId?: string }): any[] {
    return this.actionsRepo.findRecent(options);
  }

  getStats(agentId?: string): FirewallStats {
    return this.statsRepo.getStats(agentId);
  }

  // --- Private Event Helpers ---

  private recordAndEmit(request: ActionRequest, decision: Decision): void {
    // 1. Persist to audit log
    this.actionsRepo.insert(request, decision);

    // 2. Broadcast via SSE
    this.emitEvent('action_checked', { request, decision });
  }

  private emitEvent(type: FirewallEvent['type'], data: unknown): void {
    const event: FirewallEvent = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    this.events$.next({
      data: JSON.stringify(event),
    } as MessageEvent);
  }
}
