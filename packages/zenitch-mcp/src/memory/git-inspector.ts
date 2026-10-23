import { execFileSync } from 'node:child_process';
import path from 'node:path';

export interface GitStatusResult {
  gitAvailable: boolean;
  branch?: string;
  headCommit?: string;
  commitSummary?: string;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  totalChanges: number;
  diffStat?: string;
  error?: string;
}

export class GitInspector {
  private static execGit(cwd: string, args: string[], timeoutMs = 2500): string | null {
    try {
      const output = execFileSync('git', args, {
        cwd,
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
        windowsHide: true
      });
      return output ? output.trim() : '';
    } catch {
      return null;
    }
  }

  public static isGitAvailable(projectRoot: string): boolean {
    const res = this.execGit(projectRoot, ['rev-parse', '--is-inside-work-tree']);
    return res === 'true';
  }

  public static getHeadInfo(projectRoot: string): { headCommit?: string; branch?: string; summary?: string } {
    const headCommit = this.execGit(projectRoot, ['rev-parse', 'HEAD']) || undefined;
    const branch = this.execGit(projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD']) || undefined;
    const summary = this.execGit(projectRoot, ['log', '-1', '--format=%s']) || undefined;
    return { headCommit, branch, summary };
  }

  public static inspect(projectRoot: string, maxFiles = 100, includeDiffStat = false): GitStatusResult {
    const root = path.resolve(projectRoot);
    if (!this.isGitAvailable(root)) {
      return {
        gitAvailable: false,
        modified: [],
        added: [],
        deleted: [],
        untracked: [],
        totalChanges: 0
      };
    }

    const { headCommit, branch, summary: commitSummary } = this.getHeadInfo(root);

    // Run porcelain status
    const statusOutput = this.execGit(root, ['status', '--porcelain=v1', '-uall']);
    if (statusOutput === null) {
      return {
        gitAvailable: false,
        error: 'Failed to execute git status',
        modified: [],
        added: [],
        deleted: [],
        untracked: [],
        totalChanges: 0
      };
    }

    const modified: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];
    const untracked: string[] = [];

    const lines = statusOutput.split('\n').filter(l => l.trim().length > 0);
    const totalChanges = lines.length;

    for (const line of lines.slice(0, maxFiles)) {
      const statusCode = line.substring(0, 2);
      let filePath = line.substring(3).trim();

      // Handle renames: 'R  old -> new'
      if (filePath.includes(' -> ')) {
        filePath = filePath.split(' -> ')[1];
      }

      if (statusCode === '??') {
        untracked.push(filePath);
      } else if (statusCode.includes('A')) {
        added.push(filePath);
      } else if (statusCode.includes('D')) {
        deleted.push(filePath);
      } else if (statusCode.includes('M') || statusCode.includes('R') || statusCode.includes('C')) {
        modified.push(filePath);
      } else {
        modified.push(filePath);
      }
    }

    let diffStat: string | undefined;
    if (includeDiffStat && totalChanges > 0) {
      const statOut = this.execGit(root, ['diff', '--stat']);
      if (statOut) {
        diffStat = statOut;
      }
    }

    return {
      gitAvailable: true,
      branch,
      headCommit,
      commitSummary,
      modified,
      added,
      deleted,
      untracked,
      totalChanges,
      diffStat
    };
  }
}
