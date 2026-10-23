import fs from 'node:fs';
import path from 'node:path';
import { StorageEngine } from '../memory/storage-engine.js';
import { resolveProjectIdentity } from '../memory/project-identity.js';
import { StaticVerifier } from '../verification/static-verifier.js';
import {
  ChangesFileSchema,
  RequirementsFileSchema,
  VerificationFileSchema,
  ChangeRecord,
  ImpactRecord,
  ImpactRiskLevel,
  RecommendedVerification
} from '../schemas/memory.schema.js';

export class ImpactEvaluator {
  private static readonly MAX_VISITED_FILES = 50;

  /**
   * Detect route mapped to a file path (e.g. Next.js App router, Pages router, generic routes).
   */
  public static detectRoute(relPath: string): string | null {
    const normalized = relPath.replace(/\\/g, '/');

    // Next.js App Router (app/checkout/page.tsx -> /checkout, app/page.tsx -> /)
    const appMatch = normalized.match(/(?:^|\/)app\/(.+?)\/page\.[a-z]+$/i);
    if (appMatch) {
      const segments = appMatch[1].split('/').filter(s => !(s.startsWith('(') && s.endsWith(')')));
      const route = segments.join('/');
      return route ? '/' + route : '/';
    }
    if (/(?:^|\/)app\/page\.[a-z]+$/i.test(normalized)) {
      return '/';
    }

    // Next.js Pages Router (pages/checkout.tsx -> /checkout, pages/api/pay.ts -> /api/pay)
    const pagesMatch = normalized.match(/(?:^|\/)pages\/(.+?)\.[a-z]+$/i);
    if (pagesMatch) {
      let route = pagesMatch[1];
      if (route.endsWith('/index') || route === 'index') {
        route = route.replace(/\/?index$/, '');
      }
      return route ? '/' + route : '/';
    }

    // Generic Routes folder (routes/checkout.tsx -> /checkout)
    const routesMatch = normalized.match(/(?:^|\/)routes\/(.+?)\.[a-z]+$/i);
    if (routesMatch) {
      let route = routesMatch[1];
      if (route.endsWith('/index') || route === 'index') {
        route = route.replace(/\/?index$/, '');
      }
      return route ? '/' + route : '/';
    }

    return null;
  }

  /**
   * Detect UI component name from path/filename.
   */
  public static detectComponent(relPath: string): string | null {
    const normalized = relPath.replace(/\\/g, '/');
    const base = path.basename(normalized, path.extname(normalized));
    const ext = path.extname(normalized).toLowerCase();

    const isComponentLocation =
      normalized.includes('/components/') ||
      normalized.startsWith('components/') ||
      normalized.includes('/ui/') ||
      normalized.startsWith('ui/');

    const isPascalCase = /^[A-Z][a-zA-Z0-9]+$/.test(base);
    const isComponentExt = ['.tsx', '.jsx', '.vue', '.svelte'].includes(ext);

    if (isPascalCase && (isComponentLocation || isComponentExt)) {
      return base;
    }

    return null;
  }

