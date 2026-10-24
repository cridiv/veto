import { Veto } from '@veto/sdk';
import { rawTools } from './tools';

/**
 * Acme Centralized Veto Firewall Configuration
 *
 * All security rules, quotas, spending caps, and whitelists are defined
 * externally in `veto-policy.yaml`.
 *
 * This file wraps the raw tools with Veto's in-line runtime interceptor.
 * Only the wrapped `tools` object is exported to the agent.
 */
export const veto = new Veto({
  baseUrl: process.env.VETO_URL || 'http://localhost:3000',
  agentId: 'acme-assistant', // Bound directly to policy rules for acme-assistant
  approvalTimeoutMs: 30000,
  approvalPollIntervalMs: 1000,
});

/**
 * The ONLY tool interface accessible to the AI Agent.
 * Every invocation is automatically intercepted and checked against veto-policy.yaml.
 */
export const tools = veto.wrap(rawTools);
