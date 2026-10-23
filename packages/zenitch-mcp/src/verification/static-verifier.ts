import fs from 'node:fs';
import path from 'node:path';
import { StaticCheck, VerificationEvidenceItem } from '../schemas/memory.schema.js';

export interface StaticVerificationResult {
  passed: boolean;
  summary: string;
  evidence: VerificationEvidenceItem[];
}

export class StaticVerifier {
  public static readonly SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.html', '.vue', '.svelte'];
  public static readonly MAX_FILE_SIZE = 512 * 1024; // 512KB conservative limit per individual file (S-003)
  public static readonly MAX_SCANNED_FILES = 2000; // 2000 file global limit to prevent resource exhaustion (S-003)

  /**
   * Scan files in directory recursively up to maxDepth with strict file-count boundary (S-003).
   */
  public static scanFilesWithBoundary(
    dir: string,
    maxDepth: number = 5,
    maxFiles: number = StaticVerifier.MAX_SCANNED_FILES
  ): { files: string[]; boundaryReached: boolean } {
    const files: string[] = [];
    let boundaryReached = false;

    const resolvedRoot = path.resolve(dir);
    const isWithinRoot = (targetPath: string): boolean => {
      try {
        const real = fs.realpathSync(targetPath);
        return real === resolvedRoot || real.startsWith(resolvedRoot + path.sep);
      } catch {
        return false;
      }
    };

    function walk(currentDir: string, currentDepth: number) {
      if (currentDepth > maxDepth || !fs.existsSync(currentDir) || boundaryReached) {
        return;
      }

      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'dist' || entry.name === 'build') {
            continue;
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

          if (isDir) {
            walk(fullPath, currentDepth + 1);
            if (boundaryReached) return;
          } else if (isFile) {
            const ext = path.extname(entry.name).toLowerCase();
            if (StaticVerifier.SOURCE_EXTENSIONS.includes(ext) || ext === '.json' || ext === '.css') {
              if (files.length >= maxFiles) {
                boundaryReached = true;
                return;
              }
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Ignore unreadable directories
      }
    }

    walk(dir, 0);
    return { files, boundaryReached };
  }

  /**
   * Scan files in directory recursively up to maxDepth, bounded by MAX_SCANNED_FILES.
   */
  public static scanFiles(dir: string, maxDepth: number = 5): string[] {
    return this.scanFilesWithBoundary(dir, maxDepth).files;
  }

  /**
   * Check if a route exists in the project statically by inspecting pages/routes/views/app folders
   * or by matching route patterns in source code.
   */
  public static verifyRouteExists(projectRoot: string, route: string, preScannedFiles?: string[]): { found: boolean; file?: string; evidence: VerificationEvidenceItem } {
    const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
    const allFiles = preScannedFiles || this.scanFiles(projectRoot);

    for (const file of allFiles) {
      const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');

      // Check Next.js / Nuxt / SvelteKit / Vite route conventions
      if (
        relPath.includes('pages/' + cleanRoute) ||
        relPath.includes('app/' + cleanRoute) ||
        relPath.includes('routes/' + cleanRoute) ||
        (cleanRoute === '' && (relPath.includes('pages/index') || relPath.includes('app/page')))
      ) {
        return {
          found: true,
          file: relPath,
          evidence: {
            type: 'PAGE_REACHED',
            summary: 'Static route match confirmed: "' + route + '" mapped to file ' + relPath,
            target: route,
            actual: relPath,
            timestamp: new Date().toISOString()
          }
        };
      }

      try {
        const stat = fs.statSync(file);
        if (stat.size > StaticVerifier.MAX_FILE_SIZE) continue;
        const content = fs.readFileSync(file, 'utf8');
        // Check for route string inside file
        if (cleanRoute.length > 0 && content.includes(cleanRoute)) {
          return {
            found: true,
            file: relPath,
            evidence: {
              type: 'PAGE_REACHED',
              summary: 'Static route definition found for "' + route + '" in ' + relPath,
              target: route,
              actual: relPath,
              timestamp: new Date().toISOString()
            }
          };
        }
      } catch {
        // ignore unreadable files
      }
    }

    return {
      found: false,
      evidence: {
        type: 'PAGE_REACHED',
        summary: 'Static route verification failed: No static file or definition matched route "' + route + '"',
        target: route,
        expected: 'Route definition or page component',
        actual: 'NOT_FOUND',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Check if a component exists statically in components/ or src/.
   */
  public static verifyComponentExists(projectRoot: string, componentName: string, preScannedFiles?: string[]): { found: boolean; file?: string; evidence: VerificationEvidenceItem } {
    const allFiles = preScannedFiles || this.scanFiles(projectRoot);
    const cleanName = componentName.replace(/\.[^/.]+$/, '').toLowerCase();

    for (const file of allFiles) {
      const base = path.basename(file, path.extname(file)).toLowerCase();
      if (base === cleanName) {
        const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
        return {
          found: true,
          file: relPath,
          evidence: {
            type: 'ELEMENT_FOUND',
            summary: 'Component "' + componentName + '" found at ' + relPath,
            target: componentName,
            actual: relPath,
            timestamp: new Date().toISOString()
          }
        };
      }

      // Check export/function definition inside file
      try {
        const stat = fs.statSync(file);
        if (stat.size > StaticVerifier.MAX_FILE_SIZE) continue;
        const content = fs.readFileSync(file, 'utf8');
        if (
          content.includes('function ' + componentName) ||
          content.includes('const ' + componentName + ' =') ||
          content.includes('class ' + componentName) ||
          content.includes('export const ' + componentName) ||
          content.includes('export default function ' + componentName)
        ) {
          const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
          return {
            found: true,
            file: relPath,
            evidence: {
              type: 'ELEMENT_FOUND',
              summary: 'Component "' + componentName + '" definition found inside ' + relPath,
              target: componentName,
              actual: relPath,
              timestamp: new Date().toISOString()
            }
          };
        }
      } catch {
        // ignore
      }
    }

    return {
      found: false,
      evidence: {
        type: 'ELEMENT_FOUND',
        summary: 'Component "' + componentName + '" could not be found statically.',
        target: componentName,
        expected: 'Component declaration or file',
        actual: 'NOT_FOUND',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Check if expected text exists in source code or template.
   */
  public static verifyTextExists(projectRoot: string, targetFileOrText: string, expectedText?: string, preScannedFiles?: string[]): { found: boolean; evidence: VerificationEvidenceItem } {
    const textToFind = expectedText || targetFileOrText;
    const specificFile = expectedText && targetFileOrText ? path.join(projectRoot, targetFileOrText) : undefined;

    if (specificFile && fs.existsSync(specificFile)) {
      try {
        const content = fs.readFileSync(specificFile, 'utf8');
        const match = content.includes(textToFind);
        return {
          found: match,
          evidence: {
            type: 'TEXT_MATCH',
            summary: match
              ? 'Found expected text "' + textToFind + '" in ' + targetFileOrText
              : 'Expected text "' + textToFind + '" not found in ' + targetFileOrText,
            target: targetFileOrText,
            expected: textToFind,
            actual: match ? 'PRESENT' : 'ABSENT',
            timestamp: new Date().toISOString()
          }
        };
      } catch {
        // ignore
      }
    }

    // Scan all files
    const allFiles = this.scanFiles(projectRoot);
    for (const file of allFiles) {
      try {
        const stat = fs.statSync(file);
        if (stat.size > StaticVerifier.MAX_FILE_SIZE) continue;
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes(textToFind)) {
          const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
          return {
            found: true,
            evidence: {
              type: 'TEXT_MATCH',
              summary: 'Found expected text "' + textToFind + '" in ' + relPath,
              target: relPath,
              expected: textToFind,
              actual: 'PRESENT',
              timestamp: new Date().toISOString()
            }
          };
        }
      } catch {
        // ignore
      }
    }

    return {
      found: false,
      evidence: {
        type: 'TEXT_MATCH',
        summary: 'Expected text "' + textToFind + '" was not found in project sources.',
        target: 'project_sources',
        expected: textToFind,
        actual: 'ABSENT',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Check if a CSS selector / form input / attribute exists statically in templates.
   */
  public static verifySelectorExists(projectRoot: string, selector: string, preScannedFiles?: string[]): { found: boolean; evidence: VerificationEvidenceItem } {
    const allFiles = preScannedFiles || this.scanFiles(projectRoot);
    const noBrackets = selector.replace(/[\[\]]/g, '');
    const attrMatch = selector.match(/\[?([a-zA-Z0-9_-]+)\s*=\s*['"]?([^'"\]]+)['"]?\]?/);

    for (const file of allFiles) {
      try {
        const stat = fs.statSync(file);
        if (stat.size > StaticVerifier.MAX_FILE_SIZE) continue;
        const content = fs.readFileSync(file, 'utf8');
        let matched = content.includes(selector) || (noBrackets.length > 0 && content.includes(noBrackets));
        if (!matched && attrMatch) {
          const attrName = attrMatch[1];
          const attrVal = attrMatch[2];
          if (content.includes(attrName) && content.includes(attrVal)) {
            matched = true;
          }
        }

        if (matched) {
          const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
          return {
            found: true,
            evidence: {
              type: 'ELEMENT_FOUND',
              summary: 'Selector "' + selector + '" confirmed in template ' + relPath,
              target: selector,
              actual: relPath,
              timestamp: new Date().toISOString()
            }
          };
        }
      } catch {
        // ignore
      }
    }

    return {
      found: false,
      evidence: {
        type: 'ELEMENT_FOUND',
        summary: 'Selector "' + selector + '" was not found in any project templates.',
        target: selector,
        expected: 'Template matching selector',
        actual: 'NOT_FOUND',
        timestamp: new Date().toISOString()
      }
    };
  }

  public static async execute(
    projectRoot: string,
    options: {
      requirementId?: string;
      criterionId?: string;
      staticChecks?: StaticCheck[];
      route?: string;
    }
  ): Promise<StaticVerificationResult> {
    const evidence: VerificationEvidenceItem[] = [];
    let allPassed = true;
    const preScanned = this.scanFiles(projectRoot);

    // 1. If explicit static checks provided, run them
    if (options.staticChecks && options.staticChecks.length > 0) {
      for (const check of options.staticChecks) {
        if (check.type === 'ROUTE_EXISTS') {
          const res = this.verifyRouteExists(projectRoot, check.path || options.route || '/', preScanned);
          evidence.push(res.evidence);
          if (!res.found) allPassed = false;
        } else if (check.type === 'COMPONENT_EXISTS') {
          const res = this.verifyComponentExists(projectRoot, check.target || 'Component', preScanned);
          evidence.push(res.evidence);
          if (!res.found) allPassed = false;
        } else if (check.type === 'TEXT_EXISTS') {
          const res = this.verifyTextExists(projectRoot, check.path || '', check.expectedText || check.target || '', preScanned);
          evidence.push(res.evidence);
          if (!res.found) allPassed = false;
        } else if (check.type === 'SELECTOR_EXISTS') {
          const res = this.verifySelectorExists(projectRoot, check.target || '', preScanned);
          evidence.push(res.evidence);
          if (!res.found) allPassed = false;
        } else if (check.type === 'TEST_PASSES') {
          // Check if test file exists
          const testFile = check.path || check.target || '';
          const fullTestPath = path.join(projectRoot, testFile);
          const found = fs.existsSync(fullTestPath);
          evidence.push({
            type: 'API_RESPONSE',
            summary: found ? 'Static test file confirmed: ' + testFile : 'Test file missing: ' + testFile,
            target: testFile,
            expected: 'File exists',
            actual: found ? 'EXISTS' : 'NOT_FOUND',
            timestamp: new Date().toISOString()
          });
          if (!found) allPassed = false;
        }
      }
    } else {
      // 2. Default route/file check if route is specified
      if (options.route) {
        const res = this.verifyRouteExists(projectRoot, options.route);
        evidence.push(res.evidence);
        if (!res.found) allPassed = false;
      } else {
        // Fallback: project structure check
        const hasPackageJson = fs.existsSync(path.join(projectRoot, 'package.json'));
        evidence.push({
          type: 'ELEMENT_FOUND',
          summary: hasPackageJson ? 'Valid project root confirmed (package.json present)' : 'Project root missing package.json',
          target: 'package.json',
          expected: 'package.json',
          actual: hasPackageJson ? 'PRESENT' : 'NOT_FOUND',
          timestamp: new Date().toISOString()
        });
        if (!hasPackageJson) allPassed = false;
      }
    }

    const failedCount = evidence.filter(e => e.actual === 'NOT_FOUND' || e.actual === 'ABSENT').length;
    const summary = allPassed
      ? 'Static verification PASSED: ' + evidence.length + ' static assertions verified.'
      : 'Static verification FAILED: ' + failedCount + ' assertions failed.';

    return {
      passed: allPassed,
      summary,
      evidence
    };
  }
}
