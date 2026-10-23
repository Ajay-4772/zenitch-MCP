import fs from 'node:fs';
import path from 'node:path';
import { StorageEngine } from '../memory/storage-engine.js';
import { resolveProjectIdentity } from '../memory/project-identity.js';
import { GitInspector } from '../memory/git-inspector.js';
import {
  CheckReleaseReadinessInput,
  InspectReleaseReadinessInput,
  ReleaseReadinessRecord,
  ReadinessFileSchema,
  CategoryReadiness,
  ReadinessCategory,
  ReadinessFinding
} from '../schemas/memory.schema.js';
import { ReadinessEvaluator } from './readiness-evaluator.js';

export class ReadinessManager {
  /**
   * Main entry point for zenitch_check_release_readiness.
   */
  public static async checkReleaseReadiness(input: CheckReleaseReadinessInput): Promise<any> {
    const projectRoot = path.resolve(input.projectRoot || process.cwd());
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const identity = resolveProjectIdentity(projectRoot);
    const mode = input.mode || 'concise';

    // 1. Fast-Path Cache Lookup
    if (!input.forceReassess) {
      try {
        const fileDoc = StorageEngine.readDocument<any>(
          zenitchDir,
          'readiness.json',
          ReadinessFileSchema,
          () => null
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
        // Continue to fresh evaluation
      }
    }

    const startTime = performance.now();
    const categoriesToEval: ReadinessCategory[] = input.categories && input.categories.length > 0
      ? input.categories
      : [
          'REQUIREMENTS',
          'VERIFICATION',
          'BUILD',
          'TESTS',
          'SECURITY',
          'CONFIGURATION',
          'DEPENDENCIES',
          'DEPLOYMENT',
          'DOCUMENTATION',
          'SOURCE_CONTROL'
        ];

    const categoryResults: Record<string, CategoryReadiness> = {};
    let totalBlocking = 0;
    let totalAttention = 0;
    let totalInfo = 0;

    for (const cat of categoriesToEval) {
      let res: CategoryReadiness;
      switch (cat) {
        case 'REQUIREMENTS':
          res = ReadinessEvaluator.evaluateRequirements(projectRoot);
          break;
        case 'VERIFICATION':
          res = ReadinessEvaluator.evaluateVerification(projectRoot);
          break;
        case 'BUILD':
          res = ReadinessEvaluator.evaluateBuild(projectRoot);
          break;
        case 'TESTS':
          res = ReadinessEvaluator.evaluateTests(projectRoot);
          break;
        case 'SECURITY':
          res = ReadinessEvaluator.evaluateSecurity(projectRoot);
          break;
        case 'CONFIGURATION':
          res = ReadinessEvaluator.evaluateConfiguration(projectRoot);
          break;
        case 'DEPENDENCIES':
          res = ReadinessEvaluator.evaluateDependencies(projectRoot);
          break;
        case 'DEPLOYMENT':
          res = ReadinessEvaluator.evaluateDeployment(projectRoot);
          break;
        case 'DOCUMENTATION':
          res = ReadinessEvaluator.evaluateDocumentation(projectRoot);
          break;
        case 'SOURCE_CONTROL':
          res = ReadinessEvaluator.evaluateSourceControl(projectRoot);
          break;
        default:
          res = {
            category: cat,
            status: 'NOT_ASSESSED',
            summary: 'Category not evaluated.',
            blockingFindings: 0,
            attentionFindings: 0,
            findings: []
          };
      }

      categoryResults[cat] = res;
      totalBlocking += res.blockingFindings;
      totalAttention += res.attentionFindings;
      totalInfo += res.findings.filter(f => f.severity === 'INFO').length;
    }

    const durationMs = Math.round(performance.now() - startTime);

    // Deterministic overall status
    let overallStatus: 'READY' | 'BLOCKED' | 'NEEDS_ATTENTION' = 'READY';
    if (totalBlocking > 0) {
      overallStatus = 'BLOCKED';
    } else if (totalAttention > 0) {
      overallStatus = 'NEEDS_ATTENTION';
    }

    const overallSummary = overallStatus === 'READY'
      ? 'Project is READY for release (' + Object.keys(categoryResults).length + ' categories evaluated, 0 blocking findings).'
      : overallStatus === 'BLOCKED'
      ? 'Release is BLOCKED: ' + totalBlocking + ' critical finding(s) must be resolved.'
      : 'Release NEEDS_ATTENTION: ' + totalAttention + ' warning/attention finding(s) should be reviewed.';

    const readinessId = 'rel-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

    const record: ReleaseReadinessRecord = {
      id: readinessId,
      projectId: identity.projectId,
      status: overallStatus,
      summary: overallSummary,
      blockingFindingsCount: totalBlocking,
      attentionFindingsCount: totalAttention,
      infoFindingsCount: totalInfo,
      categories: categoryResults,
      provenance: {
        source: 'SYSTEM',
        verificationLevel: 'TEST_VERIFIED',
        confidence: 1.0,
        timestamp: new Date().toISOString()
      },
      reusedEvidence: false,
      timestamp: new Date().toISOString(),
      durationMs
    };

    // 2. Persist assessment into readiness.json
    await StorageEngine.withLock(zenitchDir, async () => {
      let fileDoc = StorageEngine.readDocument<any>(
        zenitchDir,
        'readiness.json',
        ReadinessFileSchema,
        () => ({
          schemaVersion: '1.3.0',
          projectId: identity.projectId,
          _version: 0,
          updatedAt: new Date().toISOString(),
          latestAssessment: undefined,
          history: {}
        })
      );

      if (!fileDoc.history) fileDoc.history = {};
      fileDoc.latestAssessment = record;
      fileDoc.history[readinessId] = record;
      fileDoc.updatedAt = new Date().toISOString();
      fileDoc._version = (fileDoc._version || 0) + 1;

      StorageEngine.writeDocument(zenitchDir, 'readiness.json', fileDoc);
    });

    return this.formatResponse(record, mode);
  }

  /**
   * Main entry point for zenitch_inspect_release_readiness.
   */
  public static async inspectReleaseReadiness(input: InspectReleaseReadinessInput): Promise<any> {
    const projectRoot = path.resolve(input.projectRoot || process.cwd());
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const mode = input.mode || 'standard';

    const fileDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'readiness.json',
      ReadinessFileSchema,
      () => null
    );

    if (!fileDoc || !fileDoc.latestAssessment) {
      return {
        hasAssessment: false,
        summary: 'No release readiness assessment has been recorded yet. Run zenitch_check_release_readiness first.',
        categories: []
      };
    }

    const assessment: ReleaseReadinessRecord = fileDoc.latestAssessment;
    const allFindings: ReadinessFinding[] = [];

    for (const [catName, catData] of Object.entries<CategoryReadiness>(assessment.categories)) {
      if (input.category && catName !== input.category) continue;
      for (const f of catData.findings) {
        if (input.severity && f.severity !== input.severity) continue;
        allFindings.push(f);
      }
    }

    if (mode === 'concise') {
      return {
        readinessId: assessment.id,
        status: assessment.status,
        summary: assessment.summary,
        blockingFindings: assessment.blockingFindingsCount,
        attentionFindings: assessment.attentionFindingsCount,
        filteredFindingsCount: allFindings.length,
        timestamp: assessment.timestamp
      };
    } else if (mode === 'standard') {
      return {
        readinessId: assessment.id,
        status: assessment.status,
        summary: assessment.summary,
        categoryStatuses: Object.entries(assessment.categories).map(([name, data]) => ({
          category: name,
          status: data.status,
          summary: data.summary,
          blockingCount: data.blockingFindings,
          attentionCount: data.attentionFindings
        })),
        findings: allFindings.map(f => ({
          id: f.id,
          category: f.category,
          severity: f.severity,
          status: f.status,
          summary: f.summary,
          remediation: f.remediation,
          affectedFiles: f.affectedFiles
        })),
        timestamp: assessment.timestamp
      };
    } else {
      // detailed
      return {
        assessment,
        filteredFindings: allFindings
      };
    }
  }

