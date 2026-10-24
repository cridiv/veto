import { tools } from './veto.config';
import { VetoBlockError, VetoApprovalDeniedError, VetoApprovalTimeoutError } from '@veto/sdk';

export interface AgentExecutionResult {
  task: string;
  success: boolean;
  toolUsed?: string;
  data?: unknown;
  error?: string;
  blockedByFirewall?: boolean;
  firewallReason?: string;
  firewallLayer?: string;
}

/**
 * Acme AI Operations Assistant
 *
 * Notice: This agent contains ZERO security logic, ZERO regexes, and ZERO checks.
 * It simply calls `tools` imported from `veto.config`.
 */
export class AcmeAssistant {
  public async executeTask(taskPrompt: string): Promise<AgentExecutionResult> {
    const prompt = taskPrompt.toLowerCase();

    try {
      // 1. Task: Transfer Money
      if (prompt.includes('pay') || prompt.includes('transfer') || prompt.includes('wire')) {
        let to = 'Supplier Ltd';
        let amount = 50000;

        if (prompt.includes('phcn')) {
          to = 'PHCN';
          amount = 45000;
        } else if (prompt.includes('unknown') || prompt.includes('offshore')) {
          to = 'Offshore Shell Corp';
          amount = 80000;
        } else if (prompt.includes('250000') || prompt.includes('250,000')) {
          amount = 250000;
        }

        const transferReceipt = await tools.transfer_money({ to, amount });
        return {
          task: taskPrompt,
          success: true,
          toolUsed: 'transfer_money',
          data: transferReceipt,
        };
      }

      // 2. Task: Read Inbox
      if (prompt.includes('inbox') || prompt.includes('email') || prompt.includes('unread')) {
        const emails = await tools.read_inbox({});
        return {
          task: taskPrompt,
          success: true,
          toolUsed: 'read_inbox',
          data: emails,
        };
      }

      // 3. Task: Delete Files
      if (prompt.includes('delete') || prompt.includes('clean') || prompt.includes('remove')) {
        const path = prompt.includes('/etc/') ? '/etc/passwd' : '/workspace/temp.log';
        const deleteReceipt = await tools.delete_files({ path });
        return {
          task: taskPrompt,
          success: true,
          toolUsed: 'delete_files',
          data: deleteReceipt,
        };
      }

      // 4. Task: Shell Execution (Zero-Trust Test)
      if (prompt.includes('shell') || prompt.includes('bash') || prompt.includes('whoami')) {
        const shellReceipt = await tools.execute_bash({ cmd: 'whoami' });
        return {
          task: taskPrompt,
          success: true,
          toolUsed: 'execute_bash',
          data: shellReceipt,
        };
      }

      return {
        task: taskPrompt,
        success: false,
        error: `Could not determine appropriate tool for task: "${taskPrompt}"`,
      };
    } catch (err: unknown) {
      if (err instanceof VetoBlockError) {
        return {
          task: taskPrompt,
          success: false,
          toolUsed: err.decision.matchedRule ? 'blocked_tool' : undefined,
          blockedByFirewall: true,
          firewallReason: err.decision.reason,
          firewallLayer: err.decision.layer,
          error: `BLOCKED BY VETO FIREWALL: ${err.decision.reason}`,
        };
      }

      if (err instanceof VetoApprovalDeniedError) {
        return {
          task: taskPrompt,
          success: false,
          blockedByFirewall: true,
          error: `DENIED BY OPERATOR: Human operator rejected approval ticket ${err.approval.id}`,
        };
      }

      if (err instanceof VetoApprovalTimeoutError) {
        return {
          task: taskPrompt,
          success: false,
          blockedByFirewall: true,
          error: `TIMED OUT: Operator did not respond to ticket ${err.approvalId} in time`,
        };
      }

      const msg = err instanceof Error ? err.message : String(err);
      return {
        task: taskPrompt,
        success: false,
        error: `Execution error: ${msg}`,
      };
    }
  }
}
