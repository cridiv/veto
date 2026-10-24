#!/usr/bin/env node

/**
 * Veto Firewall Live E2E Verification Harness
 * Tests all policy enforcement layers against the live running Veto server.
 */

const BASE_URL = process.env.VETO_URL || 'http://localhost:3000';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(title, text = '') {
  console.log(`${title} ${text}`);
}

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log(`\n${colors.bright}${colors.cyan}======================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  🛡️  Veto Firewall — Live End-to-End Verification${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}======================================================${colors.reset}`);
  console.log(`${colors.gray}Target: ${BASE_URL}${colors.reset}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = {}) {
    if (condition) {
      console.log(`  ${colors.green}✔${colors.reset} ${message}`);
      passed++;
    } else {
      console.log(`  ${colors.red}✖${colors.reset} ${message}`);
      console.log(`    ${colors.yellow}Details:${colors.reset}`, details);
      failed++;
    }
  }

  // 0. Health / Mode Check
  try {
    const modeRes = await api('/v1/mode');
    assert(modeRes.ok && modeRes.data.enabled === true, 'Firewall is online and ENABLED (mode: ON)');
  } catch (err) {
    console.error(`${colors.red}Failed to reach Veto server at ${BASE_URL}: ${err.message}${colors.reset}`);
    process.exit(1);
  }

  // ── Scenario 1: Safe Read Operation ─────────────────────────────────────────
  console.log(`\n${colors.bright}${colors.magenta}Scenario 1: Permitted Read-Only Operations${colors.reset}`);
  {
    const req = {
      id: `live-read-${Date.now()}`,
      agentId: 'acme-assistant',
      sessionId: 'live-sess-1',
      userGoal: 'Read customer support messages',
      tool: 'read_inbox',
      args: {},
      source: 'agent',
      timestamp: new Date().toISOString(),
    };

    const res = await api('/v1/check', { method: 'POST', body: JSON.stringify(req) });
    assert(res.status === 201, 'POST /v1/check returns HTTP 201');
    assert(res.data.verdict === 'allow', `Verdict is ALLOW (got: ${res.data.verdict})`);
    assert(res.data.layer === 'rule', `Evaluated by layer RULE (got: ${res.data.layer})`);
    assert(res.data.matchedRule === 'allow-read-tools', `Matched rule: ${res.data.matchedRule}`);
  }

  // ── Scenario 2: Unverified Recipient Escalation & Human Resolution ──────────
  console.log(`\n${colors.bright}${colors.magenta}Scenario 2: Unverified Recipient & Human Approval Workflow${colors.reset}`);
  let pendingApprovalId;
  {
    const req = {
      id: `live-unverified-${Date.now()}`,
      agentId: 'acme-assistant',
      sessionId: 'live-sess-2',
      userGoal: 'Wire payment to unlisted vendor',
      tool: 'transfer_money',
      args: { to: 'Shady Corp Offshore', amount: 45000 },
      source: 'agent',
      timestamp: new Date().toISOString(),
    };

    const res = await api('/v1/check', { method: 'POST', body: JSON.stringify(req) });
    assert(res.data.verdict === 'needs_approval', `Verdict is NEEDS_APPROVAL (got: ${res.data.verdict})`);
    assert(res.data.layer === 'rule', `Layer is RULE (got: ${res.data.layer})`);
    assert(res.data.matchedRule === 'acme-unverified-recipients', `Matched rule: ${res.data.matchedRule}`);
    assert(!!res.data.approvalId, `Approval ID created: ${res.data.approvalId}`);
    pendingApprovalId = res.data.approvalId;
  }

  if (pendingApprovalId) {
    // Poll pending state
    const pollRes = await api(`/v1/approvals/${pendingApprovalId}`);
    assert(pollRes.status === 200, 'GET /v1/approvals/:id returns HTTP 200');
    assert(pollRes.data.state === 'pending', `Ticket state is PENDING (got: ${pollRes.data.state})`);

    // Resolve with approval
    const resolveRes = await api(`/v1/approvals/${pendingApprovalId}`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', resolvedBy: 'compliance_officer' }),
    });
    assert(resolveRes.status === 201, 'POST /v1/approvals/:id returns HTTP 201');
    assert(resolveRes.data.state === 'approved', `Ticket transitioned to APPROVED (got: ${resolveRes.data.state})`);
  }

  // ── Scenario 3: Sliding-Window Count Quota (DevOps Bot Rate Limit) ──────────
  console.log(`\n${colors.bright}${colors.magenta}Scenario 3: Sliding-Window Call Frequency Quota${colors.reset}`);
  {
    const agentId = 'devops-bot';
    const tool = 'delete_files';

    const req = {
      id: `live-del-${Date.now()}`,
      agentId,
      sessionId: 'live-sess-quota',
      userGoal: 'Clean temporary log file',
      tool,
      args: { path: '/workspace/log-clean.tmp' },
      source: 'agent',
      timestamp: new Date().toISOString(),
    };
    const res = await api('/v1/check', { method: 'POST', body: JSON.stringify(req) });

    if (res.data.verdict === 'allow') {
      assert(res.data.layer === 'rule', 'Initial call within 10m frequency cap is ALLOWED');
      let breached = false;
      for (let i = 2; i <= 6; i++) {
        const nextReq = { ...req, id: `live-del-${i}-${Date.now()}` };
        const nextRes = await api('/v1/check', { method: 'POST', body: JSON.stringify(nextReq) });
        if (nextRes.data.verdict === 'block' && nextRes.data.layer === 'quota') {
          assert(true, `Call #${i} triggered quota breach (4/3): ${nextRes.data.reason}`);
          assert(nextRes.data.matchedRule === 'devops-deletion-rate-limit', `Matched rule: ${nextRes.data.matchedRule}`);
          breached = true;
          break;
        }
      }
      assert(breached, 'Frequency quota ceiling was actively enforced');
    } else {
      // Quota is actively exceeded from historical calls in the 10m window
      assert(res.data.verdict === 'block', `Active quota holds: call is BLOCKED (${res.data.reason})`);
      assert(res.data.layer === 'quota', `Decision layer is QUOTA (got: ${res.data.layer})`);
      assert(res.data.matchedRule === 'devops-deletion-rate-limit', `Matched rule: ${res.data.matchedRule}`);
    }
  }

  // ── Scenario 4: Path Traversal / Sandbox Escape Hard Block ──────────────────
  console.log(`\n${colors.bright}${colors.magenta}Scenario 4: Sandbox Escape Prevention${colors.reset}`);
  {
    const req = {
      id: `live-escape-${Date.now()}`,
      agentId: 'devops-bot',
      sessionId: 'live-sess-escape',
      userGoal: 'Attempt to delete root system files',
      tool: 'delete_files',
      args: { path: '/etc/pam.d/system-auth' },
      source: 'agent',
      timestamp: new Date().toISOString(),
    };

    const res = await api('/v1/check', { method: 'POST', body: JSON.stringify(req) });
    assert(res.data.verdict === 'block', `Action outside /workspace/ is BLOCKED`);
    assert(res.data.layer === 'rule', `Evaluated by layer RULE (got: ${res.data.layer})`);
    assert(res.data.matchedRule === 'block-sandbox-escape-deletion', `Matched rule: ${res.data.matchedRule}`);
    assert(!res.data.approvalId, 'No approval ticket created for hard blocks');
  }

  // ── Scenario 5: Cumulative Spending Cap (Sum Quota) ────────────────────────
  console.log(`\n${colors.bright}${colors.magenta}Scenario 5: Cumulative Sliding-Window Spending Quota${colors.reset}`);
  {
    const req = {
      id: `live-transfer-sum-${Date.now()}`,
      agentId: 'acme-assistant',
      sessionId: 'live-sess-spend',
      userGoal: 'Transfer installment to verified recipient',
      tool: 'transfer_money',
      args: { to: 'PHCN', amount: 80000 },
      source: 'agent',
      timestamp: new Date().toISOString(),
    };
    const res = await api('/v1/check', { method: 'POST', body: JSON.stringify(req) });

    if (res.data.verdict === 'allow') {
      assert(res.data.layer === 'rule', 'Transfer under ₦300,000 hourly ceiling is ALLOWED');
      let breached = false;
      for (let i = 2; i <= 6; i++) {
        const nextReq = { ...req, id: `live-transfer-sum-${i}-${Date.now()}` };
        const nextRes = await api('/v1/check', { method: 'POST', body: JSON.stringify(nextReq) });
        if (nextRes.data.verdict === 'needs_approval' && nextRes.data.layer === 'quota') {
          assert(true, `Transfer #${i} breached cumulative hourly cap: ${nextRes.data.reason}`);
          assert(nextRes.data.matchedRule === 'acme-hourly-transfer-cap', `Matched rule: ${nextRes.data.matchedRule}`);
          breached = true;
          break;
        }
      }
      assert(breached, 'Cumulative spending quota ceiling was actively enforced');
    } else {
      // Quota is actively exceeded from historical calls in the 1h window
      assert(res.data.verdict === 'needs_approval', `Active hourly quota holds: requires approval (${res.data.reason})`);
      assert(res.data.layer === 'quota', `Breach caught at layer QUOTA (got: ${res.data.layer})`);
      assert(res.data.matchedRule === 'acme-hourly-transfer-cap', `Matched rule: ${res.data.matchedRule}`);
    }
  }

  // ── Scenario 6: System Metrics & Audit Trail ────────────────────────────────
  console.log(`\n${colors.bright}${colors.magenta}Scenario 6: Audit Trail & Aggregated Statistics${colors.reset}`);
  {
    const statsRes = await api('/v1/stats');
    assert(statsRes.ok, 'GET /v1/stats returns 200 OK');
    const s = statsRes.data;
    assert(s.total > 0, `Recorded total actions: ${s.total}`);
    assert(s.allowed > 0, `Allowed actions: ${s.allowed}`);
    assert(s.blocked > 0, `Blocked actions: ${s.blocked}`);
    assert(s.escalated > 0, `Escalated actions: ${s.escalated}`);
    assert(s.byLayer.rule > 0, `Rule-evaluated actions: ${s.byLayer.rule}`);
    assert(s.byLayer.quota > 0, `Quota-evaluated actions: ${s.byLayer.quota}`);

    const logsRes = await api('/v1/actions?limit=5');
    assert(logsRes.ok && Array.isArray(logsRes.data), 'GET /v1/actions returns recent audit entries');
  }

  // ── Final Report ────────────────────────────────────────────────────────────
  console.log(`\n${colors.bright}${colors.cyan}======================================================${colors.reset}`);
  if (failed === 0) {
    console.log(`${colors.bright}${colors.green}  🎉 ALL CHECKS PASSED: ${passed} passed, 0 failed${colors.reset}`);
    console.log(`${colors.gray}  The Veto Firewall policy engine is 100% verified end-to-end.${colors.reset}`);
  } else {
    console.log(`${colors.bright}${colors.red}  ⚠️  VERIFICATION FAILED: ${passed} passed, ${failed} failed${colors.reset}`);
  }
  console.log(`${colors.bright}${colors.cyan}======================================================${colors.reset}\n`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
