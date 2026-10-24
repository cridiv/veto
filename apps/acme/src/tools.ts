/**
 * Acme Internal Business Tools
 *
 * NOTE: These are raw functions that interface directly with internal systems.
 * They contain ZERO security checks. Security is completely enforced by Veto at runtime.
 */

export interface InboxItem {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
}

export interface TransferResult {
  status: 'COMPLETED';
  transactionId: string;
  recipient: string;
  amount: number;
  currency: string;
  timestamp: string;
}

export interface DeleteResult {
  status: 'DELETED';
  path: string;
  timestamp: string;
}

export const rawTools = {
  /**
   * Reads unread messages from Acme's customer/vendor inbox.
   */
  read_inbox: async (_args: Record<string, unknown> = {}): Promise<InboxItem[]> => {
    return [
      {
        id: 'msg-101',
        from: 'billing@phcn.ng',
        subject: 'Monthly Power Bill #OCT-2026',
        body: 'Your electricity charge for October is ₦45,000. Please settle before the 30th.',
        date: '2026-10-23T10:00:00Z',
      },
      {
        id: 'msg-102',
        from: 'accounts@supplier-ltd.com',
        subject: 'Parts Shipment Invoice #INV-8821',
        body: 'Please transfer ₦85,000 for shipment #8821 to Supplier Ltd account.',
        date: '2026-10-23T11:15:00Z',
      },
    ];
  },

  /**
   * Executes a financial wire transfer from Acme's corporate account.
   */
  transfer_money: async (args: { to: string; amount: number }): Promise<TransferResult> => {
    return {
      status: 'COMPLETED',
      transactionId: `tx_${Math.random().toString(36).substring(2, 10)}`,
      recipient: args.to,
      amount: args.amount,
      currency: 'NGN',
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Deletes temporary cache or log files from workspace storage.
   */
  delete_files: async (args: { path: string }): Promise<DeleteResult> => {
    return {
      status: 'DELETED',
      path: args.path,
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * System shell execution tool (used to test Zero-Trust default-deny).
   */
  execute_bash: async (args: { cmd: string }): Promise<{ output: string }> => {
    return {
      output: `Executed: ${args.cmd}`,
    };
  },
};
