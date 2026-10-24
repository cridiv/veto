import type { Decision, Approval } from '@veto/contracts';

/**
 * Base error for all Veto SDK exceptions.
 */
export class VetoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VetoError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an action is blocked by the Veto Firewall.
 */
export class VetoBlockError extends VetoError {
  public readonly decision: Decision;

  constructor(decision: Decision) {
    super(`Veto Firewall Blocked Action: ${decision.reason} (layer: ${decision.layer})`);
    this.name = 'VetoBlockError';
    this.decision = decision;
  }
}

/**
 * Thrown when an action requires human approval and auto-wait is not enabled.
 */
export class VetoNeedsApprovalError extends VetoError {
  public readonly decision: Decision;
  public readonly approvalId: string;

  constructor(decision: Decision) {
    super(`Veto Action Requires Approval: ${decision.reason} [Approval ID: ${decision.approvalId}]`);
    this.name = 'VetoNeedsApprovalError';
    this.decision = decision;
    this.approvalId = decision.approvalId ?? '';
  }
}

/**
 * Thrown when an approval was explicitly rejected by a human operator.
 */
export class VetoApprovalDeniedError extends VetoError {
  public readonly approval: Approval;

  constructor(approval: Approval) {
    super(`Veto Approval Denied: Human operator rejected approval ${approval.id}`);
    this.name = 'VetoApprovalDeniedError';
    this.approval = approval;
  }
}

/**
 * Thrown when waiting for human approval times out.
 */
export class VetoApprovalTimeoutError extends VetoError {
  public readonly approvalId: string;
  public readonly timeoutMs: number;

  constructor(approvalId: string, timeoutMs: number) {
    super(`Veto Approval Timed Out: Operator did not resolve approval ${approvalId} within ${timeoutMs}ms`);
    this.name = 'VetoApprovalTimeoutError';
    this.approvalId = approvalId;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when communication with the Veto Firewall server fails.
 */
export class VetoConnectionError extends VetoError {
  public readonly statusCode?: number;
  public readonly cause?: unknown;

  constructor(message: string, statusCode?: number, cause?: unknown) {
    super(message);
    this.name = 'VetoConnectionError';
    this.statusCode = statusCode;
    this.cause = cause;
  }
}
