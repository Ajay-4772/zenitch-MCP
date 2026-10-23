import fs from 'node:fs';
import path from 'node:path';
import {
  ProjectInspectionInput,
  ProjectInspectionOutput,
  FrameworkEnum,
  StylingApproachEnum,
  PackageManagerEnum,
  DiscoveredComponentSchema,
  DiscoveredRouteSchema,
  DetectedDesignTokenSchema
} from '../schemas/project.schema.js';
import { z } from 'zod';

type DiscoveredComponent = z.infer<typeof DiscoveredComponentSchema>;
type DiscoveredRoute = z.infer<typeof DiscoveredRouteSchema>;
type DetectedDesignToken = z.infer<typeof DetectedDesignTokenSchema>;

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.vscode',
  '.idea'
]);

const SENSITIVE_ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
  '.env.staging'
];

/**
 * Project Intelligence Subsystem
 * Inspects a real project directory in READ-ONLY mode.
 * Discovers frameworks, routing, components, and design tokens
 * while strictly redacting secrets and environment files.
 */
export function inspectProject(input: ProjectInspectionInput): ProjectInspectionOutput {
  const { projectRoot, scanDepth = 3 } = input;

  // 1. Path Safety & Existence Validation
  const resolvedRoot = path.resolve(projectRoot);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Project root directory not found: "${resolvedRoot}"`);
  }

  const stat = fs.statSync(resolvedRoot);
  if (!stat.isDirectory()) {
    throw new Error(`Specified project root is a file, not a directory: "${resolvedRoot}"`);
  }

  // 2. Security Check (Redact .env files completely)
  const environmentFilesIgnored: string[] = [];
  let secretsRedactedCount = 0;

  for (const envFile of SENSITIVE_ENV_FILES) {
    const envPath = path.join(resolvedRoot, envFile);
    if (fs.existsSync(envPath)) {
      environmentFilesIgnored.push(envFile);
      secretsRedactedCount++;
    }
  }

  // 3. Inspect package.json for Dependencies & Framework Detection
  const packageJsonPath = path.join(resolvedRoot, 'package.json');
  let dependencies: Record<string, string> = {};
  let devDependencies: Record<string, string> = {};
  let allDependencies: Record<string, string> = {};

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkgContent = fs.readFileSync(packageJsonPath, 'utf8');
      const pkg = JSON.parse(pkgContent);
      dependencies = pkg.dependencies || {};
      devDependencies = pkg.devDependencies || {};
      allDependencies = { ...dependencies, ...devDependencies };
    } catch (err) {
      // Malformed package.json handled gracefully
    }
  }

  // 4. Detect Package Manager
  let packageManager: z.infer<typeof PackageManagerEnum> = 'unknown';
  if (fs.existsSync(path.join(resolvedRoot, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (fs.existsSync(path.join(resolvedRoot, 'yarn.lock'))) {
    packageManager = 'yarn';
  } else if (fs.existsSync(path.join(resolvedRoot, 'bun.lockb')) || fs.existsSync(path.join(resolvedRoot, 'bun.lock'))) {
    packageManager = 'bun';
  } else if (fs.existsSync(path.join(resolvedRoot, 'package-lock.json'))) {
    packageManager = 'npm';
  }

  // 5. Detect Framework
  let framework: z.infer<typeof FrameworkEnum> = 'unknown';
  const hasAppDir = fs.existsSync(path.join(resolvedRoot, 'app')) || fs.existsSync(path.join(resolvedRoot, 'src', 'app'));
  const hasPagesDir = fs.existsSync(path.join(resolvedRoot, 'pages')) || fs.existsSync(path.join(resolvedRoot, 'src', 'pages'));

  if (allDependencies['next']) {
    framework = hasAppDir ? 'nextjs_app_router' : 'nextjs_pages_router';
  } else if (allDependencies['vite'] && (allDependencies['react'] || allDependencies['@vitejs/plugin-react'])) {
    framework = 'vite_react';
  } else if (allDependencies['vue'] || allDependencies['nuxt']) {
    framework = 'vue';
  } else if (allDependencies['svelte'] || allDependencies['@sveltejs/kit']) {
    framework = 'svelte';
  } else if (allDependencies['@remix-run/react'] || allDependencies['remix']) {
    framework = 'remix';
  } else if (allDependencies['astro']) {
    framework = 'astro';
  } else if (fs.existsSync(path.join(resolvedRoot, 'index.html'))) {
    framework = 'vanilla_html_css';
  }

  // 6. Detect Styling Approach
  let styling: z.infer<typeof StylingApproachEnum> = 'unknown';
  const hasTailwindConfig = fs.existsSync(path.join(resolvedRoot, 'tailwind.config.js')) ||
    fs.existsSync(path.join(resolvedRoot, 'tailwind.config.ts')) ||
    fs.existsSync(path.join(resolvedRoot, 'tailwind.config.mjs'));

  if (allDependencies['@tailwindcss/vite'] || (allDependencies['tailwindcss'] && allDependencies['tailwindcss'].startsWith('^4'))) {
    styling = 'tailwind_v4';
  } else if (hasTailwindConfig || allDependencies['tailwindcss']) {
    styling = allDependencies['@radix-ui/react-slot'] ? 'shadcn_radix' : 'tailwind_v3';
  } else if (allDependencies['styled-components'] || allDependencies['@emotion/react']) {
    styling = 'styled_components';
  } else if (allDependencies['sass']) {
    styling = 'sass_scss';
  } else {
    // Check if css files exist
    styling = 'vanilla_css';
  }

  // 7. Recursive Safe Directory Scan (Read-Only)
  const detectedLanguagesSet = new Set<string>();
  const discoveredComponents: DiscoveredComponent[] = [];
  const discoveredPagesAndRoutes: DiscoveredRoute[] = [];
  const detectedDesignTokens: DetectedDesignToken[] = [];

  function scanDirectory(currentPath: string, depth: number) {
    if (depth > scanDepth) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return; // Permission or access error handled gracefully
    }

    for (const entry of entries) {
      const entryName = entry.name;
      if (IGNORED_DIRECTORIES.has(entryName) || entryName.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(currentPath, entryName);
      const relativePath = path.relative(resolvedRoot, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        scanDirectory(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entryName).toLowerCase();

        // Language tracking
        if (ext === '.ts' || ext === '.tsx') detectedLanguagesSet.add('TypeScript');
        else if (ext === '.js' || ext === '.jsx' || ext === '.mjs') detectedLanguagesSet.add('JavaScript');
        else if (ext === '.css') detectedLanguagesSet.add('CSS');
        else if (ext === '.scss' || ext === '.sass') detectedLanguagesSet.add('Sass');
        else if (ext === '.html') detectedLanguagesSet.add('HTML');
        else if (ext === '.vue') detectedLanguagesSet.add('Vue');
        else if (ext === '.svelte') detectedLanguagesSet.add('Svelte');

        // Route discovery
        if (framework === 'nextjs_app_router') {
          if (entryName.startsWith('page.') && relativePath.includes('app/')) {
            const routeSeg = relativePath
              .replace(/^.*app\/?/, '/')
              .replace(/\/page\.[a-z]+$/, '')
              .replace(/\/$/, '') || '/';
            discoveredPagesAndRoutes.push({ routePath: routeSeg, filePath: relativePath });
          }
        } else if (framework === 'nextjs_pages_router') {
          if (relativePath.includes('pages/') && !entryName.startsWith('_')) {
            const routeSeg = relativePath
              .replace(/^.*pages\/?/, '/')
              .replace(/\.[a-z]+$/, '')
              .replace(/\/index$/, '') || '/';
            discoveredPagesAndRoutes.push({ routePath: routeSeg, filePath: relativePath });
          }
        } else if (ext === '.html') {
          discoveredPagesAndRoutes.push({
            routePath: '/' + (entryName === 'index.html' ? '' : entryName.replace('.html', '')),
            filePath: relativePath
          });
        }

        // Component discovery
        const isComponentFile = (ext === '.tsx' || ext === '.jsx' || ext === '.vue' || ext === '.svelte') ||
          (ext === '.html' && relativePath.includes('components/'));

        if (isComponentFile && !entryName.includes('.test.') && !entryName.includes('.spec.')) {
          const compName = entryName.replace(/\.[^/.]+$/, '');
          const lowerName = compName.toLowerCase();

          let compType: 'ui_primitive' | 'layout' | 'composite' | 'page_section' = 'composite';
          if (['button', 'input', 'badge', 'card', 'avatar', 'dialog', 'modal', 'dropdown', 'tabs', 'slider', 'checkbox', 'switch'].includes(lowerName)) {
            compType = 'ui_primitive';
          } else if (['header', 'footer', 'nav', 'navbar', 'sidebar', 'layout'].includes(lowerName)) {
            compType = 'layout';
          } else if (relativePath.includes('sections/') || lowerName.endsWith('section') || lowerName.endsWith('hero')) {
            compType = 'page_section';
          }

          discoveredComponents.push({
            name: compName,
            filePath: relativePath,
            type: compType
          });
        }

        // Design token extraction from CSS files
        if (ext === '.css' && (entryName.includes('global') || entryName.includes('style') || entryName.includes('theme') || entryName.includes('token'))) {
          try {
            const cssContent = fs.readFileSync(fullPath, 'utf8');
            const tokenRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
            let match;
            let count = 0;
            while ((match = tokenRegex.exec(cssContent)) !== null && count < 15) {
              const tokenName = match[1];
              const tokenVal = match[2].trim();
              let tType: 'color' | 'font' | 'spacing' | 'radius' | 'shadow' | 'other' = 'other';
              if (tokenName.includes('color') || tokenName.includes('bg') || tokenName.includes('text') || tokenVal.startsWith('#') || tokenVal.startsWith('rgb')) {
                tType = 'color';
              } else if (tokenName.includes('font')) {
                tType = 'font';
              } else if (tokenName.includes('spacing') || tokenName.includes('gap') || tokenName.includes('pad')) {
                tType = 'spacing';
              } else if (tokenName.includes('radius')) {
                tType = 'radius';
              }

              detectedDesignTokens.push({
                name: `--${tokenName}`,
                type: tType,
                sourceFile: relativePath,
                sampleValue: tokenVal
              });
              count++;
            }
          } catch {
            // Read error handled safely
          }
        }
      }
    }
  }

  scanDirectory(resolvedRoot, 1);

  // 8. Preservation Warnings
  const preservationWarnings: string[] = [];
  if (discoveredComponents.length > 0) {
    const primitives = discoveredComponents.filter(c => c.type === 'ui_primitive');
    if (primitives.length > 0) {
      preservationWarnings.push(
        `Discovered ${primitives.length} existing UI primitive(s) (${primitives.map(p => p.name).join(', ')}). Reuse these components rather than authoring new ones.`
      );
    }
  }

  if (styling.startsWith('tailwind')) {
    preservationWarnings.push(
      `Project uses ${styling}. Use existing utility class conventions; do not inject raw inline CSS overrides.`
    );
  }

  if (framework === 'nextjs_app_router') {
    preservationWarnings.push(
      `Next.js App Router detected. Ensure components with state or event listeners explicitly declare 'use client'.`
    );
  }

  if (detectedDesignTokens.length > 0) {
    preservationWarnings.push(
      `Detected ${detectedDesignTokens.length} existing CSS design token(s). Preserve color variables to maintain consistent branding.`
    );
  }

  const detectedLanguages = Array.from(detectedLanguagesSet).sort();
  const structureSummary = `Inspected "${path.basename(resolvedRoot)}" (Framework: ${framework}, Styling: ${styling}, Package Manager: ${packageManager}). Found ${discoveredComponents.length} components, ${discoveredPagesAndRoutes.length} route(s), and ${detectedLanguages.join(', ')} source files.`;

  return {
    projectRoot: resolvedRoot,
    framework,
    styling,
    packageManager,
    detectedLanguages,
    structureSummary,
    hasExistingDesignTokens: detectedDesignTokens.length > 0,
    detectedDesignTokens,
    discoveredComponents,
    discoveredPagesAndRoutes,
    routesCount: discoveredPagesAndRoutes.length,
    dependencies: allDependencies,
    preservationWarnings,
    securitySummary: {
      secretsRedactedCount,
      environmentFilesIgnored
    }
  };
}
