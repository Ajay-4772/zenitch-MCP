import fs from 'node:fs';
import path from 'node:path';
import { StorageEngine } from '../memory/storage-engine.js';
import { GitInspector } from '../memory/git-inspector.js';
import { StaticVerifier } from '../verification/static-verifier.js';
import {
  ReadinessCategory,
  ReadinessFinding,
  CategoryReadiness,
  RequirementsFileSchema,
  VerificationFileSchema,
  RequirementRecord
} from '../schemas/memory.schema.js';

export class ReadinessEvaluator {
  private static readonly SECRET_PATTERNS = [
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
    { name: 'JWT Token', regex: /eyJ[-a-zA-Z0-9_]{10,}\.[-a-zA-Z0-9_]{10,}\.[-a-zA-Z0-9_]{10,}/g },
    { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
    { name: 'Hardcoded Secret Assignment', regex: /(?:api[_-]?key|secret|password|auth_token)\s*=\s*["'][-a-zA-Z0-9_.]{12,}["']/gi }
  ];

  /**
   * Helper to check if file content contains hardcoded secrets
   */
  public static scanForSecrets(content: string): string | null {
    for (const pattern of this.SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(content)) {
        return pattern.name;
      }
    }
    return null;
  }

  /**
   * 1. Evaluate Requirements Readiness
   */
  public static evaluateRequirements(projectRoot: string): CategoryReadiness {
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const findings: ReadinessFinding[] = [];

    const reqDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'requirements.json',
      RequirementsFileSchema,
      () => null
    );

    if (!reqDoc || !reqDoc.items || Object.keys(reqDoc.items).length === 0) {
      findings.push({
        id: 'FIND-REQ-NONE',
        category: 'REQUIREMENTS',
        severity: 'LOW',
        status: 'INFO',
        isBlocking: false,
        summary: 'No persistent requirements recorded in .zenitch/requirements.json.',
        timestamp: new Date().toISOString()
      });

      return {
        category: 'REQUIREMENTS',
        status: 'READY',
        summary: 'No requirements defined for project.',
        blockingFindings: 0,
        attentionFindings: 0,
        findings
      };
    }

    let blockingCount = 0;
    let attentionCount = 0;

    for (const req of Object.values<RequirementRecord>(reqDoc.items)) {
      // Check for pending approval tickets (Concrete release blocker)
      if (reqDoc.tickets) {
        for (const ticket of Object.values<any>(reqDoc.tickets)) {
          if (ticket.requirementId === req.id && ticket.status === 'PENDING') {
            blockingCount++;
            findings.push({
              id: 'FIND-TICKET-' + ticket.ticketId,
              category: 'REQUIREMENTS',
              severity: 'CRITICAL',
              status: 'FAIL',
              isBlocking: true,
              summary: 'Requirement "' + req.title + '" has pending human approval ticket ' + ticket.ticketId + '.',
              remediation: 'Resolve human approval ticket via zenitch_manage_requirement (RESOLVE_APPROVAL).',
              requirementIds: [req.id],
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      // Check requirement lifecycle states
      if (req.priority === 'must_have') {
        if (req.status === 'BLOCKED') {
          blockingCount++;
          findings.push({
            id: 'FIND-REQ-BLOCKED-' + req.id,
            category: 'REQUIREMENTS',
            severity: 'CRITICAL',
            status: 'FAIL',
            isBlocking: true,
            summary: 'Mandatory requirement "' + req.title + '" (' + req.id + ') is in BLOCKED state.',
            remediation: 'Resolve blocking dependency or issue for ' + req.id + '.',
            requirementIds: [req.id],
            timestamp: new Date().toISOString()
          });
        } else if (req.status === 'REJECTED') {
          blockingCount++;
          findings.push({
            id: 'FIND-REQ-REJECTED-' + req.id,
            category: 'REQUIREMENTS',
            severity: 'CRITICAL',
            status: 'FAIL',
            isBlocking: true,
            summary: 'Mandatory requirement "' + req.title + '" (' + req.id + ') was REJECTED.',
            remediation: 'Revise rejected requirement or adjust priority before release.',
            requirementIds: [req.id],
            timestamp: new Date().toISOString()
          });
        } else if (req.status === 'REQUESTED' || req.status === 'PLANNED' || req.status === 'UNVERIFIED') {
          // Release risk: HIGH severity, but non-blocking (NEEDS_ATTENTION) unless failed
          attentionCount++;
          findings.push({
            id: 'FIND-REQ-INCOMPLETE-' + req.id,
            category: 'REQUIREMENTS',
            severity: 'HIGH',
            status: 'WARN',
            isBlocking: false,
            summary: 'Mandatory requirement "' + req.title + '" (' + req.id + ') is still ' + req.status + '.',
            remediation: 'Complete implementation and verification for ' + req.id + '.',
            requirementIds: [req.id],
            timestamp: new Date().toISOString()
          });
        }
      }

      // Check structured acceptance criteria
      if (Array.isArray(req.acceptanceCriteria)) {
        for (let cIdx = 0; cIdx < req.acceptanceCriteria.length; cIdx++) {
          const rawCrit = req.acceptanceCriteria[cIdx];
          const crit = typeof rawCrit === 'object' && rawCrit !== null
            ? rawCrit
            : { id: `crit-${cIdx + 1}`, description: String(rawCrit), status: 'NOT_TESTED' as const };

          if (crit.status === 'FAILED') {
            // Concrete blocker: mandatory criteria failed
            blockingCount++;
            findings.push({
              id: 'FIND-CRIT-FAIL-' + crit.id,
              category: 'REQUIREMENTS',
              severity: 'CRITICAL',
              status: 'FAIL',
              isBlocking: true,
              summary: 'Acceptance criterion "' + crit.description + '" (' + crit.id + ') has FAILED status.',
              remediation: 'Fix underlying implementation and re-verify criterion ' + crit.id + '.',
              requirementIds: [req.id],
              criterionIds: [crit.id],
              timestamp: new Date().toISOString()
            });
          } else if (crit.status === 'BLOCKED') {
            // Concrete blocker: mandatory criteria blocked
            blockingCount++;
            findings.push({
              id: 'FIND-CRIT-BLOCKED-' + crit.id,
              category: 'REQUIREMENTS',
              severity: 'CRITICAL',
              status: 'FAIL',
              isBlocking: true,
              summary: 'Acceptance criterion "' + crit.description + '" (' + crit.id + ') is BLOCKED.',
              remediation: 'Resolve blocking impediment for criterion ' + crit.id + '.',
              requirementIds: [req.id],
              criterionIds: [crit.id],
              timestamp: new Date().toISOString()
            });
          } else if (req.priority === 'must_have' && crit.status === 'NOT_TESTED') {
            // Non-blocking attention
            attentionCount++;
            findings.push({
              id: 'FIND-CRIT-UNTESTED-' + crit.id,
              category: 'REQUIREMENTS',
              severity: 'MEDIUM',
              status: 'WARN',
              isBlocking: false,
              summary: 'Mandatory criterion "' + crit.description + '" (' + crit.id + ') is NOT_TESTED.',
              remediation: 'Run verification via zenitch_verify for criterion ' + crit.id + '.',
              requirementIds: [req.id],
              criterionIds: [crit.id],
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    }

    const status = blockingCount > 0 ? 'BLOCKED' : attentionCount > 0 ? 'NEEDS_ATTENTION' : 'READY';
    const summary = status === 'READY'
      ? 'All requirements and acceptance criteria are satisfied.'
      : status === 'BLOCKED'
      ? 'Requirements evaluation BLOCKED: ' + blockingCount + ' critical issues.'
      : 'Requirements evaluation NEEDS_ATTENTION: ' + attentionCount + ' pending issues.';

    return {
      category: 'REQUIREMENTS',
      status,
      summary,
      blockingFindings: blockingCount,
      attentionFindings: attentionCount,
      findings
    };
  }

  /**
   * 2. Evaluate Verification Readiness
   */
  public static evaluateVerification(projectRoot: string): CategoryReadiness {
    const zenitchDir = StorageEngine.getZenitchDir(projectRoot);
    const findings: ReadinessFinding[] = [];

    const verDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'verification.json',
      VerificationFileSchema,
      () => null
    );

    if (!verDoc || !verDoc.items || Object.keys(verDoc.items).length === 0) {
      findings.push({
        id: 'FIND-VERIF-NONE',
        category: 'VERIFICATION',
        severity: 'MEDIUM',
        status: 'WARN',
        isBlocking: false,
        summary: 'No verification evidence recorded in .zenitch/verification.json.',
        remediation: 'Execute static or runtime verification using zenitch_verify.',
        timestamp: new Date().toISOString()
      });

      return {
        category: 'VERIFICATION',
        status: 'NEEDS_ATTENTION',
        summary: 'Verification evidence is absent.',
        blockingFindings: 0,
        attentionFindings: 1,
        findings
      };
    }

    let blockingCount = 0;
    let attentionCount = 0;

    for (const record of Object.values<any>(verDoc.items)) {
      if (record.verdict === 'FAILED') {
        // Concrete release blocker
        blockingCount++;
        findings.push({
          id: 'FIND-VERIF-FAILED-' + record.id,
          category: 'VERIFICATION',
          severity: 'CRITICAL',
          status: 'FAIL',
          isBlocking: true,
          summary: 'Verification ' + record.id + ' recorded FAILED verdict: ' + record.evidenceSummary,
          remediation: 'Address defect and run zenitch_verify.',
          requirementIds: record.requirementId ? [record.requirementId] : undefined,
          criterionIds: record.acceptanceCriterionId ? [record.acceptanceCriterionId] : undefined,
          verificationIds: [record.id],
          timestamp: new Date().toISOString()
        });
      } else if (record.verdict === 'BLOCKED') {
        // Concrete release blocker: required verification blocked
        blockingCount++;
        findings.push({
          id: 'FIND-VERIF-BLOCKED-' + record.id,
          category: 'VERIFICATION',
          severity: 'HIGH',
          status: 'FAIL',
          isBlocking: true,
          summary: 'Verification ' + record.id + ' was BLOCKED: ' + record.evidenceSummary,
          remediation: 'Resolve blocking environment or network issue and re-verify.',
          requirementIds: record.requirementId ? [record.requirementId] : undefined,
          criterionIds: record.acceptanceCriterionId ? [record.acceptanceCriterionId] : undefined,
          verificationIds: [record.id],
          timestamp: new Date().toISOString()
        });
      } else if (record.verdict === 'OUTDATED') {
        // Non-blocking attention
        attentionCount++;
        findings.push({
          id: 'FIND-VERIF-OUTDATED-' + record.id,
          category: 'VERIFICATION',
          severity: 'MEDIUM',
          status: 'WARN',
          isBlocking: false,
          summary: 'Verification ' + record.id + ' is OUTDATED due to subsequent code or requirement changes.',
          remediation: 'Re-run verification with forceReverify: true.',
          requirementIds: record.requirementId ? [record.requirementId] : undefined,
          criterionIds: record.acceptanceCriterionId ? [record.acceptanceCriterionId] : undefined,
          verificationIds: [record.id],
          timestamp: new Date().toISOString()
        });
      }
    }

    const status = blockingCount > 0 ? 'BLOCKED' : attentionCount > 0 ? 'NEEDS_ATTENTION' : 'READY';
    const summary = status === 'READY'
      ? 'Verification evidence is fresh and passed.'
      : status === 'BLOCKED'
      ? 'Verification BLOCKED: ' + blockingCount + ' failed or blocked records.'
      : 'Verification NEEDS_ATTENTION: ' + attentionCount + ' outdated records.';

    return {
      category: 'VERIFICATION',
      status,
      summary,
      blockingFindings: blockingCount,
      attentionFindings: attentionCount,
      findings
    };
  }

  /**
   * 3. Evaluate Build Readiness
   */
  public static evaluateBuild(projectRoot: string): CategoryReadiness {
    const findings: ReadinessFinding[] = [];
    const pkgPath = path.join(projectRoot, 'package.json');
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');

    let blockingCount = 0;
    let attentionCount = 0;

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const hasTs = fs.existsSync(tsconfigPath);
        const hasBuildScript = Boolean(pkg.scripts?.build);

        if (hasTs && !hasBuildScript) {
          // Non-blocking high-risk finding: tsconfig without build script needs attention
          attentionCount++;
          findings.push({
            id: 'FIND-BUILD-MISSING-SCRIPT',
            category: 'BUILD',
            severity: 'HIGH',
            status: 'WARN',
            isBlocking: false,
            summary: 'TypeScript configuration (tsconfig.json) detected, but package.json lacks a "build" script.',
            remediation: 'Add a "build": "tsc" or appropriate build script to package.json.',
            affectedFiles: ['package.json', 'tsconfig.json'],
            timestamp: new Date().toISOString()
          });
        } else if (hasBuildScript) {
          findings.push({
            id: 'FIND-BUILD-OK',
            category: 'BUILD',
            severity: 'INFO',
            status: 'PASS',
            isBlocking: false,
            summary: 'Build script defined: "' + pkg.scripts.build + '".',
            affectedFiles: ['package.json'],
            timestamp: new Date().toISOString()
          });
        } else {
          findings.push({
            id: 'FIND-BUILD-NOT-REQUIRED',
            category: 'BUILD',
            severity: 'INFO',
            status: 'INFO',
            isBlocking: false,
            summary: 'No compile/build script required for this project structure.',
            timestamp: new Date().toISOString()
          });
        }
      } catch (err: any) {
        // Concrete release blocker: demonstrably broken/corrupt package manifest
        blockingCount++;
        findings.push({
          id: 'FIND-BUILD-PKG-CORRUPT',
          category: 'BUILD',
          severity: 'CRITICAL',
          status: 'FAIL',
          isBlocking: true,
          summary: 'package.json is malformed or unreadable: ' + err.message,
          remediation: 'Fix syntax error in package.json.',
          affectedFiles: ['package.json'],
          timestamp: new Date().toISOString()
        });
      }
    } else {
      findings.push({
        id: 'FIND-BUILD-NO-MANIFEST',
        category: 'BUILD',
        severity: 'INFO',
        status: 'INFO',
        isBlocking: false,
        summary: 'No package manifest detected.',
        timestamp: new Date().toISOString()
      });
    }

    const status = blockingCount > 0 ? 'BLOCKED' : attentionCount > 0 ? 'NEEDS_ATTENTION' : 'READY';
    return {
      category: 'BUILD',
      status,
      summary: status === 'READY' ? 'Build configuration is valid.' : status === 'BLOCKED' ? 'Build configuration is broken.' : 'Build configuration needs attention.',
      blockingFindings: blockingCount,
      attentionFindings: attentionCount,
      findings
    };
  }

  /**
   * 4. Evaluate Test Readiness
   */
  public static evaluateTests(projectRoot: string): CategoryReadiness {
    const findings: ReadinessFinding[] = [];
    const pkgPath = path.join(projectRoot, 'package.json');

    let attentionCount = 0;
    let hasTestScript = false;

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts?.test && !pkg.scripts.test.includes('no test specified')) {
          hasTestScript = true;
          findings.push({
            id: 'FIND-TEST-SCRIPT',
            category: 'TESTS',
            severity: 'INFO',
            status: 'PASS',
            isBlocking: false,
            summary: 'Test script configured: "' + pkg.scripts.test + '".',
            affectedFiles: ['package.json'],
            timestamp: new Date().toISOString()
          });
        }
      } catch {
        // ignore
      }
    }

    // Scan for test files
    const testDirs = ['tests', '__tests__', 'test'];
    let testFilesCount = 0;
    for (const td of testDirs) {
      const p = path.join(projectRoot, td);
      if (fs.existsSync(p)) {
        const files = StaticVerifier.scanFiles(p);
        testFilesCount += files.length;
      }
    }

    if (testFilesCount > 0) {
      findings.push({
        id: 'FIND-TEST-FILES',
        category: 'TESTS',
        severity: 'INFO',
        status: 'PASS',
        isBlocking: false,
        summary: 'Found ' + testFilesCount + ' test files in project test directories.',
        timestamp: new Date().toISOString()
      });
    } else if (!hasTestScript) {
      // Non-blocking hygiene warning
      attentionCount++;
      findings.push({
        id: 'FIND-TEST-MISSING',
        category: 'TESTS',
        severity: 'MEDIUM',
        status: 'WARN',
        isBlocking: false,
        summary: 'No test scripts or test directories detected.',
        remediation: 'Configure automated test suite and add tests before production release.',
        timestamp: new Date().toISOString()
      });
    }

    const status = attentionCount > 0 ? 'NEEDS_ATTENTION' : 'READY';
    return {
      category: 'TESTS',
      status,
      summary: status === 'READY' ? 'Automated test suite configured.' : 'Automated test configuration incomplete.',
      blockingFindings: 0,
      attentionFindings: attentionCount,
      findings
    };
  }

  /**
   * 5. Evaluate Security Readiness
   */
  public static evaluateSecurity(projectRoot: string): CategoryReadiness {
    const findings: ReadinessFinding[] = [];
    let blockingCount = 0;
    let attentionCount = 0;

    const { files: sourceFiles, boundaryReached } = StaticVerifier.scanFilesWithBoundary(projectRoot, 5, 1000);
    let skippedOversizedCount = 0;

    for (const file of sourceFiles) {
      const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
      // Skip test files, mock files, and configuration examples
      if (
        relPath.includes('test') ||
        relPath.includes('mock') ||
        relPath.includes('example') ||
        relPath.endsWith('.md')
      ) {
        continue;
      }

      try {
        const stat = fs.statSync(file);
        if (stat.size > StaticVerifier.MAX_FILE_SIZE) {
          skippedOversizedCount++;
          continue;
        }

        const content = fs.readFileSync(file, 'utf8');
        const matchedSecret = this.scanForSecrets(content);
        if (matchedSecret) {
          // Concrete release blocker: exposed secret in source file
          blockingCount++;
          findings.push({
            id: 'FIND-SEC-SECRET-' + Math.random().toString(36).substring(2, 6),
            category: 'SECURITY',
            severity: 'CRITICAL',
            status: 'FAIL',
            isBlocking: true,
            summary: 'Hardcoded ' + matchedSecret + ' detected in ' + relPath + '.',
            remediation: 'Move sensitive credentials to environment variables or secret manager.',
            affectedFiles: [relPath],
            timestamp: new Date().toISOString()
          });
        }
      } catch {
        // ignore unreadable
      }
    }

    if (skippedOversizedCount > 0) {
      findings.push({
        id: 'FIND-SEC-OVERSIZED-SKIPPED',
        category: 'SECURITY',
        severity: 'INFO',
        status: 'WARN',
        isBlocking: false,
        summary: skippedOversizedCount + ' oversized file(s) (>512KB) skipped from secret scanning.',
        timestamp: new Date().toISOString()
      });
    }

    if (boundaryReached) {
      attentionCount++;
      findings.push({
        id: 'FIND-SEC-SCAN-BOUNDED',
        category: 'SECURITY',
        severity: 'INFO',
        status: 'WARN',
        isBlocking: false,
        summary: 'Security file scan reached configured boundary limit (1000 files). Analysis is PARTIAL.',
        timestamp: new Date().toISOString()
      });
    }

    const status = blockingCount > 0 ? 'BLOCKED' : attentionCount > 0 ? 'NEEDS_ATTENTION' : 'READY';
    return {
      category: 'SECURITY',
      status,
      summary: status === 'READY' ? 'No obvious security vulnerabilities or hardcoded secrets detected.' : 'Security evaluation BLOCKED: ' + blockingCount + ' critical issues.',
      blockingFindings: blockingCount,
      attentionFindings: attentionCount,
      findings
    };
  }

  public static readonly STANDARD_RUNTIME_VARS = new Set([
    'NODE_ENV',
    'CI',
    'PORT',
    'TZ',
    'DEBUG',
    'HOST',
    'HOSTNAME',
    'PWD',
    'HOME',
    'PATH'
  ]);

  public static isFrameworkPublicVar(varName: string): boolean {
    return /^(NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_)/.test(varName);
  }

  /**
   * Parse .env.example or .env.template securely.
   * Extracts ONLY variable names. Never reads or stores actual credential values!
   */
  public static parseEnvTemplate(filePath: string): Set<string> {
    const documented = new Set<string>();
    if (!fs.existsSync(filePath)) return documented;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        const match = /^(?:export\s+)?([A-Z0-9_]+)(?:\s*=.*)?$/.exec(line);
        if (match && match[1]) {
          documented.add(match[1]);
        }
      }
    } catch {
      // Ignore unreadable template file
    }
    return documented;
  }

  /**
   * Extract statically identifiable process.env and import.meta.env references.
   * Strips comments and string literals, recognizes direct fallback expressions (||, ??),
   * recognizes destructuring defaults, and detects dynamic property access.
   */
  public static extractEnvReferences(
    content: string,
    maxLineLength = 10000
  ): {
    references: Array<{ name: string; hasFallback: boolean; line: number }>;
    dynamicCount: number;
    dynamicExpressions: string[];
  } {
    const references: Array<{ name: string; hasFallback: boolean; line: number }> = [];
    const dynamicExpressions: string[] = [];
    let dynamicCount = 0;

    // Fast path: skip file if neither process.env nor import.meta.env is mentioned
    if (!content.includes('process.env') && !content.includes('import.meta.env')) {
      return { references, dynamicCount, dynamicExpressions };
    }

    // 1. Strip multi-line comments: /* ... */
    const sanitized = content.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

    // 2. Process line by line
    const lines = sanitized.split(/\r?\n/);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      let line = lines[lineIdx];
      // Fast path: skip line if neither process.env nor import.meta.env is mentioned
      if (!line.includes('process.env') && !line.includes('import.meta.env')) {
        continue;
      }
      if (line.length > maxLineLength) {
        line = line.slice(0, maxLineLength);
      }

      // Strip single-line comments
      const commentIdx = line.indexOf('//');
      if (commentIdx !== -1 && (commentIdx === 0 || line[commentIdx - 1] !== ':')) {
        line = line.slice(0, commentIdx);
      }

      // Protect bracket access with string literal
      const protectedBrackets: string[] = [];
      line = line.replace(/(?:process\.env|import\.meta\.env)\[\s*(['"][A-Z0-9_]+['"])\s*\]/g, (m, varStr) => {
        const token = `__ENV_BRACKET_${protectedBrackets.length}__`;
        protectedBrackets.push(varStr);
        return m.replace(varStr, token);
      });

      // Remove string literals
      line = line.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`[\s\S]*?`/g, '""');

      // Restore protected brackets
      line = line.replace(/__ENV_BRACKET_(\d+)__/g, (_m, idx) => protectedBrackets[Number(idx)]);

      // Check for destructuring: const { PORT = 3000, NODE_ENV } = process.env;
      const destructureRegex = /(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*(?:process\.env|import\.meta\.env)/g;
      let dMatch: RegExpExecArray | null;
      while ((dMatch = destructureRegex.exec(line)) !== null) {
        const parts = dMatch[1].split(',');
        for (const rawPart of parts) {
          const part = rawPart.trim();
          if (!part) continue;
          const eqIdx = part.indexOf('=');
          const hasFallback = eqIdx !== -1;
          const left = hasFallback ? part.slice(0, eqIdx).trim() : part;
          const colonIdx = left.indexOf(':');
          const varName = (colonIdx !== -1 ? left.slice(0, colonIdx).trim() : left).trim();
          if (/^[A-Z0-9_]+$/.test(varName)) {
            references.push({
              name: varName,
              hasFallback,
              line: lineIdx + 1
            });
          }
        }
      }

      // Check for dynamic access: process.env[dynamicKey] or complex expressions
      const dynamicRegex = /(?:process\.env|import\.meta\.env)\[\s*([^\]'"]+)\s*\]/g;
      let dynMatch: RegExpExecArray | null;
      while ((dynMatch = dynamicRegex.exec(line)) !== null) {
        dynamicCount++;
        dynamicExpressions.push(dynMatch[0]);
      }

      // Direct & bracket property access with optional fallback
      const propRegex = /(?:process\.env|import\.meta\.env)(?:\.([A-Z0-9_]+)|\[\s*['"]([A-Z0-9_]+)['"]\s*\])(?:\s*(\?\?|\|\|)\s*([^,;\n)]+))?/g;
      let match: RegExpExecArray | null;
      while ((match = propRegex.exec(line)) !== null) {
        const varName = match[1] || match[2];
        const operator = match[3];
        const fallbackExpr = match[4]?.trim();
        const hasFallback = Boolean(operator && fallbackExpr);

        references.push({
          name: varName,
          hasFallback,
          line: lineIdx + 1
        });
      }
    }

    return { references, dynamicCount, dynamicExpressions };
  }

  /**
   * 6. Evaluate Configuration Readiness
   * Bounded static extraction of environment variable references and reconciliation
   * against .env.example / .env.template contracts. Never reads or exposes secrets.
   */
  public static evaluateConfiguration(projectRoot: string): CategoryReadiness {
    const findings: ReadinessFinding[] = [];
    let attentionCount = 0;

    // 1. Identify and parse environment template files (.env.example, .env.template)
    const examplePath = path.join(projectRoot, '.env.example');
    const templatePath = path.join(projectRoot, '.env.template');

    const documentedVars = new Set<string>();
    const templateFiles: string[] = [];

    if (fs.existsSync(examplePath)) {
      templateFiles.push('.env.example');
      for (const v of this.parseEnvTemplate(examplePath)) {
        documentedVars.add(v);
      }
    }
    if (fs.existsSync(templatePath)) {
      templateFiles.push('.env.template');
      for (const v of this.parseEnvTemplate(templatePath)) {
        documentedVars.add(v);
      }
    }

    const hasTemplate = templateFiles.length > 0;
    if (!hasTemplate) {
      // Non-blocking attention: missing env documentation template
      attentionCount++;
      findings.push({
        id: 'FIND-CONFIG-NO-EXAMPLE',
        category: 'CONFIGURATION',
        severity: 'MEDIUM',
        status: 'WARN',
        isBlocking: false,
        summary: 'No .env.example or .env.template file found in project root.',
        remediation: 'Create .env.example documenting all required environment variables.',
        timestamp: new Date().toISOString()
      });
    } else {
      findings.push({
        id: 'FIND-CONFIG-EXAMPLE-FOUND',
        category: 'CONFIGURATION',
        severity: 'INFO',
        status: 'PASS',
        isBlocking: false,
        summary: `Environment variable template present (${templateFiles.join(', ')}). Documented ${documentedVars.size} variable contract(s).`,
        affectedFiles: templateFiles,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Scan bounded source files
    const { files, boundaryReached } = StaticVerifier.scanFilesWithBoundary(projectRoot);
    if (boundaryReached) {
      findings.push({
        id: 'FIND-CONFIG-SCAN-BOUNDARY',
        category: 'CONFIGURATION',
        severity: 'LOW',
        status: 'INFO',
        isBlocking: false,
        summary: `Project scan reached file limit (${StaticVerifier.MAX_SCANNED_FILES} files). Configuration analysis completed across bounded subset.`,
        timestamp: new Date().toISOString()
      });
    }

    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];
    const varUsages = new Map<string, { files: Set<string>; hasFallbackEverywhere: boolean; totalOccurrences: number }>();
    let totalDynamicAccess = 0;
    const dynamicFiles = new Set<string>();

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (!sourceExtensions.includes(ext)) continue;

      try {
        const stat = fs.statSync(filePath);
        if (stat.size > StaticVerifier.MAX_FILE_SIZE) continue;

        const content = fs.readFileSync(filePath, 'utf8');
        const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

        const { references, dynamicCount } = this.extractEnvReferences(content);
        if (dynamicCount > 0) {
          totalDynamicAccess += dynamicCount;
          dynamicFiles.add(relPath);
        }

        for (const ref of references) {
          let usage = varUsages.get(ref.name);
          if (!usage) {
            usage = { files: new Set<string>(), hasFallbackEverywhere: true, totalOccurrences: 0 };
            varUsages.set(ref.name, usage);
          }
          usage.files.add(relPath);
          usage.totalOccurrences++;
          if (!ref.hasFallback) {
            usage.hasFallbackEverywhere = false;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // 3. Reconcile extracted references against templates and runtime rules
    let documentedCount = 0;
    let fallbackCount = 0;
    let exemptCount = 0;
    let undocumentedCount = 0;

    const undocumentedVars: Array<{ name: string; files: string[] }> = [];

    for (const [varName, usage] of varUsages.entries()) {
      const isDocumented = documentedVars.has(varName);
      const isStandardRuntime = this.STANDARD_RUNTIME_VARS.has(varName);

      if (isDocumented) {
        documentedCount++;
      } else if (usage.hasFallbackEverywhere) {
        fallbackCount++;
      } else if (isStandardRuntime) {
        exemptCount++;
      } else {
        undocumentedCount++;
        undocumentedVars.push({
          name: varName,
          files: Array.from(usage.files).slice(0, 5)
        });
      }
    }

    // 4. Generate findings for undocumented variables
    for (const undoc of undocumentedVars) {
      attentionCount++;
      findings.push({
        id: `FIND-CONFIG-UNDOCUMENTED-${undoc.name}`,
        category: 'CONFIGURATION',
        severity: 'MEDIUM',
        status: 'WARN',
        isBlocking: false,
        summary: `Environment variable "${undoc.name}" is referenced in code (${undoc.files.join(', ')}) without documentation in .env.example or explicit fallback expression.`,
        remediation: `Document ${undoc.name} in .env.example or provide an explicit fallback expression (e.g. process.env.${undoc.name} ?? default).`,
        affectedFiles: undoc.files,
        timestamp: new Date().toISOString()
      });
    }

    // 5. Dynamic property access finding if detected
    if (totalDynamicAccess > 0) {
      findings.push({
        id: 'FIND-CONFIG-DYNAMIC-ACCESS',
        category: 'CONFIGURATION',
        severity: 'LOW',
        status: 'INFO',
        isBlocking: false,
        summary: `Dynamic environment variable access detected (${totalDynamicAccess} occurrence(s) across ${dynamicFiles.size} file(s)). Dynamic access cannot be statically classified.`,
        affectedFiles: Array.from(dynamicFiles).slice(0, 10),
        timestamp: new Date().toISOString()
      });
    }

    // 6. Contract reconciliation summary finding
    if (hasTemplate && undocumentedCount === 0) {
      findings.push({
        id: 'FIND-CONFIG-CONTRACT-VERIFIED',
        category: 'CONFIGURATION',
        severity: 'INFO',
        status: 'PASS',
        isBlocking: false,
        summary: `Configuration contract fully reconciled: ${documentedCount} documented, ${fallbackCount} with fallback, ${exemptCount} runtime exemption(s).`,
        affectedFiles: templateFiles,
        timestamp: new Date().toISOString()
      });
    }

    const status = attentionCount > 0 ? 'NEEDS_ATTENTION' : 'READY';
    const summary = status === 'READY'
      ? `Configuration contracts and templates are consistent (${varUsages.size} environment variable(s) verified).`
      : `Configuration evaluation NEEDS_ATTENTION: ${attentionCount} issue(s) detected (${undocumentedCount} undocumented variable(s)).`;

    return {
      category: 'CONFIGURATION',
      status,
      summary,
      blockingFindings: 0,
      attentionFindings: attentionCount,
      findings
    };
  }

  /**
   * 7. Evaluate Dependencies Readiness
   */
  public static evaluateDependencies(projectRoot: string): CategoryReadiness {
    const findings: ReadinessFinding[] = [];
    let attentionCount = 0;

    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const lockfiles = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'];
      const hasLock = lockfiles.some(f => fs.existsSync(path.join(projectRoot, f)));

      if (!hasLock) {
        // Non-blocking risk: missing lockfile is a risk (NEEDS_ATTENTION) but not a release blocker
        attentionCount++;
        findings.push({
          id: 'FIND-DEP-NO-LOCKFILE',
          category: 'DEPENDENCIES',
          severity: 'MEDIUM',
          status: 'WARN',
          isBlocking: false,
          summary: 'No lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock) detected.',
          remediation: 'Generate and commit a package lockfile for reproducible deployments.',
          affectedFiles: ['package.json'],
          timestamp: new Date().toISOString()
        });
      } else {
        findings.push({
          id: 'FIND-DEP-LOCK-OK',
          category: 'DEPENDENCIES',
          severity: 'INFO',
          status: 'PASS',
          isBlocking: false,
          summary: 'Dependency lockfile is present.',
          timestamp: new Date().toISOString()
        });
      }
    }

    const status = attentionCount > 0 ? 'NEEDS_ATTENTION' : 'READY';
    return {
      category: 'DEPENDENCIES',
      status,
      summary: status === 'READY' ? 'Dependencies and lockfile are consistent.' : 'Dependencies configuration needs attention.',
      blockingFindings: 0,
      attentionFindings: attentionCount,
      findings
    };
  }

  /**
   * 8. Evaluate Deployment Configuration
   * Context-aware: does not require all providers, detects available target.
   */
  public static evaluateDeployment(projectRoot: string): CategoryReadiness {
    const findings: ReadinessFinding[] = [];

    const DEPLOYMENT_SIGNALS = [
      { name: 'Docker', file: 'Dockerfile' },
      { name: 'Docker Compose', file: 'docker-compose.yml' },
      { name: 'Vercel', file: 'vercel.json' },
      { name: 'Netlify', file: 'netlify.toml' },
      { name: 'Firebase', file: 'firebase.json' },
      { name: 'Render', file: 'render.yaml' },
      { name: 'Heroku/Procfile', file: 'Procfile' }
    ];

    let detectedCount = 0;
    for (const sig of DEPLOYMENT_SIGNALS) {
      if (fs.existsSync(path.join(projectRoot, sig.file))) {
        detectedCount++;
        findings.push({
          id: 'FIND-DEPLOY-' + sig.name.toUpperCase().replace(/\s+/g, '_'),
          category: 'DEPLOYMENT',
          severity: 'INFO',
          status: 'PASS',
          isBlocking: false,
          summary: 'Deployment target detected: ' + sig.name + ' (' + sig.file + ').',
          affectedFiles: [sig.file],
          timestamp: new Date().toISOString()
        });
      }
    }

    if (detectedCount === 0) {
      findings.push({
        id: 'FIND-DEPLOY-GENERIC',
        category: 'DEPLOYMENT',
        severity: 'INFO',
        status: 'INFO',
        isBlocking: false,
        summary: 'No provider-specific deployment manifest detected. Standard server/static hosting inferred.',
        timestamp: new Date().toISOString()
      });
    }

    return {
      category: 'DEPLOYMENT',
      status: 'READY',
      summary: detectedCount > 0
        ? 'Deployment configuration detected (' + detectedCount + ' targets).'
        : 'Generic deployment configuration inferred.',
      blockingFindings: 0,
      attentionFindings: 0,
      findings
    };
  }

  /**
   * 9. Evaluate Documentation Readiness
   */
  public static evaluateDocumentation(projectRoot: string): CategoryReadiness {
    const findings: ReadinessFinding[] = [];
    let attentionCount = 0;

    const readmeFiles = ['README.md', 'README.txt', 'readme.md'];
    const foundReadme = readmeFiles.find(f => fs.existsSync(path.join(projectRoot, f)));

    if (!foundReadme) {
      // Non-blocking documentation warning
      attentionCount++;
      findings.push({
        id: 'FIND-DOC-NO-README',
        category: 'DOCUMENTATION',
        severity: 'LOW',
        status: 'WARN',
        isBlocking: false,
        summary: 'No README.md documentation file found in project root.',
        remediation: 'Add a concise README.md with setup and usage instructions.',
        timestamp: new Date().toISOString()
      });
    } else {
      findings.push({
        id: 'FIND-DOC-README-OK',
        category: 'DOCUMENTATION',
        severity: 'INFO',
        status: 'PASS',
        isBlocking: false,
        summary: 'Project documentation present (' + foundReadme + ').',
        affectedFiles: [foundReadme],
        timestamp: new Date().toISOString()
      });
    }

    const status = attentionCount > 0 ? 'NEEDS_ATTENTION' : 'READY';
    return {
      category: 'DOCUMENTATION',
      status,
      summary: status === 'READY' ? 'Release documentation is in place.' : 'Documentation needs attention.',
      blockingFindings: 0,
      attentionFindings: attentionCount,
      findings
    };
  }

  /**
   * 10. Evaluate Source Control Readiness
   * Read-only. Distinguishes uncommitted secrets (BLOCKED) from dirty documentation/code (NEEDS_ATTENTION).
   */
  public static evaluateSourceControl(projectRoot: string): CategoryReadiness {
    const findings: ReadinessFinding[] = [];
    let blockingCount = 0;
    let attentionCount = 0;

    const gitStatus = GitInspector.inspect(projectRoot);

    if (!gitStatus.gitAvailable) {
      findings.push({
        id: 'FIND-GIT-NOT-REPO',
        category: 'SOURCE_CONTROL',
        severity: 'INFO',
        status: 'INFO',
        isBlocking: false,
        summary: 'Project root is not a Git repository.',
        timestamp: new Date().toISOString()
      });

      return {
        category: 'SOURCE_CONTROL',
        status: 'READY',
        summary: 'Source control evaluation complete (non-git directory).',
        blockingFindings: 0,
        attentionFindings: 0,
        findings
      };
    }

    const dirtyFiles = [
      ...gitStatus.modified,
      ...gitStatus.added,
      ...gitStatus.untracked
    ];

    if (dirtyFiles.length > 0) {
      // Scan dirty files for uncommitted secrets
      let uncommittedSecretFound = false;
      for (const dirtyRelPath of dirtyFiles) {
        const fullPath = path.join(projectRoot, dirtyRelPath);
        if (fs.existsSync(fullPath)) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && stat.size < 500 * 1024) {
              const fileContent = fs.readFileSync(fullPath, 'utf8');
              const matchedSecret = this.scanForSecrets(fileContent);
              if (matchedSecret) {
                uncommittedSecretFound = true;
                blockingCount++;
                findings.push({
                  id: 'FIND-GIT-UNCOMMITTED-SECRET-' + Math.random().toString(36).substring(2, 6),
                  category: 'SOURCE_CONTROL',
                  severity: 'CRITICAL',
                  status: 'FAIL',
                  isBlocking: true,
                  summary: 'Uncommitted ' + matchedSecret + ' detected in dirty working tree file: ' + dirtyRelPath + '.',
                  remediation: 'Remove sensitive secret from ' + dirtyRelPath + ' before release.',
                  affectedFiles: [dirtyRelPath],
                  timestamp: new Date().toISOString()
                });
              }
            }
          } catch {
            // ignore unreadable
          }
        }
      }

      // If dirty working tree has NO secrets, it is release risk (NEEDS_ATTENTION), NOT automatically BLOCKED!
      if (!uncommittedSecretFound) {
        attentionCount++;
        findings.push({
          id: 'FIND-GIT-UNCOMMITTED',
          category: 'SOURCE_CONTROL',
          severity: 'MEDIUM',
          status: 'WARN',
          isBlocking: false,
          summary: 'Working tree has ' + dirtyFiles.length + ' uncommitted changes.',
          remediation: 'Commit or stash changes before tagging production release.',
          affectedFiles: dirtyFiles.slice(0, 10),
          timestamp: new Date().toISOString()
        });
      }
    } else {
      findings.push({
        id: 'FIND-GIT-CLEAN',
        category: 'SOURCE_CONTROL',
        severity: 'INFO',
        status: 'PASS',
        isBlocking: false,
        summary: 'Working tree is clean. Current commit: ' + (gitStatus.headCommit?.substring(0, 7) || 'HEAD'),
        timestamp: new Date().toISOString()
      });
    }

    const status = blockingCount > 0 ? 'BLOCKED' : attentionCount > 0 ? 'NEEDS_ATTENTION' : 'READY';
    return {
      category: 'SOURCE_CONTROL',
      status,
      summary: status === 'READY'
        ? 'Source control state is clean.'
        : status === 'BLOCKED'
        ? 'Source control release BLOCKED: uncommitted secrets detected in working tree.'
        : 'Source control state has uncommitted changes (NEEDS_ATTENTION).',
      blockingFindings: blockingCount,
      attentionFindings: attentionCount,
      findings
    };
  }
}
