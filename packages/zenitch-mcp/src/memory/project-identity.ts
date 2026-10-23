import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

export interface ProjectIdentityResult {
  projectId: string;
  projectName: string;
  identityHierarchy: {
    gitRemoteUrl?: string;
    gitInitialCommitHash?: string;
    packageManifestName?: string;
    localFallbackId: string;
  };
}

function safeExecGit(command: string, cwd: string): string | null {
  try {
    const stdout = execSync(command, {
      cwd,
      timeout: 2500,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8'
    });
    return stdout ? stdout.trim() : null;
  } catch {
    return null;
  }
}

export function resolveProjectIdentity(projectRoot: string): ProjectIdentityResult {
  const canonicalRoot = fs.realpathSync(path.resolve(projectRoot));
  let gitRemoteUrl: string | undefined;
  let gitInitialCommitHash: string | undefined;
  let packageManifestName: string | undefined;

  // Check if inside a git repository
  let isGit = false;
  try {
    let cur = canonicalRoot;
    while (cur && cur !== path.dirname(cur)) {
      if (fs.existsSync(path.join(cur, '.git'))) {
        isGit = true;
        break;
      }
      cur = path.dirname(cur);
    }
  } catch {}

  if (isGit) {
    // 1. Try Git Remote Origin URL
    const remote = safeExecGit('git config --get remote.origin.url', canonicalRoot);
    if (remote) {
      gitRemoteUrl = remote.replace(/\\/g, '/');
    }

    // 2. Try Git Initial Root Commit Hash
    const rootCommit = safeExecGit('git rev-list --max-parents=0 HEAD', canonicalRoot);
    if (rootCommit) {
      const firstRoot = rootCommit.split(/\r?\n/)[0].trim();
      if (firstRoot) {
        gitInitialCommitHash = firstRoot;
      }
    }
  }

  // 3. Try package.json name
  const pkgPath = path.join(canonicalRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg && typeof pkg.name === 'string') {
        packageManifestName = pkg.name;
      }
    } catch {}
  }

  // 4. Resolve persisted local fallback UUID (path-independent!)
  const zenitchDir = path.join(canonicalRoot, '.zenitch');
  const idFilePath = path.join(zenitchDir, '.project_id');
  const projectJsonPath = path.join(zenitchDir, 'project.json');

  let localFallbackId: string = '';

  // Check existing .project_id file
  if (fs.existsSync(idFilePath)) {
    try {
      localFallbackId = fs.readFileSync(idFilePath, 'utf8').trim();
    } catch {}
  }

  // Check existing project.json if .project_id is absent
  if (!localFallbackId && fs.existsSync(projectJsonPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
      if (existing && existing.identityHierarchy && existing.identityHierarchy.localFallbackId) {
        localFallbackId = existing.identityHierarchy.localFallbackId;
      } else if (existing && existing.projectId) {
        localFallbackId = existing.projectId;
      }
    } catch {}
  }

  // If no persisted fallback exists, generate a new UUID and persist it
  if (!localFallbackId) {
    localFallbackId = crypto.randomUUID();
    try {
      if (!fs.existsSync(zenitchDir)) {
        fs.mkdirSync(zenitchDir, { recursive: true });
      }
      fs.writeFileSync(idFilePath, localFallbackId, 'utf8');
    } catch {}
  } else if (!fs.existsSync(idFilePath)) {
    try {
      if (!fs.existsSync(zenitchDir)) {
        fs.mkdirSync(zenitchDir, { recursive: true });
      }
      fs.writeFileSync(idFilePath, localFallbackId, 'utf8');
    } catch {}
  }

  // Compute stable primary Project ID based on hierarchy
  let primarySeed: string;
  if (gitRemoteUrl) {
    primarySeed = `git-remote::${gitRemoteUrl.toLowerCase()}`;
  } else if (gitInitialCommitHash) {
    primarySeed = `git-commit::${gitInitialCommitHash.toLowerCase()}`;
  } else if (packageManifestName) {
    primarySeed = `pkg::${packageManifestName}`;
  } else {
    // Pure local fallback using persisted UUID (completely path-independent)
    primarySeed = `local-uuid::${localFallbackId}`;
  }

  const hash = crypto.createHash('sha256').update(primarySeed).digest('hex');
  const projectId = `PRJ-${hash.slice(0, 8)}-${hash.slice(8, 12)}`;
  const projectName = packageManifestName || path.basename(canonicalRoot);

  return {
    projectId,
    projectName,
    identityHierarchy: {
      gitRemoteUrl,
      gitInitialCommitHash,
      packageManifestName,
      localFallbackId
    }
  };
}