  /**
   * Check if a cached readiness assessment is still fresh.
   */
  private static async isAssessmentFresh(projectRoot: string, record: ReleaseReadinessRecord): Promise<boolean> {
    const assessTime = new Date(record.timestamp).getTime();
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);

    // 1. Check Git state: Invalidate on ANY uncommitted change or commit advance regardless of prior status (S-001)
    const gitStatus = GitInspector.inspect(projectRoot);
    if (gitStatus.gitAvailable) {
      const totalModified = gitStatus.modified.length + gitStatus.added.length + gitStatus.deleted.length + gitStatus.untracked.length;
      if (totalModified > 0) {
        return false;
      }
      if (gitStatus.headCommit && (record as any).headCommit && gitStatus.headCommit !== (record as any).headCommit) {
        return false;
      }
    } else {
      // Non-git fallback: check key root files and source files for modifications
      try {
        const checkFiles = ['package.json', 'tsconfig.json', '.env', '.env.example', '.env.template', 'README.md'];
        for (const cf of checkFiles) {
          const cp = path.join(projectRoot, cf);
          if (fs.existsSync(cp)) {
            const st = fs.statSync(cp);
            if (Math.floor(st.mtimeMs) > assessTime) return false;
          }
        }
        // Scan project root entries to detect modified source files
        const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isFile() && !ent.name.startsWith('.') && !ent.name.includes('.tmp')) {
            const fp = path.join(projectRoot, ent.name);
            const st = fs.statSync(fp);
            if (Math.floor(st.mtimeMs) > assessTime) return false;
          }
        }
      } catch {}
    }

    // 2. Check requirements.json mtime
    const reqPath = path.join(zenitchDir, 'requirements.json');
    if (fs.existsSync(reqPath)) {
      const stat = fs.statSync(reqPath);
      if (Math.floor(stat.mtimeMs) > assessTime) return false;
    }

    // 3. Check verification.json mtime
    const verPath = path.join(zenitchDir, 'verification.json');
    if (fs.existsSync(verPath)) {
      const stat = fs.statSync(verPath);
      if (Math.floor(stat.mtimeMs) > assessTime) return false;
    }

    // 4. Check package.json mtime
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const stat = fs.statSync(pkgPath);
      if (Math.floor(stat.mtimeMs) > assessTime) return false;
    }

    return true;
  }

  /**
   * Format MCP response based on requested mode.
   */
  private static formatResponse(record: ReleaseReadinessRecord, mode: 'concise' | 'standard' | 'detailed'): any {
    if (mode === 'concise') {
      return {
        status: record.status,
        readinessId: record.id,
        summary: record.summary,
        blockingFindings: record.blockingFindingsCount,
        attentionFindings: record.attentionFindingsCount,
        categoriesChecked: Object.keys(record.categories).length,
        reusedEvidence: record.reusedEvidence ?? false,
        durationMs: record.durationMs || 0
      };
    } else if (mode === 'standard') {
      return {
        status: record.status,
        readinessId: record.id,
        summary: record.summary,
        blockingFindings: record.blockingFindingsCount,
        attentionFindings: record.attentionFindingsCount,
        categories: Object.entries(record.categories).map(([name, data]) => ({
          category: name,
          status: data.status,
          summary: data.summary,
          blockingCount: data.blockingFindings,
          attentionCount: data.attentionFindings
        })),
        reusedEvidence: record.reusedEvidence ?? false,
        durationMs: record.durationMs || 0
      };
    } else {
      // detailed
      return record;
    }
  }
}
