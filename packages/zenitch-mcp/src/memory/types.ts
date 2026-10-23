import {
  ProjectContextRecord,
  UserPreferenceRecord,
  ProjectConstraintRecord,
  RequirementRecord,
  DecisionRecord,
  VerificationRecord,
  ChangeRecord,
  ApprovalTicket,
  CheckpointRecord
} from '../schemas/memory.schema.js';

export type MemoryStorageStatus = 'HEALTHY' | 'DEGRADED_CORRUPTION_DETECTED' | 'NOT_INITIALIZED';

export interface MemoryCorruptionReport {
  status: 'DEGRADED_CORRUPTION_DETECTED';
  file: string;
  corruptPath: string;
  errorDetails: string;
  detectedAt: string;
}

export class MemoryCorruptionError extends Error {
  constructor(public report: MemoryCorruptionReport) {
    super(`Memory file corruption detected in ${report.file} (State: ${report.status}). Preserved as ${report.corruptPath}. Details: ${report.errorDetails}`);
    this.name = 'MemoryCorruptionError';
  }
}

export class SecurityBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityBoundaryError';
  }
}

export interface StorageLock {
  pid: number;
  createdAt: number;
}

export interface ContainerFile<T> {
  schemaVersion: string;
  projectId: string;
  _version: number;
  updatedAt: string;
  items: Record<string, T>;
}

export interface RequirementsContainerFile extends ContainerFile<RequirementRecord> {
  tickets: Record<string, ApprovalTicket>;
}

export type PreferencesFile = ContainerFile<UserPreferenceRecord>;
export type ConstraintsFile = ContainerFile<ProjectConstraintRecord>;
export type DecisionsFile = ContainerFile<DecisionRecord>;
export type ChangesFile = ContainerFile<ChangeRecord>;
export type VerificationFile = ContainerFile<VerificationRecord>;
export type CheckpointFile = CheckpointRecord;
