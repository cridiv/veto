export {
  Veto,
  VetoClient,
  VetoOptions,
  VetoClientOptions,
  EnforceInput,
} from './client';

export {
  VetoError,
  VetoBlockError,
  VetoNeedsApprovalError,
  VetoApprovalDeniedError,
  VetoApprovalTimeoutError,
  VetoConnectionError,
} from './errors';

// Re-export core contract types for consumer convenience
export type {
  ActionRequest,
  ActionSource,
  Decision,
  DecisionVerdict,
  DecisionLayer,
  Approval,
  ApprovalState,
  UntrustedContent,
  FirewallStats,
} from '@veto/contracts';
