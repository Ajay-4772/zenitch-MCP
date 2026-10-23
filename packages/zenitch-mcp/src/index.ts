// Library Entry Point for Zenitch MCP Server & Tool Engines

// Server & Configuration
export { ZenitchServer, type ServerConfig } from './server.js';

// Subsystem 1-8 Engines & Types
export { analyzeProductContext } from './intelligence/product-analyzer.js';
export { inspectProject } from './intelligence/project-inspector.js';
export { evaluateDesignPolicy } from './policy/policy-evaluator.js';
export { generateDesignSystem } from './intelligence/design-system-generator.js';
export { resolveComponent } from './intelligence/component-resolver.js';
export { auditPageQuality } from './audit/page-auditor.js';
export { compareVisualRegression } from './audit/visual-comparator.js';
export { evaluateAnimationBudget } from './animation/budget-evaluator.js';

// Product Experience Intelligence (PXI)
export { planProductExperience } from './intelligence/experience-planner.js';
export * from './schemas/experience.schema.js';

// Memory, State Machine & Verification Engines
export { MemoryManager } from './memory/memory-manager.js';
export { StorageEngine } from './memory/storage-engine.js';
export { MemoryCorruptionError, SecurityBoundaryError } from './memory/types.js';
export { VerificationManager } from './verification/verification-manager.js';
export { ReadinessManager } from './readiness/readiness-manager.js';

// Phase 5: Engineering Impact Intelligence
export { ImpactEvaluator } from './impact/impact-evaluator.js';
export { ImpactManager } from './impact/impact-manager.js';
export {
  ImpactRiskLevelEnum,
  ImpactAnalysisStatusEnum,
  RecommendedVerificationSchema,
  ImpactRecordSchema,
  AnalyzeChangeImpactInputSchema,
  InspectImpactInputSchema,
  ImpactFileSchema,
  type ImpactRiskLevel,
  type ImpactAnalysisStatus,
  type RecommendedVerification,
  type ImpactRecord,
  type AnalyzeChangeImpactInput,
  type InspectImpactInput,
  type ImpactFile
} from './schemas/memory.schema.js';

// Phase 6A: Architecture & Engineering Intelligence
export { ArchitectureManager } from './architecture/architecture-manager.js';
export { ArchitectureEvaluator } from './architecture/architecture-evaluator.js';
export { DependencyGraph } from './architecture/dependency-graph.js';
export * from './schemas/architecture.schema.js';

// Universal Common Types & Schemas
export * from './schemas/index.js';
export * from './types.js';