  /**
   * Check if an import specifier inside an importing file resolves to the target file.
   */
  public static resolveImport(importingFileRel: string, specifier: string, targetFileRel: string): boolean {
    const normTarget = targetFileRel.replace(/\\/g, '/');
    const targetBase = normTarget.replace(/\.[a-z]+$/, '');

    if (specifier.startsWith('.')) {
      const importingDir = path.dirname(importingFileRel).replace(/\\/g, '/');
      const resolved = path.posix.normalize(path.posix.join(importingDir, specifier));
      if (resolved === normTarget || resolved === targetBase) {
        return true;
      }
      if (resolved + '/index' === targetBase || resolved === targetBase + '/index') {
        return true;
      }
    } else if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
      const aliasBase = specifier.slice(2);
      if (normTarget.endsWith(aliasBase) || targetBase.endsWith(aliasBase)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract import/require specifiers from source file content.
   */
  public static extractImportSpecifiers(content: string): string[] {
    const specifiers: string[] = [];
    const importRegex = /(?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g;
    const requireRegex = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) specifiers.push(match[1]);
    }
    while ((match = requireRegex.exec(content)) !== null) {
      if (match[1]) specifiers.push(match[1]);
    }

    return specifiers;
  }

  /**
   * Main evaluation entry point. Analyzes change impact deterministically.
   */
  public static async evaluateChangeImpact(options: {
    projectRoot: string;
    changeId: string;
    depth?: number;
  }): Promise<ImpactRecord> {
    const projectRoot = path.resolve(options.projectRoot);
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const identity = resolveProjectIdentity(projectRoot);
    const requestedDepth = Math.max(1, Math.min(3, options.depth ?? 1));

    // 1. Load Change Record
    const changesDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'changes.json',
      ChangesFileSchema,
      () => null
    );

    if (!changesDoc || !changesDoc.items || !changesDoc.items[options.changeId]) {
      throw new Error('Change record "' + options.changeId + '" not found in .zenitch/changes.json');
    }

    const change: ChangeRecord = changesDoc.items[options.changeId];
    const rawFiles: string[] = change.files || change.affectedFiles || [];
    const changedFiles = rawFiles.map(f => path.relative(projectRoot, path.resolve(projectRoot, f)).replace(/\\/g, '/'));

    const affectedFiles = new Set<string>(changedFiles);
    const affectedComponents = new Set<string>();
    const affectedRoutes = new Set<string>();
    const affectedRequirements = new Set<string>();
    const affectedCriteria = new Set<string>();
    const affectedDependencies = new Set<string>();
    const reasons: string[] = [];

    let partialBoundaryReached = false;
    let partialReason: string | undefined = undefined;
    const visitedFiles = new Set<string>();

    // 2. Direct Component & Route Detection on Changed Files
    for (const file of changedFiles) {
      const comp = this.detectComponent(file);
      if (comp) {
        affectedComponents.add(comp);
        reasons.push('Direct component modified: ' + comp + ' (' + file + ')');
      }

      const route = this.detectRoute(file);
      if (route) {
        affectedRoutes.add(route);
        reasons.push('Direct route modified: ' + route + ' (' + file + ')');
      }

      if (file.toLowerCase().includes('package.json') || file.toLowerCase().includes('package-lock.json')) {
        affectedDependencies.add(path.basename(file));
        reasons.push('Package manifest modified: ' + file);
      }
    }

    // 3. Scan Project Source Files to map dependencies/consumers
    const allSourceFiles = StaticVerifier.scanFiles(projectRoot).map(f =>
      path.relative(projectRoot, f).replace(/\\/g, '/')
    );

    // Pre-parse imports for all project source files to keep traversal ultra-fast
    const fileImports = new Map<string, string[]>();
    for (const f of allSourceFiles) {
      const fullPath = path.join(projectRoot, f);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size <= 1024 * 1024) {
          const content = fs.readFileSync(fullPath, 'utf8');
          fileImports.set(f, this.extractImportSpecifiers(content));
        }
      } catch {
        // ignore unreadable
      }
    }

    // 4. Bounded Consumer Traversal (Depth 1..3)
    let currentLevelFiles = new Set<string>(changedFiles);

    for (let level = 1; level <= requestedDepth; level++) {
      const nextLevelFiles = new Set<string>();

      for (const targetFile of currentLevelFiles) {
        for (const [consumerFile, specifiers] of fileImports.entries()) {
          if (consumerFile === targetFile || affectedFiles.has(consumerFile)) {
            continue;
          }

          let consumes = false;
          for (const spec of specifiers) {
            if (this.resolveImport(consumerFile, spec, targetFile)) {
              consumes = true;
              break;
            }
          }

          if (consumes) {
            if (visitedFiles.size >= this.MAX_VISITED_FILES) {
              partialBoundaryReached = true;
              partialReason = 'Configured analysis boundary reached (maxFiles: ' +
                this.MAX_VISITED_FILES + ', depth: ' + requestedDepth + ').';
              break;
            }

            visitedFiles.add(consumerFile);
            affectedFiles.add(consumerFile);
            nextLevelFiles.add(consumerFile);
            reasons.push('Consumer at depth ' + level + ': ' + consumerFile + ' imports ' + targetFile);

            const comp = this.detectComponent(consumerFile);
            if (comp) affectedComponents.add(comp);

            const route = this.detectRoute(consumerFile);
            if (route) affectedRoutes.add(route);
          }
        }

        if (partialBoundaryReached) break;
      }

      if (partialBoundaryReached || nextLevelFiles.size === 0) break;
      currentLevelFiles = nextLevelFiles;
    }

    // 5. Existing Requirement & Acceptance Criteria Traceability (Do NOT invent)
    const reqDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'requirements.json',
      RequirementsFileSchema,
      () => null
    );

    if (reqDoc && reqDoc.items) {
      // 5a. Explicit change links
      if (Array.isArray(change.requirementIds)) {
        for (const reqId of change.requirementIds) {
          const req = reqDoc.items[reqId];
          if (req) {
            affectedRequirements.add(reqId);
            reasons.push('Change explicitly links to requirement ' + reqId);
            if (Array.isArray(req.acceptanceCriteria)) {
              for (const crit of req.acceptanceCriteria) {
                const critId = typeof crit === 'object' && crit !== null ? crit.id : String(crit);
                affectedCriteria.add(critId);
              }
            }
          }
        }
      }

      // 5b. Requirement relatedFiles mapping
      for (const req of Object.values<any>(reqDoc.items)) {
        if (Array.isArray(req.relatedFiles)) {
          const normRelFiles = req.relatedFiles.map((rf: string) => rf.replace(/\\/g, '/'));
          for (const affFile of affectedFiles) {
            if (normRelFiles.some((rf: string) => rf === affFile || rf.endsWith(affFile) || affFile.endsWith(rf))) {
              if (!affectedRequirements.has(req.id)) {
                affectedRequirements.add(req.id);
                reasons.push('Requirement ' + req.id + ' lists affected file in relatedFiles: ' + affFile);
                if (Array.isArray(req.acceptanceCriteria)) {
                  for (const crit of req.acceptanceCriteria) {
                    const critId = typeof crit === 'object' && crit !== null ? crit.id : String(crit);
                    affectedCriteria.add(critId);
                  }
                }
              }
            }
          }
        }
      }
    }

    // 6. Risk Level Calculation
    let riskLevel: ImpactRiskLevel = 'MEDIUM';
    const allFilesList = Array.from(affectedFiles);

    const isOnlyDocs = allFilesList.length > 0 && allFilesList.every(f => {
      const lower = f.toLowerCase();
      return (
        lower.endsWith('.md') ||
        lower.endsWith('.txt') ||
        lower.includes('license') ||
        lower.includes('changelog') ||
        lower.includes('docs/')
      );
    });

    const hasCriticalSecurity = allFilesList.some(f => {
      const lower = f.toLowerCase();
      return (
        lower.includes('secret') ||
        lower.includes('credential') ||
        lower.includes('password') ||
        lower.includes('.env') ||
        lower.includes('private.key')
      );
    });

    const hasAuthSecurity = allFilesList.some(f => {
      const lower = f.toLowerCase();
      return (
        lower.includes('auth') ||
        lower.includes('token') ||
        lower.includes('session') ||
        lower.includes('guard') ||
        lower.includes('permission') ||
        lower.includes('jwt') ||
        lower.includes('crypto') ||
        lower.includes('oauth') ||
        lower.includes('middleware') ||
        lower.includes('firewall')
      );
    });

    const hasSharedServicesOrAPI = allFilesList.some(f => {
      const lower = f.toLowerCase();
      return (
        lower.includes('service') ||
        lower.includes('/api/') ||
        lower.includes('controller') ||
        lower.includes('backend') ||
        lower.includes('database') ||
        lower.includes('prisma') ||
        lower.includes('schema')
      );
    });

    if (isOnlyDocs) {
      riskLevel = 'LOW';
      reasons.push('Impact risk assessed as LOW: only documentation or informational files affected.');
    } else if (hasCriticalSecurity) {
      riskLevel = 'CRITICAL';
      reasons.push('Impact risk assessed as CRITICAL: production security or credential configuration affected.');
    } else if (hasAuthSecurity) {
      riskLevel = 'HIGH';
      reasons.push('Impact risk assessed as HIGH: authentication, authorization, or security middleware affected.');
    } else if (hasSharedServicesOrAPI) {
      riskLevel = 'HIGH';
      reasons.push('Impact risk assessed as HIGH: shared services, data models, or core API endpoints affected.');
    } else {
      riskLevel = 'MEDIUM';
      reasons.push('Impact risk assessed as MEDIUM: component, presentation, or localized application logic modified.');
    }

    // 7. Recommended Verifications
    const recommendedVerifications: RecommendedVerification[] = [];
    let recIdx = 1;

    for (const route of affectedRoutes) {
      recommendedVerifications.push({
        id: 'REC-VERIF-' + recIdx++,
        description: 'Verify functional rendering and user flow for route: ' + route,
        suggestedMethod: 'RUNTIME_VERIFICATION',
        target: route,
        priority: 'MUST_VERIFY'
      });
    }

    for (const comp of affectedComponents) {
      recommendedVerifications.push({
        id: 'REC-VERIF-' + recIdx++,
        description: 'Verify visual layout and interactive states for component: ' + comp,
        suggestedMethod: 'PAGE_QUALITY_AUDIT',
        target: comp,
        priority: 'SHOULD_VERIFY'
      });
    }

    if (hasAuthSecurity || hasCriticalSecurity) {
      recommendedVerifications.push({
        id: 'REC-VERIF-' + recIdx++,
        description: 'Execute automated security and session validation test suite',
        suggestedMethod: 'AUTOMATED_TEST',
        priority: 'MUST_VERIFY'
      });
    }

    if (affectedRequirements.size > 0) {
      recommendedVerifications.push({
        id: 'REC-VERIF-' + recIdx++,
        description: 'Verify linked acceptance criteria for requirements: ' + Array.from(affectedRequirements).join(', '),
        suggestedMethod: 'STATIC_ANALYSIS',
        priority: 'MUST_VERIFY'
      });
    }

    if (isOnlyDocs && recommendedVerifications.length === 0) {
      recommendedVerifications.push({
        id: 'REC-VERIF-' + recIdx++,
        description: 'Verify documentation syntax and internal file links',
        suggestedMethod: 'STATIC_ANALYSIS',
        priority: 'OPTIONAL'
      });
    }

    const impactId = 'imp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

    const record: ImpactRecord = {
      id: impactId,
      projectId: identity.projectId,
      changeId: change.id,
      affectedFiles: Array.from(affectedFiles),
      affectedComponents: Array.from(affectedComponents),
      affectedRoutes: Array.from(affectedRoutes),
      affectedRequirements: Array.from(affectedRequirements),
      affectedCriteria: Array.from(affectedCriteria),
      affectedDependencies: Array.from(affectedDependencies),
      riskLevel,
      reasons,
      recommendedVerifications,
      analysisStatus: partialBoundaryReached ? 'PARTIAL' : 'COMPLETE',
      partialReason,
      traversalDepth: requestedDepth,
      visitedFilesCount: visitedFiles.size,
      confidence: 1.0,
      provenance: {
        source: 'SYSTEM',
        verificationLevel: 'TEST_VERIFIED',
        confidence: 1.0,
        timestamp: new Date().toISOString()
      },
      reusedEvidence: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return record;
  }
}
