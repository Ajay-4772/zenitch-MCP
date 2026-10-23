import fs from 'node:fs';
import path from 'node:path';
import { StorageEngine } from '../memory/storage-engine.js';
import { resolveProjectIdentity } from '../memory/project-identity.js';
import { GitInspector } from '../memory/git-inspector.js';
import {
  AnalyzeArchitectureInput,
  InspectArchitectureInput,
  ArchitectureRecord,
  ArchitectureFile,
  ArchitectureFileSchema,
  PHASE6_SCHEMA_VERSION,
  ArchitectureFinding
} from '../schemas/architecture.schema.js';
import { ArchitectureEvaluator } from './architecture-evaluator.js';

export class ArchitectureManager {
  public static readonly MAX_HISTORY_SNAPSHOTS = 5;

  /**
   * Main entry point for zenitch_analyze_architecture.
   */
  public static async analyzeArchitecture(input: AnalyzeArchitectureInput): Promise<any> {
    const projectRoot = path.resolve(input.projectRoot || process.cwd());
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const identity = resolveProjectIdentity(projectRoot);
    const forceReassess = input.forceReassess ?? input.forceRefresh ?? false;
    const mode = input.mode || 'concise';

    // 1. Fast-Path Cache Freshness Check
    if (!forceReassess) {
      try {
        const fileDoc = StorageEngine.readDocument<ArchitectureFile>(
          zenitchDir,
          'architecture.json',
          ArchitectureFileSchema,
          () => ({
            schemaVersion: PHASE6_SCHEMA_VERSION,
            version: PHASE6_SCHEMA_VERSION,
            projectId: identity.projectId,
            _version: 0,
            updatedAt: new Date().toISOString(),
            history: []
          })
        );

        if (fileDoc && fileDoc.latestAssessment) {
          const isFresh = await this.isAssessmentFresh(projectRoot, fileDoc.latestAssessment);
          if (isFresh) {
            return this.formatResponse({
              ...fileDoc.latestAssessment,
              reusedEvidence: true
            }, mode);
          }
        }
      } catch {
        // Stale or missing cache continues to evaluation
      }
    }

    // 2. Perform Fresh Evaluation
    const assessment = ArchitectureEvaluator.evaluate(projectRoot);

    // 3. Atomically Persist Assessment into .zenitch/architecture.json
    try {
      await StorageEngine.withLock(zenitchDir, async () => {
        const fileDoc = StorageEngine.readDocument<ArchitectureFile>(
          zenitchDir,
          'architecture.json',
          ArchitectureFileSchema,
          () => ({
            schemaVersion: PHASE6_SCHEMA_VERSION,
            version: PHASE6_SCHEMA_VERSION,
            projectId: identity.projectId,
            _version: 0,
            updatedAt: new Date().toISOString(),
            history: []
          })
        );

        const existingHistory = fileDoc.history || [];
        fileDoc.latestAssessment = assessment;
        fileDoc.history = [assessment, ...existingHistory].slice(0, this.MAX_HISTORY_SNAPSHOTS);
        fileDoc.updatedAt = new Date().toISOString();
        fileDoc._version = (fileDoc._version || 0) + 1;

        StorageEngine.writeDocument(zenitchDir, 'architecture.json', fileDoc);
      });
    } catch (err) {
      // In-memory evaluation succeeds even if persistence is degraded
    }

    return this.formatResponse(assessment, mode);
  }

  /**
   * Main entry point for zenitch_inspect_architecture.
   */
  public static async inspectArchitecture(input: InspectArchitectureInput): Promise<any> {
    const projectRoot = path.resolve(input.projectRoot || process.cwd());
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const mode = input.mode || input.detailLevel || 'concise';

    let fileDoc: ArchitectureFile | null = null;
    try {
      fileDoc = StorageEngine.readDocument<ArchitectureFile>(
        zenitchDir,
        'architecture.json',
        ArchitectureFileSchema,
        () => null as any
      );
    } catch {
      // Degraded read
    }

    let assessment: ArchitectureRecord;

    if (!fileDoc || !fileDoc.latestAssessment) {
      // Run on-demand evaluation if no assessment is recorded yet
      const evaluated = ArchitectureEvaluator.evaluate(projectRoot);
      assessment = evaluated;
    } else {
      assessment = fileDoc.latestAssessment;
    }

    // Filter findings
    let filteredFindings = [...assessment.findings];

    if (input.category) {
      filteredFindings = filteredFindings.filter(f => f.category === input.category);
    }

    const effectiveSeverity = input.minSeverity || input.severity;
    if (effectiveSeverity) {
      const severityRanks: Record<string, number> = {
        INFO: 0,
        LOW: 1,
        MEDIUM: 2,
        HIGH: 3,
        CRITICAL: 4
      };
      const minRank = severityRanks[effectiveSeverity] ?? 0;
      filteredFindings = filteredFindings.filter(f => (severityRanks[f.severity] ?? 0) >= minRank);
    }

    if (input.ruleId) {
      filteredFindings = filteredFindings.filter(f => f.ruleId === input.ruleId);
    }

    return this.formatInspectionResponse(assessment, filteredFindings, mode);
  }

