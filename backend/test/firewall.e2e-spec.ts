import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import type { ActionRequest, Decision, Approval, FirewallStats } from '@veto/contracts';

describe('Firewall End-to-End Policy Enforcement (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.VETO_DB_PATH = ':memory:';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.VETO_DB_PATH;
  });

  describe('Scenario 1: Safe read operations allowed with zero friction', () => {
    it('allows read_inbox for acme-assistant', async () => {
      const action: ActionRequest = {
        id: `req-read-${Date.now()}`,
        agentId: 'acme-assistant',
        sessionId: 'sess-read-1',
        userGoal: 'Check customer inbox messages',
        tool: 'read_inbox',
        args: {},
        source: 'agent',
        timestamp: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/v1/check')
        .send(action)
        .expect(201);

      const decision: Decision = res.body;
      expect(decision.requestId).toBe(action.id);
      expect(decision.verdict).toBe('allow');
      expect(decision.layer).toBe('rule');
      expect(decision.matchedRule).toBe('allow-read-tools');
      expect(decision.approvalId).toBeUndefined();
    });
  });

  describe('Scenario 2: Unverified recipient requires human approval', () => {
    let approvalId: string;

    it('escalates money transfer to unknown vendor and creates approval ticket', async () => {
      const action: ActionRequest = {
        id: `req-transfer-unverified-${Date.now()}`,
        agentId: 'acme-assistant',
        sessionId: 'sess-transfer-1',
        userGoal: 'Pay invoice to unknown external vendor',
        tool: 'transfer_money',
        args: {
          to: 'Suspicious Vendor Corp',
          amount: 50000,
        },
        source: 'agent',
        timestamp: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/v1/check')
        .send(action)
        .expect(201);

      const decision: Decision = res.body;
      expect(decision.requestId).toBe(action.id);
      expect(decision.verdict).toBe('needs_approval');
      expect(decision.layer).toBe('rule');
      expect(decision.matchedRule).toBe('acme-unverified-recipients');
      expect(decision.approvalId).toBeDefined();

      approvalId = decision.approvalId!;
    });

    it('retrieves the pending approval ticket', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/approvals/${approvalId}`)
        .expect(200);

      const approval: Approval = res.body;
      expect(approval.id).toBe(approvalId);
      expect(approval.state).toBe('pending');
      expect(approval.tool).toBe('transfer_money');
      expect(approval.args).toEqual({
        to: 'Suspicious Vendor Corp',
        amount: 50000,
      });
    });

    it('resolves the approval ticket with approved', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/approvals/${approvalId}`)
        .send({
          decision: 'approve',
          resolvedBy: 'security_admin',
        })
        .expect(201);

      const approval: Approval = res.body;
      expect(approval.id).toBe(approvalId);
      expect(approval.state).toBe('approved');
      expect(approval.resolvedAt).toBeDefined();
    });
  });

  describe('Scenario 3: Rate-limit and quota enforcement', () => {
    it('enforces devops-deletion-rate-limit quota (max 3 calls / 10m) and blocks the 4th', async () => {
      const agentId = 'devops-bot';
      const tool = 'delete_files';

      // 3 calls within workspace sandbox
      for (let i = 1; i <= 3; i++) {
        const action: ActionRequest = {
          id: `req-del-quota-${i}-${Date.now()}`,
          agentId,
          sessionId: 'sess-devops-quota',
          userGoal: `Clean temp file #${i}`,
          tool,
          args: { path: `/workspace/temp-${i}.log` },
          source: 'agent',
          timestamp: new Date().toISOString(),
        };

        const res = await request(app.getHttpServer())
          .post('/v1/check')
          .send(action)
          .expect(201);

        // First 3 are within quota (< 3 calls), so quota does not block.
        // It passes down to default judge/needs_approval (or allow)
        expect(res.body.layer).not.toBe('quota');
      }

      // 4th call exceeds quota (count = 4 > 3)
      const action4: ActionRequest = {
        id: `req-del-quota-4-${Date.now()}`,
        agentId,
        sessionId: 'sess-devops-quota',
        userGoal: 'Clean temp file #4',
        tool,
        args: { path: '/workspace/temp-4.log' },
        source: 'agent',
        timestamp: new Date().toISOString(),
      };

      const res4 = await request(app.getHttpServer())
        .post('/v1/check')
        .send(action4)
        .expect(201);

      const decision4: Decision = res4.body;
      expect(decision4.verdict).toBe('block');
      expect(decision4.layer).toBe('quota');
      expect(decision4.matchedRule).toBe('devops-deletion-rate-limit');
      expect(decision4.reason).toContain('Quota exceeded');
    });

    it('enforces acme-hourly-transfer-cap when cumulative amount exceeds 300,000', async () => {
      // 4 transfers of 80,000 to "PHCN" (known recipient, < 100k so does not trigger acme-large-transfers)
      // Call 1: 80k (sum = 80k <= 300k)
      // Call 2: 80k (sum = 160k <= 300k)
      // Call 3: 80k (sum = 240k <= 300k)
      // Call 4: 80k (sum = 320k > 300k -> Quota exceeded!)
      for (let i = 1; i <= 3; i++) {
        const action: ActionRequest = {
          id: `req-cap-${i}-${Date.now()}`,
          agentId: 'acme-assistant',
          sessionId: 'sess-cap',
          userGoal: `Recurring small utility payment #${i}`,
          tool: 'transfer_money',
          args: { to: 'PHCN', amount: 80000 },
          source: 'agent',
          timestamp: new Date().toISOString(),
        };

        const res = await request(app.getHttpServer())
          .post('/v1/check')
          .send(action)
          .expect(201);

        // Within quota
        expect(res.body.layer).not.toBe('quota');
      }

      // 4th call pushes cumulative sum to 320,000 > 300,000 cap
      const action4: ActionRequest = {
        id: `req-cap-4-${Date.now()}`,
        agentId: 'acme-assistant',
        sessionId: 'sess-cap',
        userGoal: 'Recurring small utility payment #4',
        tool: 'transfer_money',
        args: { to: 'PHCN', amount: 80000 },
        source: 'agent',
        timestamp: new Date().toISOString(),
      };

      const res4 = await request(app.getHttpServer())
        .post('/v1/check')
        .send(action4)
        .expect(201);

      const decision4: Decision = res4.body;
      expect(decision4.verdict).toBe('needs_approval');
      expect(decision4.layer).toBe('quota');
      expect(decision4.matchedRule).toBe('acme-hourly-transfer-cap');
      expect(decision4.reason).toContain('Quota exceeded');
      expect(decision4.approvalId).toBeDefined();
    });
  });

  describe('Scenario 4: Dangerous file deletion outside workspace is blocked', () => {
    it('blocks delete_files targeting /etc/shadow with verdict block', async () => {
      const action: ActionRequest = {
        id: `req-del-blocked-${Date.now()}`,
        agentId: 'devops-bot',
        sessionId: 'sess-devops-1',
        userGoal: 'Clean up sensitive server files',
        tool: 'delete_files',
        args: {
          path: '/etc/shadow',
        },
        source: 'agent',
        timestamp: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/v1/check')
        .send(action)
        .expect(201);

      const decision: Decision = res.body;
      expect(decision.requestId).toBe(action.id);
      expect(decision.verdict).toBe('block');
      expect(decision.layer).toBe('rule');
      expect(decision.matchedRule).toBe('block-sandbox-escape-deletion');
      expect(decision.approvalId).toBeUndefined();
    });
  });

  describe('Scenario 5: Audit log query and stats aggregation', () => {
    it('returns aggregated stats reflecting decisions made in this run', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/stats')
        .expect(200);

      const stats: FirewallStats = res.body;
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.blocked).toBeGreaterThanOrEqual(1);
      expect(stats.escalated).toBeGreaterThanOrEqual(1);
      expect(stats.byLayer.quota).toBeGreaterThanOrEqual(1);
      expect(stats.byLayer.rule).toBeGreaterThanOrEqual(1);
    });

    it('queries action audit logs filtered by agentId', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/actions?agentId=acme-assistant')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      for (const log of res.body) {
        expect(log.agentId).toBe('acme-assistant');
      }
    });
  });
});
