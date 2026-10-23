import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FirewallService } from './firewall.service';
import { ActionsRepository } from '../db/repositories/actions.repository';
import { ApprovalsRepository } from '../db/repositories/approvals.repository';
import { StatsRepository } from '../db/repositories/stats.repository';
import type { ActionRequest, Approval } from '@veto/contracts';

describe('FirewallService', () => {
  let service: FirewallService;
  let mockActionsRepo: Partial<ActionsRepository>;
  let mockApprovalsRepo: Partial<ApprovalsRepository>;
  let mockStatsRepo: Partial<StatsRepository>;

  const validActionRequest: ActionRequest = {
    id: 'req-test-1',
    agentId: 'acme-assistant',
    sessionId: 'session-123',
    userGoal: 'Summarize my inbox',
    tool: 'read_inbox',
    args: {},
    source: 'agent',
    timestamp: new Date().toISOString(),
  };

  beforeEach(async () => {
    mockActionsRepo = {
      insert: jest.fn(),
      findRecent: jest.fn().mockReturnValue([]),
    };
    mockApprovalsRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      resolve: jest.fn(),
    };
    mockStatsRepo = {
      getStats: jest.fn().mockReturnValue({
        total: 1,
        allowed: 1,
        blocked: 0,
        escalated: 0,
        byLayer: { rule: 1, quota: 0, risk: 0, taint: 0, judge: 0, timeout: 0, off: 0 },
        byAgent: { 'acme-assistant': 1 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirewallService,
        { provide: ActionsRepository, useValue: mockActionsRepo },
        { provide: ApprovalsRepository, useValue: mockApprovalsRepo },
        { provide: StatsRepository, useValue: mockStatsRepo },
      ],
    }).compile();

    service = module.get<FirewallService>(FirewallService);
  });

  it('rejects malformed ActionRequests with BadRequestException', async () => {
    await expect(service.checkAction({ bad: 'payload' })).rejects.toThrow(BadRequestException);
  });

  it('evaluates and logs ActionRequest when firewall is ON', async () => {
    const events: any[] = [];
    service.getEventsStream().subscribe((e) => events.push(JSON.parse(e.data as string)));

    const decision = await service.checkAction(validActionRequest);

    expect(decision.verdict).toBe('allow');
    expect(decision.layer).toBe('rule');
    expect(mockActionsRepo.insert).toHaveBeenCalledTimes(1);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('action_checked');
  });

  it('returns layer "off" and logs action when firewall is toggled OFF', async () => {
    service.setMode({ enabled: false });
    expect(service.getMode().enabled).toBe(false);

    const decision = await service.checkAction(validActionRequest);

    expect(decision.verdict).toBe('allow');
    expect(decision.layer).toBe('off');
    expect(decision.reason).toContain('disabled');
    expect(mockActionsRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundException when resolving nonexistent approval', () => {
    (mockApprovalsRepo.resolve as jest.Mock).mockReturnValue(null);

    expect(() =>
      service.resolveApproval('nonexistent-id', { decision: 'approve' }),
    ).toThrow(NotFoundException);
  });

  it('resolves approval and emits approval_resolved event', () => {
    const mockResolved: Approval = {
      id: 'appr-123',
      requestId: 'req-test-1',
      agentId: 'acme-assistant',
      tool: 'transfer_money',
      args: { amount: 120000 },
      userGoal: 'Pay supplier',
      reason: 'Requires approval',
      state: 'approved',
      createdAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
    };

    (mockApprovalsRepo.resolve as jest.Mock).mockReturnValue(mockResolved);

    const events: any[] = [];
    service.getEventsStream().subscribe((e) => events.push(JSON.parse(e.data as string)));

    const result = service.resolveApproval('appr-123', { decision: 'approve' });
    expect(result.state).toBe('approved');
    expect(events.some((e) => e.type === 'approval_resolved')).toBe(true);
  });
});