  /**
   * Determine if the cached architecture assessment is strictly fresh.
   */
  private static async isAssessmentFresh(
    projectRoot: string,
    record: ArchitectureRecord
  ): Promise<boolean> {
    const assessTime = new Date(record.timestamp).getTime();
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);

    // 1. Check Git state: Invalidate on ANY uncommitted change or commit advance
    const gitStatus = GitInspector.inspect(projectRoot);
    if (gitStatus.gitAvailable) {
      const totalChanges =
        gitStatus.modified.length +
        gitStatus.added.length +
        gitStatus.deleted.length +
        gitStatus.untracked.length;

      if (totalChanges > 0) return false;
      if (gitStatus.headCommit && record.headCommit && gitStatus.headCommit !== record.headCommit) {
        return false;
      }
    } else {
      // Non-git fallback: inspect source files count and mtime
      try {
        const sourceFiles = ArchitectureEvaluator.discoverSourceFiles(projectRoot);
        if (sourceFiles.length !== record.metrics.totalFilesScanned) {
          return false; // Invalidate if files were added or removed
        }
        for (const file of sourceFiles) {
          const abs = path.join(projectRoot, file);
          if (fs.existsSync(abs)) {
            const st = fs.statSync(abs);
            if (st.mtimeMs > assessTime) return false;
          }
        }
      } catch {
        return false;
      }
    }

    // 2. Check configuration and memory state
    const memoryFiles = ['decisions.json', 'requirements.json', 'package.json'];
    for (const mf of memoryFiles) {
      const p = mf === 'package.json' ? path.join(projectRoot, mf) : path.join(zenitchDir, mf);
      if (fs.existsSync(p)) {
        try {
          const st = fs.statSync(p);
          if (st.mtimeMs > assessTime) return false;
        } catch {
          // Continue check
        }
      }
    }

    return true;
  }

  /**
   * Format analyze response based on mode.
   */
  private static formatResponse(
    record: ArchitectureRecord,
    mode: 'concise' | 'standard' | 'detailed'
  ): any {
    if (mode === 'concise') {
      return {
        id: record.id,
        timestamp: record.timestamp,
        status: record.status,
        summary: record.summary,
        metrics: record.metrics,
        reusedEvidence: record.reusedEvidence,
        durationMs: record.durationMs,
        findingsCount: record.findings.length
      };
    }

    if (mode === 'standard') {
      return {
        id: record.id,
        timestamp: record.timestamp,
        status: record.status,
        summary: record.summary,
        metrics: record.metrics,
        categories: record.categories,
        reusedEvidence: record.reusedEvidence,
        durationMs: record.durationMs,
        findings: record.findings.map(f => ({
          id: f.id,
          ruleId: f.ruleId,
          category: f.category,
          severity: f.severity,
          title: f.title,
          fact: f.fact,
          affectedFiles: f.affectedFiles
        }))
      };
    }

    // Detailed
    return record;
  }

  /**
   * Format inspection response based on mode.
   */
  private static formatInspectionResponse(
    assessment: ArchitectureRecord,
    findings: ArchitectureFinding[],
    mode: 'concise' | 'standard' | 'detailed'
  ): any {
    const base = {
      id: assessment.id,
      timestamp: assessment.timestamp,
      status: assessment.status,
      summary: assessment.summary,
      metrics: assessment.metrics,
      categories: assessment.categories,
      reusedEvidence: assessment.reusedEvidence,
      matchedFindingsCount: findings.length
    };

    if (mode === 'concise') {
      return {
        ...base,
        findings: findings.map(f => ({
          id: f.id,
          ruleId: f.ruleId,
          category: f.category,
          severity: f.severity,
          title: f.title
        }))
      };
    }

    if (mode === 'standard') {
      return {
        ...base,
        findings: findings.map(f => ({
          id: f.id,
          ruleId: f.ruleId,
          category: f.category,
          severity: f.severity,
          factConfidence: f.factConfidence,
          title: f.title,
          fact: f.fact,
          affectedFiles: f.affectedFiles
        }))
      };
    }

    // Detailed
    return {
      ...base,
      findings
    };
  }
}
