import fs from 'node:fs';
import path from 'node:path';
import { DependencyGraph, GraphBuildResult } from './dependency-graph.js';
import {
  ArchitectureFinding,
  ArchitectureRecord,
  ArchitectureFindingCategoryEnum,
  ArchitectureMetrics
} from '../schemas/architecture.schema.js';
import { StorageEngine } from '../memory/storage-engine.js';
import { DecisionsFileSchema } from '../schemas/memory.schema.js';
import { resolveProjectIdentity } from '../memory/project-identity.js';

export interface EvaluatorOptions {
  maxScannedFiles?: number;
  maxFileSize?: number;
  maxLineLength?: number;
  maxCycleLength?: number;
}

export class ArchitectureEvaluator {
  public static readonly MAX_SCANNED_FILES = 2000;
  public static readonly MAX_FILE_SIZE = 512 * 1024; // 512 KB
  public static readonly MAX_LINE_LENGTH = 10000;
  public static readonly MAX_CYCLE_LENGTH = 15;

  /**
   * Safe whitelist of packages commonly unreferenced statically in source code.
   */
  public static readonly DEPENDENCY_WHITELIST = new Set<string>([
    'typescript',
    'ts-node',
    'eslint',
    'prettier',
    'postcss',
    'autoprefixer',
    'tailwindcss',
    'sass',
    'less',
    'tslib',
    'core-js',
    'dotenv',
    'cross-env',
    'nodemon',
    'jest',
    'vitest',
    'mocha',
    'chai',
    'playwright',
    'cypress',
    'webpack',
    'rollup',
    'esbuild',
    'vite',
    'turbopack'
  ]);

  /**
   * Server-only modules forbidden in 'use client' files.
   */
  public static readonly SERVER_ONLY_MODULES = [
    '@prisma/client',
    'server-only',
    'pg',
    'mysql2',
    'typeorm',
    'mongoose',
    'fs',
    'node:fs',
    'child_process',
    'node:child_process',
    'crypto',
    'node:crypto',
    'net',
    'node:net',
    'dgram',
    'node:dgram'
  ];

