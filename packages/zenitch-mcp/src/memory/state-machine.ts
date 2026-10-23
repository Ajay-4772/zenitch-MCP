import { RequirementStatus } from '../schemas/memory.schema.js';

export class InvalidStateTransitionError extends Error {
  constructor(public currentStatus: RequirementStatus, public targetStatus: RequirementStatus, public reason: string) {
    super(`Invalid state transition from ${currentStatus} to ${targetStatus}: ${reason}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export interface TransitionValidationInput {
  currentStatus: RequirementStatus;
  targetStatus: RequirementStatus;
  hasVerificationEvidence?: boolean;
  hasRelatedFiles?: boolean;
  isApprovalTicketResolved?: boolean;
  actorIsUser?: boolean;
  rejectionRationale?: string;
  blockerRationale?: string;
}

export class RequirementStateMachine {
  public static validateTransition(input: TransitionValidationInput): void {
    const { currentStatus, targetStatus } = input;

    // Disallow self-transitions unless updating metadata
    if (currentStatus === targetStatus) {
      return;
    }

    // Explicitly reject forbidden arbitrary jumps
    if (currentStatus === 'REQUESTED' && (targetStatus === 'VERIFIED' || targetStatus === 'ACCEPTED')) {
      throw new InvalidStateTransitionError(currentStatus, targetStatus, 'Cannot jump from REQUESTED directly to VERIFIED or ACCEPTED without implementation and testing.');
    }

    if (currentStatus === 'IMPLEMENTED' && targetStatus === 'ACCEPTED') {
      throw new InvalidStateTransitionError(currentStatus, targetStatus, 'Cannot transition from IMPLEMENTED directly to ACCEPTED. Work must be TESTED, VERIFIED, and pass human approval.');
    }

    // State machine matrix
    switch (currentStatus) {
      case 'REQUESTED':
        if (targetStatus === 'PLANNED') return;
        if (targetStatus === 'REJECTED') {
          if (!input.rejectionRationale) {
            throw new InvalidStateTransitionError(currentStatus, targetStatus, 'Rejection requires a rejection rationale.');
          }
          return;
        }
        break;

      case 'PLANNED':
        if (targetStatus === 'IMPLEMENTED') {
          if (!input.hasRelatedFiles) {
            throw new InvalidStateTransitionError(currentStatus, targetStatus, 'Transition to IMPLEMENTED requires specifying non-empty relatedFiles modified in workspace.');
          }
          return;
        }
        if (targetStatus === 'BLOCKED') {
          if (!input.blockerRationale) {
            throw new InvalidStateTransitionError(currentStatus, targetStatus, 'Transition to BLOCKED requires specifying a blocker rationale.');
          }
          return;
        }
        if (targetStatus === 'REJECTED') return;
        break;

      case 'IMPLEMENTED':
        if (targetStatus === 'TESTED') return;
        if (targetStatus === 'BLOCKED') return;
        if (targetStatus === 'UNVERIFIED') return;
        break;

      case 'TESTED':
        if (targetStatus === 'VERIFIED') {
          if (!input.hasVerificationEvidence) {
            throw new InvalidStateTransitionError(currentStatus, targetStatus, 'Transition to VERIFIED requires linking valid objective verification evidence (verdict: PASSED).');
          }
          return;
        }
        if (targetStatus === 'IMPLEMENTED') return; // Tests failed or regressions found
        if (targetStatus === 'UNVERIFIED') return;
        break;

      case 'VERIFIED':
        if (targetStatus === 'PENDING_APPROVAL') return;
        if (targetStatus === 'IMPLEMENTED') return; // User requested revision
        if (targetStatus === 'UNVERIFIED') return;  // Code changed after verification
        break;

      case 'PENDING_APPROVAL':
        if (targetStatus === 'ACCEPTED') {
          if (!input.isApprovalTicketResolved) {
            throw new InvalidStateTransitionError(currentStatus, targetStatus, 'Transition to ACCEPTED strictly requires a resolved ApprovalTicket approved by the human user.');
          }
          return;
        }
        if (targetStatus === 'IMPLEMENTED') return; // User rejected ticket with feedback
        break;

      case 'BLOCKED':
        if (targetStatus === 'PLANNED') return;
        if (targetStatus === 'IMPLEMENTED') return;
        break;

      case 'UNVERIFIED':
        if (targetStatus === 'TESTED') return;
        if (targetStatus === 'IMPLEMENTED') return;
        break;

      case 'REJECTED':
      case 'ACCEPTED':
        // Terminal states cannot transition arbitrarily without explicit reset to REQUESTED
        if (targetStatus === 'REQUESTED') return;
        break;
    }

    throw new InvalidStateTransitionError(
      currentStatus,
      targetStatus,
      `Transition from ${currentStatus} to ${targetStatus} is not permitted by the deterministic state machine.`
    );
  }
}
