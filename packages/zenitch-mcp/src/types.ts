/**
 * Zenitch Core Types & Approval System Contracts
 */

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalRequest<T = Record<string, unknown>> {
  id: string;
  tool: string;
  parameters: T;
  rationale: string;
  requestedAt: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ZenitchError {
  code: string;
  message: string;
  details?: unknown;
  recoverable?: boolean;
}

export interface ZenitchTelemetry {
  executionMs: number;
  timestamp: string;
  memoryUsageMb?: number;
}

export interface ZenitchResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ZenitchError;
  telemetry: ZenitchTelemetry;
}

export interface SubsystemContract {
  id: string;
  name: string;
  version: string;
  description: string;
  tools: string[];
}
