import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { ActionsRepository } from './repositories/actions.repository';
import { ApprovalsRepository } from './repositories/approvals.repository';
import { StatsRepository } from './repositories/stats.repository';
import { checkQuota } from './evaluators/quota-evaluator';
import type { ActionRequest, Decision, QuotaRule } from '@veto/contracts';
import * as fs from 'fs';
import * as path from 'path';

describe('Database Repositories & QuotaEngine', () => {
  let dbService: DatabaseService;
  let actionsRepo: ActionsRepository;
  let approvalsRepo: ApprovalsRepository;
  let statsRepo: StatsRepository;
  const testDbPath = path.resolve(process.cwd(), 'test-veto.sqlite');

  beforeAll(async () => {
    process.env.VETO_DB_PATH = testDbPath;
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        ActionsRepository,
        ApprovalsRepository,
        StatsRepository,
      ],
    }).compile();

    dbService = module.get<DatabaseService>(DatabaseService);
    actionsRepo = module.get<ActionsRepository>(ActionsRepository);
    approvalsRepo = module.get<ApprovalsRepository>(ApprovalsRepository);
    statsRepo = module.get<StatsRepository>(StatsRepository);

    dbService.onModuleInit();
  });

  afterAll(() => {
    dbService.onModuleDestroy();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  const makeMockRequest = (id: string, tool: string, args: Record<string, unknown>): ActionRequest => ({
    id,
    agentId: 'test-agent',
    sessionId: 'sess-1',
    userGoal: 'Test user goal',
    tool,
    args,
    source: 'agent',
    timestamp: new Date().toISOString(),
  });

  const mockAllowDecision: Decision = {
    requestId: 'req-1',
    verdict: 'allow',
    reason: 'Test allowed',
    layer: 'rule',
    riskScore: 0.1,
  };

  it('ActionsRepository: records and retrieves audit logs', () => {
    const req = makeMockRequest('req-1', 'read_file', { path: '/tmp/test' });
    actionsRepo.insert(req, mockAllowDecision);

    const retrieved = actionsRepo.findById('req-1');
    expect(retrieved).toBeDefined();
    expect(retrieved.tool).toBe('read_file');
    expect(retrieved.verdict).toBe('allow');

    const recent = actionsRepo.findRecent({ limit: 10 });
    expect(recent.length).toBeGreaterThanOrEqual(1);
  });

  it('QuotaEvaluator: enforces call frequency caps (count)', () => {
    const quotaRule: QuotaRule = {
      id: 'max-deletes',
      tool: 'delete_files',
      window: '10m',
      count: 2,
      over: 'block',
    };

    const req1 = makeMockRequest('del-1', 'delete_files', { path: 'a.txt' });
    const check1 = checkQuota(dbService.connection, 'test-agent', req1, quotaRule);
    expect(check1.exceeded).toBe(false);
    actionsRepo.insert(req1, mockAllowDecision);

    const req2 = makeMockRequest('del-2', 'delete_files', { path: 'b.txt' });
    const check2 = checkQuota(dbService.connection, 'test-agent', req2, quotaRule);
    expect(check2.exceeded).toBe(false);
    actionsRepo.insert(req2, mockAllowDecision);

    // 3rd call should trigger quota limit
    const req3 = makeMockRequest('del-3', 'delete_files', { path: 'c.txt' });
    const check3 = checkQuota(dbService.connection, 'test-agent', req3, quotaRule);
    expect(check3.exceeded).toBe(true);
    expect(check3.currentValue).toBe(3);
    expect(check3.limit).toBe(2);
  });

  it('QuotaEvaluator: dynamically sums arbitrary numerical arguments (sum + max)', () => {
    const quotaRule: QuotaRule = {
      id: 'transfer-limit',
      tool: 'transfer_money',
      window: '1h',
      sum: 'args.amount',
      max: 100000,
      over: 'require_approval',
    };

    const req1 = makeMockRequest('tx-1', 'transfer_money', { amount: 60000, to: 'Alice' });
    const check1 = checkQuota(dbService.connection, 'test-agent', req1, quotaRule);
    expect(check1.exceeded).toBe(false);
    actionsRepo.insert(req1, mockAllowDecision);

    const req2 = makeMockRequest('tx-2', 'transfer_money', { amount: 30000, to: 'Bob' });
    const check2 = checkQuota(dbService.connection, 'test-agent', req2, quotaRule);
    expect(check2.exceeded).toBe(false);
    actionsRepo.insert(req2, mockAllowDecision);

    // 3rd transfer puts total at 110,000 > 100,000
    const req3 = makeMockRequest('tx-3', 'transfer_money', { amount: 20000, to: 'Charlie' });
    const check3 = checkQuota(dbService.connection, 'test-agent', req3, quotaRule);
    expect(check3.exceeded).toBe(true);
    expect(check3.currentValue).toBe(110000);
    expect(check3.limit).toBe(100000);
  });

  it('ApprovalsRepository: manages human approval queue and atomic resolution', () => {
    const actionReq = makeMockRequest('req-appr-1', 'transfer_money', { amount: 20000 });
    actionsRepo.insert(actionReq, {
      requestId: 'req-appr-1',
      verdict: 'needs_approval',
      reason: 'Exceeded 100k quota',
      layer: 'quota',
      riskScore: 0.8,
      approvalId: 'appr-1',
    });

    approvalsRepo.create({
      id: 'appr-1',
      requestId: 'req-appr-1',
      agentId: 'test-agent',
      tool: 'transfer_money',
      args: { amount: 20000 },
      userGoal: 'Send money',
      reason: 'Exceeded 100k quota',
      state: 'pending',
      createdAt: new Date().toISOString(),
    });

    const pendingList = approvalsRepo.findPending();
    expect(pendingList.some((a) => a.id === 'appr-1')).toBe(true);

    const resolved = approvalsRepo.resolve('appr-1', 'approve');
    expect(resolved?.state).toBe('approved');
    expect(resolved?.resolvedAt).toBeDefined();

    const pendingAfter = approvalsRepo.findPending();
    expect(pendingAfter.some((a) => a.id === 'appr-1')).toBe(false);
  });

  it('StatsRepository: calculates dashboard metrics and layer breakdowns', () => {
    const stats = statsRepo.getStats();
    expect(stats.total).toBeGreaterThanOrEqual(1);
    expect(stats.byLayer).toBeDefined();
    expect(stats.byAgent).toBeDefined();
  });
});