  /**
   * Run all 5 Phase 6A deterministic architectural checks on a project.
   */
  public static evaluate(
    projectRoot: string,
    options: EvaluatorOptions = {}
  ): ArchitectureRecord {
    const startTime = performance.now();
    const identity = resolveProjectIdentity(projectRoot);
    const maxFiles = options.maxScannedFiles ?? this.MAX_SCANNED_FILES;
    const maxFileSize = options.maxFileSize ?? this.MAX_FILE_SIZE;
    const maxLineLength = options.maxLineLength ?? this.MAX_LINE_LENGTH;
    const maxCycleLength = options.maxCycleLength ?? this.MAX_CYCLE_LENGTH;

    let boundaryReached = false;
    let partialEvaluation = false;
    const boundariesEnforced: string[] = [];

    // 1. Discover source files deterministically
    const allSourceFiles = this.discoverSourceFiles(projectRoot);
    let scannedFiles: string[];

    if (allSourceFiles.length > maxFiles) {
      scannedFiles = allSourceFiles.slice(0, maxFiles);
      boundaryReached = true;
      partialEvaluation = true;
      boundariesEnforced.push(
        `Scanned files capped at ${maxFiles} (total discovered: ${allSourceFiles.length})`
      );
    } else {
      scannedFiles = allSourceFiles;
    }

    // 2. Build Dependency Graph & Detect Cycles (Check 1)
    const graphResult = DependencyGraph.buildGraph(projectRoot, scannedFiles, {
      maxCycleLength,
      maxFileSize,
      maxLineLength
    });

    // Check for any file exceeding MAX_FILE_SIZE
    for (const relFile of scannedFiles) {
      const absPath = path.join(projectRoot, relFile);
      try {
        const stat = fs.statSync(absPath);
        if (stat.size > maxFileSize) {
          boundaryReached = true;
          partialEvaluation = true;
          boundariesEnforced.push(
            `File '${relFile}' exceeds 512 KB (${stat.size} bytes); skipped deep code inspection.`
          );
        }
      } catch {
        // Ignore read errors
      }
    }

    const findings: ArchitectureFinding[] = [];

    // ----------------------------------------------------
    // CHECK 1: Dependency Cycle Detection
    // ----------------------------------------------------
    this.checkDependencyCycles(graphResult.cycles, findings);

    // ----------------------------------------------------
    // CHECK 2: Explicit Layer-Rule Violations
    // ----------------------------------------------------
    this.checkLayerRuleViolations(projectRoot, scannedFiles, graphResult, findings);

    // ----------------------------------------------------
    // CHECK 3: Complexity Boundary Signals
    // ----------------------------------------------------
    this.checkComplexityBoundaries(scannedFiles, graphResult.fileContents, maxLineLength, findings);

    // ----------------------------------------------------
    // CHECK 4: Swallowed / Empty Catch Detection
    // ----------------------------------------------------
    this.checkSwallowedCatches(scannedFiles, graphResult.fileContents, findings);

    // ----------------------------------------------------
    // CHECK 5: Unreferenced Declared Dependencies
    // ----------------------------------------------------
    this.checkUnreferencedDependencies(projectRoot, scannedFiles, graphResult.fileContents, findings);

    // Deduplicate findings deterministically
    const uniqueFindings = this.deduplicateFindings(findings);

    // Summarize categories
    const categories: Record<string, { status: 'HEALTHY' | 'WARNING' | 'VIOLATION'; findingsCount: number }> = {};
    for (const cat of ArchitectureFindingCategoryEnum.options) {
      const count = uniqueFindings.filter(f => f.category === cat).length;
      let status: 'HEALTHY' | 'WARNING' | 'VIOLATION' = 'HEALTHY';
      if (count > 0) {
        const hasHigh = uniqueFindings.some(f => f.category === cat && f.severity === 'HIGH');
        status = hasHigh ? 'VIOLATION' : 'WARNING';
      }
      categories[cat] = { status, findingsCount: count };
    }

    const durationMs = Math.round(performance.now() - startTime);

    const assessmentId = `arch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const metrics: ArchitectureMetrics = {
      totalFilesScanned: scannedFiles.length,
      totalModulesAnalyzed: graphResult.fileContents.size,
      circularDependencyCount: graphResult.cycles.length,
      layerViolationCount: uniqueFindings.filter(f => f.category === 'LAYER_RULE_VIOLATION').length,
      complexityViolationCount: uniqueFindings.filter(f => f.category === 'COMPLEXITY_BOUNDARY').length,
      swallowedErrorCount: uniqueFindings.filter(f => f.category === 'SWALLOWED_ERROR').length,
      unreferencedDependencyCount: uniqueFindings.filter(f => f.category === 'UNREFERENCED_DECLARED_DEPENDENCY').length,
      boundaryReached,
      partialEvaluation,
      boundariesEnforced
    };

    const hasHighOrCritical = uniqueFindings.some(f => f.severity === 'HIGH' || f.severity === 'CRITICAL');
    const hasMedium = uniqueFindings.some(f => f.severity === 'MEDIUM');
    const status: 'HEALTHY' | 'NEEDS_ATTENTION' | 'DEGRADED' = hasHighOrCritical
      ? 'DEGRADED'
      : hasMedium
      ? 'NEEDS_ATTENTION'
      : 'HEALTHY';

    const summary = `Architectural assessment evaluated ${scannedFiles.length} files with ${uniqueFindings.length} finding(s) detected across 5 deterministic checks.`;

    return {
      id: assessmentId,
      projectId: identity.projectId,
      timestamp: new Date().toISOString(),
      status,
      summary,
      metrics,
      categories: categories as any,
      findings: uniqueFindings,
      reusedEvidence: false,
      durationMs
    };
  }

  /**
   * Check 1: Dependency Cycles
   */
  private static checkDependencyCycles(cycles: string[][], findings: ArchitectureFinding[]): void {
    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      const cycleStr = cycle.join(' -> ');
      const uniqueFiles = Array.from(new Set(cycle));

      findings.push({
        id: `finding-cycle-${i + 1}`,
        ruleId: 'RULE-BUILTIN-CIRCULAR-DEPENDENCY',
        category: 'DEPENDENCY_CYCLE',
        severity: 'HIGH',
        factConfidence: 1.0,
        title: `Circular dependency detected: ${cycleStr}`,
        fact: `Circular import chain detected across ${cycle.length - 1} files: ${cycleStr}`,
        signal: 'Bidirectional or looping module dependency indicates tightly coupled modules.',
        potentialRisk: 'Circular dependencies may cause runtime initialization order issues, undefined exports during module loading, and complicate testing and refactoring.',
        recommendedAction: 'Break the cycle by extracting shared types/interfaces or moving common logic into an independent module.',
        affectedFiles: uniqueFiles,
        evidence: {
          metricName: 'cycleLength',
          measuredValue: cycle.length - 1,
          threshold: this.MAX_CYCLE_LENGTH,
          trace: cycle
        },
        relatedRequirementIds: [],
        relatedDecisionIds: []
      });
    }
  }

  /**
   * Check 2: Layer Violations (Safe Built-in + Explicit Human Decisions)
   */
  private static checkLayerRuleViolations(
    projectRoot: string,
    scannedFiles: string[],
    graphResult: GraphBuildResult,
    findings: ArchitectureFinding[]
  ): void {
    // A. Built-in: 'use client' files importing server-only modules
    for (const [file, content] of graphResult.fileContents.entries()) {
      if (this.isClientComponent(content)) {
        const specifiers = DependencyGraph.extractSpecifiers(content);
        for (const spec of specifiers) {
          if (this.isForbiddenServerModule(spec)) {
            findings.push({
              id: `finding-layer-builtin-${file.replace(/[^a-zA-Z0-9_-]/g, '_')}-${spec.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
              ruleId: 'RULE-BUILTIN-CLIENT-NO-SERVER',
              category: 'LAYER_RULE_VIOLATION',
              severity: 'HIGH',
              factConfidence: 1.0,
              title: `Server module imported in client component: ${file}`,
              fact: `File '${file}' contains 'use client' directive but imports server module '${spec}'.`,
              signal: 'Client component imports server-side or database dependencies.',
              potentialRisk: 'May bundle sensitive server code or database credentials into client bundles, causing build failures or exposing backend logic.',
              recommendedAction: 'Move server logic to a Server Component, API route, or Server Action, and remove server module imports from client files.',
              affectedFiles: [file],
              evidence: {
                metricName: 'forbiddenServerImport',
                measuredValue: spec,
                trace: [file, spec]
              },
              relatedRequirementIds: [],
              relatedDecisionIds: []
            });
          }
        }
      }
    }

        // B. Built-in: Suspicious server-only secret references in client files (RULE-BUILTIN-CLIENT-SECRET-LEAK)
    for (const [file, content] of graphResult.fileContents.entries()) {
      if (this.isClientSourceFile(file, content)) {
        const { resolvedVarNames, dynamicExpressions } = this.extractEnvReferencesDetailed(content);
        for (const varName of resolvedVarNames) {
          if (this.isSuspiciousClientSecret(varName)) {
            findings.push({
              id: `finding-layer-secret-${file.replace(/[^a-zA-Z0-9_-]/g, '_')}-${varName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
              ruleId: 'RULE-BUILTIN-CLIENT-SECRET-LEAK',
              category: 'LAYER_RULE_VIOLATION',
              severity: 'HIGH',
              factConfidence: 1.0,
              title: `Suspicious server secret reference in client file: ${varName} in ${file}`,
              fact: `Client file '${file}' references server environment variable '${varName}'.`,
              signal: 'Suspicious credential exposure signal detected. Variable name matches strong server-secret naming pattern within client-side code.',
              potentialRisk: 'Client-side bundlers may expose backend secrets, API private keys, or database credentials to browser clients or public client bundles if processed by a client-side bundler.',
              recommendedAction: `Access sensitive secrets exclusively in Server Components, API routes, or backend services. Never expose credentials through client environment variables (even with public prefixes like NEXT_PUBLIC_ or VITE_). If this value is genuinely public, use a publishable/anonymous identifier naming convention without sensitive keywords.`,
              affectedFiles: [file],
              evidence: {
                metricName: 'clientSecretReference',
                measuredValue: varName,
                trace: [file, varName],
                details: `Statically detected reference to '${varName}' in client file '${file}'. Limitation: Static naming heuristics detect suspicious exposure signals; they do not prove that an active live credential was bundled.`
              },
              relatedRequirementIds: [],
              relatedDecisionIds: []
            });
          }
        }
        for (const expr of dynamicExpressions) {
          findings.push({
            id: `finding-dynamic-env-${file.replace(/[^a-zA-Z0-9_-]/g, '_')}-${expr.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
            ruleId: 'RULE-BUILTIN-DYNAMIC-ENV-ACCESS',
            category: 'LAYER_RULE_VIOLATION',
            severity: 'MEDIUM',
            factConfidence: 1.0,
            title: `Dynamic environment variable access in client file: ${expr} in ${file}`,
            fact: `Client file '${file}' accesses environment variables dynamically via '${expr}'.`,
            signal: 'Dynamic environment variable access detected in client-side code. The referenced variable name cannot be determined statically.',
            potentialRisk: 'Dynamic environment variable access prevents static verification of server-secret leakage. If a server-only credential is dynamically accessed, client bundling may expose it or result in runtime undefined values.',
            recommendedAction: `Use static, explicit property access for client-side environment variables (e.g. process.env.NEXT_PUBLIC_FEATURE_FLAG). Avoid dynamic indexing of process.env or import.meta.env.`,
            affectedFiles: [file],
            evidence: {
              metricName: 'dynamicEnvAccess',
              measuredValue: expr,
              trace: [file, expr],
              details: `Dynamic environment variable access '${expr}' in client file '${file}' cannot be verified statically.`
            },
            relatedRequirementIds: [],
            relatedDecisionIds: []
          });
        }
      }
    }

    // C. Explicit Human-Approved Project Decisions from decisions.json
    try {
      const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
      let decisionsDoc: any = null;
      try {
        const raw = fs.readFileSync(path.join(zenitchDir, 'decisions.json'), 'utf8');
        decisionsDoc = JSON.parse(raw);
      } catch {
        // Fallback
      }

      if (decisionsDoc && decisionsDoc.items) {
        for (const [id, dec] of Object.entries<any>(decisionsDoc.items)) {
          // Check if decision is human-approved and specifies an architectural rule
          const isHumanApproved =
            dec.status === 'APPROVED' ||
            dec.disposition === 'ACCEPTED' ||
            (dec.provenance && (dec.provenance.source === 'USER' || dec.provenance.verificationLevel === 'USER_CONFIRMED'));

          if (!isHumanApproved) continue;

          // Check for structured rule or textual rule
          const rules = this.extractDecisionRules(dec);
          for (const rule of rules) {
            // Check imports against rule
            for (const [importingFile, neighbors] of graphResult.adjacencyList.entries()) {
              if (this.matchesPattern(importingFile, rule.fromPattern)) {
                for (const target of neighbors) {
                  if (this.matchesPattern(target, rule.disallowedPattern)) {
                    findings.push({
                      id: `finding-decision-${dec.id}-${importingFile.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
                      ruleId: dec.id,
                      category: 'LAYER_RULE_VIOLATION',
                      severity: 'HIGH',
                      factConfidence: 1.0,
                      title: `Architectural constraint violated: ${dec.title || dec.id}`,
                      fact: `File '${importingFile}' violates architectural decision ${dec.id}: imports '${target}'.`,
                      signal: `Module import violates documented human-approved project architecture constraint (${dec.id}).`,
                      potentialRisk: 'Violates established architectural boundaries, potentially increasing coupling and technical debt.',
                      recommendedAction: `Refactor import to comply with decision ${dec.id} (${dec.title || ''}).`,
                      affectedFiles: [importingFile, target],
                      evidence: {
                        metricName: 'decisionConstraintViolation',
                        measuredValue: `${importingFile} -> ${target}`,
                        trace: [importingFile, target]
                      },
                      relatedRequirementIds: [],
                      relatedDecisionIds: [dec.id]
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // Safe fallback if decisions.json cannot be read
    }
  }

  /**
   * Check 3: Complexity Boundary Signals (LOC > 800, Nesting > 5)
   */
  private static checkComplexityBoundaries(
    scannedFiles: string[],
    fileContents: Map<string, string>,
    maxLineLength: number,
    findings: ArchitectureFinding[]
  ): void {
    for (const file of scannedFiles) {
      const content = fileContents.get(file);
      if (!content) continue;

      const lines = content.split(/\r?\n/);
      const loc = lines.length;

      // 1. File size > 800 LOC
      if (loc > 800) {
        findings.push({
          id: `finding-loc-${file.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          ruleId: 'RULE-BUILTIN-FILE-SIZE-BOUNDARY',
          category: 'COMPLEXITY_BOUNDARY',
          severity: 'MEDIUM',
          factConfidence: 1.0,
          title: `File exceeds 800 lines of code: ${file}`,
          fact: `File '${file}' contains ${loc} lines of code (boundary: 800).`,
          signal: 'Large source file may indicate multiple responsibilities or excessive module scope.',
          potentialRisk: 'High line count can make files harder to navigate, review, and maintain over time.',
          recommendedAction: 'Consider breaking down large components or modules into smaller, single-responsibility units if maintainability is impaired.',
          affectedFiles: [file],
          evidence: {
            metricName: 'physicalLOC',
            measuredValue: loc,
            threshold: 800,
            lineNumbers: [loc]
          },
          relatedRequirementIds: [],
          relatedDecisionIds: []
        });
      }

      // 2. Nesting depth > 5
      let maxDepth = 0;
      let currentBraceDepth = 0;

      for (const rawLine of lines) {
        const line = rawLine.length > maxLineLength ? rawLine.slice(0, maxLineLength) : rawLine;
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

        let indentDepth = 0;
        const indentMatch = line.match(/^(\s+)/);
        if (indentMatch) {
          const indentStr = indentMatch[1];
          let spaceCount = 0;
          for (let i = 0; i < indentStr.length; i++) {
            if (indentStr[i] === '\t') {
              indentDepth += 1;
            } else if (indentStr[i] === ' ') {
              spaceCount += 1;
              if (spaceCount % 2 === 0) indentDepth += 1;
            }
          }
        }

        for (let i = 0; i < line.length; i++) {
          if (line[i] === '{') currentBraceDepth++;
          if (line[i] === '}') currentBraceDepth = Math.max(0, currentBraceDepth - 1);
        }

        const effectiveDepth = Math.max(indentDepth, currentBraceDepth);
        if (effectiveDepth > maxDepth) {
          maxDepth = effectiveDepth;
        }
      }

      if (maxDepth > 5) {
        findings.push({
          id: `finding-nesting-${file.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          ruleId: 'RULE-BUILTIN-NESTING-DEPTH-BOUNDARY',
          category: 'COMPLEXITY_BOUNDARY',
          severity: 'LOW',
          factConfidence: 1.0,
          title: `Maximum nesting depth exceeds 5 in ${file}`,
          fact: `File '${file}' reaches a nesting depth of ${maxDepth} (boundary: 5).`,
          signal: 'Deeply nested control structures or blocks (> 5 levels).',
          potentialRisk: 'Deep nesting can increase cognitive load, making control flow harder to reason about and test thoroughly.',
          recommendedAction: 'Consider using guard clauses, early returns, or extracting nested helper functions to flatten control flow.',
          affectedFiles: [file],
          evidence: {
            metricName: 'maxNestingDepth',
            measuredValue: maxDepth,
            threshold: 5
          },
          relatedRequirementIds: [],
          relatedDecisionIds: []
        });
      }
    }
  }

  /**
   * Check 4: Swallowed / Empty Catch Detection
   */
  private static checkSwallowedCatches(
    scannedFiles: string[],
    fileContents: Map<string, string>,
    findings: ArchitectureFinding[]
  ): void {
    for (const file of scannedFiles) {
      const content = fileContents.get(file);
      if (!content) continue;

      const catchRegex = /catch\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\}/g;
      let match: RegExpExecArray | null;

      while ((match = catchRegex.exec(content)) !== null) {
        const catchBody = match[1];
        const cleanBody = catchBody
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n\r]*/g, '')
          .trim();

        const isCompletelyEmpty = cleanBody.length === 0 || cleanBody === ';';

        const hasHandling = /(?:throw|return|console\.|logger\.|log\(|warn\(|error\(|fallback|handle|notify|track|res\.|dispatch|reject|next|toast)/i.test(cleanBody);

        if (isCompletelyEmpty || !hasHandling) {
          const matchIndex = match.index;
          const lineNum = content.slice(0, matchIndex).split(/\r?\n/).length;

          findings.push({
            id: `finding-catch-${file.replace(/[^a-zA-Z0-9_-]/g, '_')}-line${lineNum}`,
            ruleId: 'RULE-BUILTIN-SWALLOWED-CATCH',
            category: 'SWALLOWED_ERROR',
            severity: 'MEDIUM',
            factConfidence: 1.0,
            title: `Empty or swallowed catch block detected in ${file}`,
            fact: `File '${file}' contains an empty or unhandled catch block at line ${lineNum}.`,
            signal: 'Catch block silently ignores exceptions without handling, rethrow, or logging.',
            potentialRisk: 'Silently swallowed errors can mask unexpected failures, corrupt state, and make root-cause debugging difficult.',
            recommendedAction: 'Ensure exceptions are logged, handled with appropriate fallback behavior, or rethrown.',
            affectedFiles: [file],
            evidence: {
              metricName: 'swallowedCatchBlock',
              measuredValue: 0,
              lineNumbers: [lineNum]
            },
            relatedRequirementIds: [],
            relatedDecisionIds: []
          });
        }
      }
    }
  }

  /**
   * Check 5: Unreferenced Declared Dependencies
   */
  private static checkUnreferencedDependencies(
    projectRoot: string,
    scannedFiles: string[],
    fileContents: Map<string, string>,
    findings: ArchitectureFinding[]
  ): void {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return;

    try {
      const pkgContent = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(pkgContent);
      const dependencies = pkg.dependencies || {};

      const allReferencedSpecifiers = new Set<string>();
      for (const [_, content] of fileContents.entries()) {
        const specifiers = DependencyGraph.extractSpecifiers(content);
        for (const spec of specifiers) {
          allReferencedSpecifiers.add(spec);
        }
      }

      for (const depName of Object.keys(dependencies)) {
        if (this.isDependencyWhitelisted(depName)) {
          continue;
        }

        let isReferenced = false;
        for (const spec of allReferencedSpecifiers) {
          if (spec === depName || spec.startsWith(depName + '/')) {
            isReferenced = true;
            break;
          }
        }

        if (!isReferenced) {
          findings.push({
            id: `finding-unref-dep-${depName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
            ruleId: 'RULE-BUILTIN-UNREFERENCED-DEPENDENCY',
            category: 'UNREFERENCED_DECLARED_DEPENDENCY',
            severity: 'LOW',
            factConfidence: 1.0,
            title: `Declared dependency has no static source references: ${depName}`,
            fact: `Package '${depName}' is declared in dependencies but no static import/require reference was detected across ${scannedFiles.length} scanned files.`,
            signal: 'Declared package is not statically imported in any analyzed project source file.',
            potentialRisk: 'Unreferenced packages may bloat node_modules and bundle size if bundled, or represent abandoned dependencies.',
            recommendedAction: `Verify whether '${depName}' is used via dynamic imports, CLI commands, build plugins, or configuration files. If completely unused, consider removing it.`,
            affectedFiles: ['package.json'],
            evidence: {
              metricName: 'staticImportReferences',
              measuredValue: 0,
              threshold: 1
            },
            relatedRequirementIds: [],
            relatedDecisionIds: []
          });
        }
      }
    } catch {
      // Safe fallback on package.json parsing error
    }
  }

  public static isDependencyWhitelisted(dep: string): boolean {
    if (dep.startsWith('@types/')) return true;
    if (dep.startsWith('@babel/')) return true;
    if (dep.startsWith('@tsconfig/')) return true;
    if (dep.startsWith('@vitejs/')) return true;
    if (dep.startsWith('@testing-library/')) return true;
    if (dep.startsWith('@playwright/')) return true;
    if (dep.startsWith('@eslint/')) return true;
    if (this.DEPENDENCY_WHITELIST.has(dep)) return true;
    return false;
  }

  private static isClientComponent(content: string): boolean {
    const head = content.slice(0, 500);
    return /['"]use client['"]/.test(head);
  }

  private static isForbiddenServerModule(spec: string): boolean {
    if (this.SERVER_ONLY_MODULES.includes(spec)) return true;
    if (spec.startsWith('@prisma/')) return true;
    if (spec.startsWith('node:fs') || spec.startsWith('node:child_process') || spec.startsWith('node:crypto')) return true;
    return false;
  }

  private static extractDecisionRules(dec: any): Array<{ fromPattern: string; disallowedPattern: string }> {
    const rules: Array<{ fromPattern: string; disallowedPattern: string }> = [];

    if (dec.architecturalRule) {
      rules.push({
        fromPattern: dec.architecturalRule.from || '*',
        disallowedPattern: dec.architecturalRule.disallow || dec.architecturalRule.to || ''
      });
    }

    if (Array.isArray(dec.forbiddenImports)) {
      for (const item of dec.forbiddenImports) {
        if (item.from && (item.to || item.disallow)) {
          rules.push({ fromPattern: item.from, disallowedPattern: item.to || item.disallow });
        }
      }
    }

    const text = [dec.title, dec.decision, dec.statement, dec.rationale, Array.isArray(dec.implications) ? dec.implications.join(' ') : '']
      .filter(Boolean)
      .join(' ');

    const regex = /(?:disallow(?:ed)?|no|cannot)\s+imports?\s+from\s+['"]?([^'"\s]+)['"]?\s+(?:to|into|in)\s+['"]?([^'"\s]+)['"]?/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      rules.push({
        fromPattern: match[2],
        disallowedPattern: match[1]
      });
    }

    return rules;
  }

  private static matchesPattern(filePath: string, pattern: string): boolean {
    if (!pattern || pattern === '*') return true;
    const normPath = filePath.replace(/\\/g, '/');
    const normPattern = pattern.replace(/\\/g, '/');

    if (normPattern.includes('*')) {
      // Direct path prefix matching or glob replacement
      const basePrefix = normPattern.replace(/\*+/g, '');
      if (normPattern.endsWith('/*') || normPattern.endsWith('/**')) {
        const dirPrefix = normPattern.slice(0, normPattern.indexOf('*'));
        return normPath.startsWith(dirPrefix);
      }
      return normPath.includes(basePrefix);
    }

    return normPath.includes(normPattern);
  }

  public static discoverSourceFiles(projectRoot: string): string[] {
    const validExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
    const ignoreDirs = new Set(['node_modules', '.git', '.zenitch', 'dist', 'build', '.next', 'out', 'coverage']);
    const results: string[] = [];
    const resolvedRoot = path.resolve(projectRoot);

    const isWithinRoot = (targetPath: string): boolean => {
      try {
        const real = fs.realpathSync(targetPath);
        return real === resolvedRoot || real.startsWith(resolvedRoot + path.sep);
      } catch {
        return false;
      }
    };

    const walk = (currentDir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      entries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        if (results.length >= ArchitectureEvaluator.MAX_SCANNED_FILES) {
          return;
        }

        const fullPath = path.join(currentDir, entry.name);

        // Lexical path traversal guard
        const normFullPath = path.normalize(fullPath);
        if (!normFullPath.startsWith(resolvedRoot + path.sep) && normFullPath !== resolvedRoot) {
          continue;
        }

        // Symlink policy: check if symlink target escapes permitted root
        if (entry.isSymbolicLink()) {
          if (!isWithinRoot(fullPath)) {
            continue;
          }
        }

        let isDir = entry.isDirectory();
        let isFile = entry.isFile();
        if (entry.isSymbolicLink()) {
          try {
            const st = fs.statSync(fullPath);
            isDir = st.isDirectory();
            isFile = st.isFile();
          } catch {
            continue;
          }
        }

        const relPath = path.relative(resolvedRoot, fullPath).replace(/\\/g, '/');

        if (isDir) {
          if (!ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
            walk(fullPath);
          }
        } else if (isFile) {
          const ext = path.extname(entry.name).toLowerCase();
          if (validExtensions.has(ext)) {
            results.push(relPath);
          }
        }
      }
    };

    walk(resolvedRoot);
    return results.sort();
  }

  private static deduplicateFindings(findings: ArchitectureFinding[]): ArchitectureFinding[] {
    const seen = new Set<string>();
    const unique: ArchitectureFinding[] = [];

    for (const f of findings) {
      const key = `${f.ruleId}::${f.affectedFiles.sort().join(',')}::${JSON.stringify(f.evidence)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(f);
      }
    }

    return unique.sort((a, b) => a.id.localeCompare(b.id));
  }

  public static isClientSourceFile(file: string, content: string): boolean {
    if (this.isClientComponent(content)) return true;
    const normalized = file.replace(/\\/g, '/');
    if (/\.client\.[jt]sx?$/.test(normalized)) return true;
    if (/(?:^|\/)(?:client|components\/client)\//i.test(normalized)) return true;
    return false;
  }

  public static isFrameworkPublicVar(varName: string): boolean {
    return /^(NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_)/.test(varName);
  }

  public static hasStrongSecretIndicator(varName: string): boolean {
    const exactSecrets = [
      'DATABASE_URL',
      'DB_PASSWORD',
      'DB_PASS',
      'DB_USER',
      'SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'FIREBASE_ADMIN_CERT',
      'SESSION_SECRET',
      'JWT_SECRET',
      'AUTH_SECRET',
      'SECRET_KEY',
      'API_SECRET',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_ACCESS_KEY_ID',
      'PRIVATE_KEY',
      'REDIS_PASSWORD',
      'STRIPE_SECRET_KEY',
      'SERVICE_ROLE',
      'ADMIN_KEY',
      'MASTER_KEY'
    ];
    const normalized = varName.replace(/^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_)/, '');

    if (exactSecrets.includes(varName) || exactSecrets.includes(normalized)) {
      return true;
    }

    // Token-boundary aware matching for strong secret indicators
    if (/(?:^|_)(?:SECRET|PASSWORD|PASSWD|PRIVATE_KEY|SERVICE_ROLE|ADMIN_KEY|MASTER_KEY)(?:$|_)/i.test(varName) ||
        /(?:^|_)(?:SECRET|PASSWORD|PASSWD|PRIVATE_KEY|SERVICE_ROLE|ADMIN_KEY|MASTER_KEY)(?:$|_)/i.test(normalized)) {
      return true;
    }

    if (/(?:^|_)(?:DATABASE_URL|POSTGRES_URL|MYSQL_URL|MONGODB_URI|REDIS_URL)(?:$|_)/i.test(varName) ||
        /(?:^|_)(?:DATABASE_URL|POSTGRES_URL|MYSQL_URL|MONGODB_URI|REDIS_URL)(?:$|_)/i.test(normalized)) {
      return true;
    }

    if (/(?:^|_)[A-Z0-9_]*_TOKEN$/i.test(varName) && !/(?:CSRF|PUBLIC|ANON)_TOKEN$/i.test(varName)) {
      return true;
    }

    return false;
  }

  public static isLikelyPublicIdentifier(varName: string): boolean {
    return /(?:^|_)(?:PUBLISHABLE_KEY|PUBLIC_KEY|ANON_KEY|CLIENT_ID|APP_ID|SITE_KEY)$/i.test(varName) ||
           /(?:_PUBLISHABLE_KEY|_PUBLIC_KEY|_ANON_KEY|_CLIENT_ID|_APP_ID|_SITE_KEY)(?:_|$)/i.test(varName);
  }

  public static isSuspiciousClientSecret(varName: string): boolean {
    // 1. Explicitly recognized safe runtime variables
    if (['NODE_ENV', 'CI', 'PORT', 'TZ', 'DEBUG', 'HOST', 'HOSTNAME', 'BASE_URL', 'MODE', 'DEV', 'PROD', 'SSR'].includes(varName)) {
      return false;
    }

    // 2. Strong secret indicators ALWAYS trigger regardless of public prefix
    // (e.g. NEXT_PUBLIC_STRIPE_SECRET_KEY, VITE_DATABASE_PASSWORD, PUBLIC_JWT_SECRET)
    if (this.hasStrongSecretIndicator(varName)) {
      return true;
    }

    // 3. Known public identifiers without secret indicators are safe
    // (e.g. STRIPE_PUBLISHABLE_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, VITE_SUPABASE_ANON_KEY)
    if (this.isLikelyPublicIdentifier(varName)) {
      return false;
    }

    // 4. Framework public variables without strong secret indicators are safe
    // (e.g. NEXT_PUBLIC_APP_TITLE, VITE_API_URL)
    if (this.isFrameworkPublicVar(varName)) {
      return false;
    }

    // 5. General secret heuristics (for variables in client files lacking public prefixes)
    if (/(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|SIGNING|CERT)(?:$|_)/i.test(varName)) {
      return true;
    }

    return false;
  }

  public static extractEnvReferencesDetailed(
    content: string,
    maxLineLength = 10000
  ): {
    resolvedVarNames: string[];
    dynamicExpressions: string[];
  } {
    const resolvedSet = new Set<string>();
    const dynamicSet = new Set<string>();

    if (!content.includes('process.env') && !content.includes('import.meta.env')) {
      return { resolvedVarNames: [], dynamicExpressions: [] };
    }

    try {
      // 1. Statically extract constant string aliases: const key = "JWT_SECRET";
      const stringConstants = new Map<string, string>();
      const constDeclRegex = /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*['"]([A-Z0-9_]+)['"]/g;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = constDeclRegex.exec(content)) !== null) {
        stringConstants.set(cMatch[1], cMatch[2]);
      }

      // 2. Strip multi-line comments
      const sanitized = content.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
      const lines = sanitized.split(/\r?\n/);

      for (let rawLine of lines) {
        if (!rawLine.includes('process.env') && !rawLine.includes('import.meta.env')) {
          continue;
        }
        let line = rawLine.length > maxLineLength ? rawLine.slice(0, maxLineLength) : rawLine;
        const commentIdx = line.indexOf('//');
        if (commentIdx !== -1 && (commentIdx === 0 || line[commentIdx - 1] !== ':')) {
          line = line.slice(0, commentIdx);
          if (!line.includes('process.env') && !line.includes('import.meta.env')) {
            continue;
          }
        }

        // Bracket property accesses: literals, constant aliases, or dynamic expressions
        const bracketRegex = /(?:process\.env|import\.meta\.env)\[\s*([^\]]+)\s*\]/g;
        let bMatch: RegExpExecArray | null;
        while ((bMatch = bracketRegex.exec(line)) !== null) {
          const inner = bMatch[1].trim();
          const literalMatch = inner.match(/^['"]([a-zA-Z0-9_]+)['"]$/);
          if (literalMatch) {
            resolvedSet.add(literalMatch[1]);
          } else if (stringConstants.has(inner)) {
            resolvedSet.add(stringConstants.get(inner)!);
          } else {
            dynamicSet.add(bMatch[0]);
          }
        }

        // D. Dot access: process.env.VAR_NAME or import.meta.env.VAR_NAME
        const dotRegex = /(?:process\.env|import\.meta\.env)\.([A-Z0-9_]+)/g;
        let dMatch: RegExpExecArray | null;
        while ((dMatch = dotRegex.exec(line)) !== null) {
          if (dMatch[1]) resolvedSet.add(dMatch[1]);
        }

        // E. Destructuring: const { VAR_NAME } = process.env;
        const destructureRegex = /(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*(?:process\.env|import\.meta\.env)/g;
        let desMatch: RegExpExecArray | null;
        while ((desMatch = destructureRegex.exec(line)) !== null) {
          const parts = desMatch[1].split(',');
          for (const rawPart of parts) {
            const part = rawPart.trim();
            if (!part) continue;
            const eqIdx = part.indexOf('=');
            const left = eqIdx !== -1 ? part.slice(0, eqIdx).trim() : part;
            const colonIdx = left.indexOf(':');
            const varName = (colonIdx !== -1 ? left.slice(0, colonIdx).trim() : left).trim();
            if (/^[A-Z0-9_]+$/.test(varName)) {
              resolvedSet.add(varName);
            }
          }
        }
      }
    } catch {
      // Parser failure handled gracefully without crashing overall scan
    }

    return {
      resolvedVarNames: Array.from(resolvedSet),
      dynamicExpressions: Array.from(dynamicSet)
    };
  }

  public static extractEnvVariableNames(content: string, maxLineLength = 10000): string[] {
    return this.extractEnvReferencesDetailed(content, maxLineLength).resolvedVarNames;
  }
}
