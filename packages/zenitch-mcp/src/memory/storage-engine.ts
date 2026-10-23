import { MigrationEngine, PHASE5_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION } from './migration-engine.js';
import fs from 'node:fs';
import path from 'node:path';
import { ZodTypeAny } from 'zod';
import { MemoryCorruptionReport, MemoryCorruptionError, SecurityBoundaryError } from './types.js';
export { MemoryCorruptionError, SecurityBoundaryError };

export class ConcurrencyLockTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyLockTimeoutError';
  }
}

export class ConcurrencyConflictError extends Error {
  constructor(public file: string, public expectedVersion: number, public actualVersion: number) {
    super(`Optimistic concurrency conflict on ${file}: expected version ${expectedVersion}, but found ${actualVersion}.`);
    this.name = 'ConcurrencyConflictError';
  }
}

const SECRET_PATTERNS = [
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, // JWT
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key
  /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}["']/gi // Generic secret assignment
];

export function redactSecrets<T>(data: T): T {
  if (typeof data === 'string') {
    let strVal: string = String(data);
    for (const pat of SECRET_PATTERNS) {
      strVal = strVal.replace(pat, '[REDACTED SENSITIVE CONTENT]');
    }
    return strVal as any;
  }
  if (Array.isArray(data)) {
    return data.map((item) => redactSecrets(item)) as any;
  }
  if (data !== null && typeof data === 'object') {
    const copy: any = {};
    for (const [k, v] of Object.entries(data)) {
      copy[k] = redactSecrets(v);
    }
    return copy as any;
  }
  return data;
}

export function sortKeysDeep(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortKeysDeep);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return obj;
}

export class StorageEngine {
  public static redactSecrets<T>(data: T): T {
    return redactSecrets(data);
  }

  private static lastCorruptionReport: MemoryCorruptionReport | null = null;

  public static getLastCorruptionReport(): MemoryCorruptionReport | null {
    return this.lastCorruptionReport;
  }

  public static clearCorruptionReport(): void {
    this.lastCorruptionReport = null;
  }

  private static getCorruptionMarkerPath(zenitchDir: string, filename: string): string {
    return path.join(zenitchDir, `.corrupted_${filename}`);
  }

  public static isDegraded(zenitchDir: string, filename?: string): boolean {
    if (filename) {
      return fs.existsSync(this.getCorruptionMarkerPath(zenitchDir, filename));
    }
    try {
      const files = fs.readdirSync(zenitchDir);
      return files.some(f => f.startsWith('.corrupted_'));
    } catch {
      return false;
    }
  }

  public static getCorruptionReport(zenitchDir: string, filename: string): MemoryCorruptionReport | null {
    const marker = this.getCorruptionMarkerPath(zenitchDir, filename);
    if (!fs.existsSync(marker)) return null;
    try {
      return JSON.parse(fs.readFileSync(marker, 'utf8'));
    } catch {
      return this.lastCorruptionReport;
    }
  }

  public static recoverDocument<T extends { _version?: number; updatedAt?: string }>(
    zenitchDir: string,
    filename: string,
    recoveredContent?: T
  ): void {
    const marker = this.getCorruptionMarkerPath(zenitchDir, filename);
    if (fs.existsSync(marker)) {
      try { fs.unlinkSync(marker); } catch {}
    }
    this.lastCorruptionReport = null;

    if (recoveredContent) {
      this.writeDocument(zenitchDir, filename, recoveredContent);
    }
  }

  public static getZenitchDir(projectRoot: string): string {
    const canonicalRoot = fs.realpathSync(path.resolve(projectRoot));
    const zenitchDir = path.join(canonicalRoot, '.zenitch');

    const rel = path.relative(canonicalRoot, zenitchDir);
    if (rel !== '.zenitch' && rel !== '') {
      throw new SecurityBoundaryError(`Security boundary violation: target path escapes projectRoot (${zenitchDir})`);
    }

    if (!fs.existsSync(zenitchDir)) {
      try {
        fs.mkdirSync(zenitchDir, { recursive: true, mode: 0o700 });
      } catch {
        fs.mkdirSync(zenitchDir, { recursive: true });
      }
    }

    return zenitchDir;
  }

  public static async withLock<T>(zenitchDir: string, fn: () => Promise<T> | T): Promise<T> {
    const lockPath = path.join(zenitchDir, '.lock');
    const start = Date.now();
    const timeoutMs = 6000;
    const staleThresholdMs = 2500;

    while (true) {
      try {
        const payload = JSON.stringify({ pid: process.pid, createdAt: Date.now() });
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeSync(fd, payload);
        fs.closeSync(fd);
        break; // Acquired lock successfully
      } catch (err: any) {
        if (err.code === 'EEXIST' || (process.platform === 'win32' && err.code === 'EPERM')) {
          let isStale = false;
          try {
            const stat = fs.statSync(lockPath);
            if (Date.now() - stat.mtimeMs > staleThresholdMs) {
              isStale = true;
            } else {
              try {
                const raw = fs.readFileSync(lockPath, 'utf8');
                if (raw && raw.trim().length > 0) {
                  const parsed = JSON.parse(raw);
                  if (parsed.createdAt && (Date.now() - parsed.createdAt > staleThresholdMs)) {
                    isStale = true;
                  }
                }
              } catch {
                // Lock file is actively being written or read-locked by Windows; not stale since mtime is recent
              }
            }
          } catch {
            // Lock was just released by owner
            continue;
          }

          if (isStale) {
            try { fs.unlinkSync(lockPath); } catch {}
            continue;
          }

          if (Date.now() - start > timeoutMs) {
            throw new ConcurrencyLockTimeoutError(`Timed out after ${timeoutMs}ms waiting for storage lock at ${lockPath}.`);
          }

          await new Promise((resolve) => setTimeout(resolve, 40));
        } else {
          throw err;
        }
      }
    }

    try {
      return await fn();
    } finally {
      try {
        fs.unlinkSync(lockPath);
      } catch {}
    }
  }

  public static readDocument<T>(
    zenitchDir: string,
    filename: string,
    schema: ZodTypeAny,
    defaultFactory: () => T
  ): T {
    // 1. If file has a recorded corruption marker, BLOCK read and fail immediately with structured error
    if (this.isDegraded(zenitchDir, filename)) {
      const existingReport = this.getCorruptionReport(zenitchDir, filename) || {
        status: 'DEGRADED_CORRUPTION_DETECTED',
        file: filename,
        corruptPath: path.join(zenitchDir, filename),
        errorDetails: 'Document is in DEGRADED_CORRUPTION_DETECTED state. Explicit recovery required.',
        detectedAt: new Date().toISOString()
      };
      throw new MemoryCorruptionError(existingReport);
    }

    const filePath = path.join(zenitchDir, filename);

    if (!fs.existsSync(filePath)) {
      return defaultFactory();
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let parsedJson: any;

    try {
      parsedJson = JSON.parse(raw);
    } catch (parseErr: any) {
      const corruptFilename = `${filename}.corrupt.${new Date().toISOString().replace(/[:.]/g, '-')}`;
      const corruptPath = path.join(zenitchDir, corruptFilename);
      fs.copyFileSync(filePath, corruptPath);

      const report: MemoryCorruptionReport = {
        status: 'DEGRADED_CORRUPTION_DETECTED',
        file: filename,
        corruptPath,
        errorDetails: `JSON parse error: ${parseErr.message}`,
        detectedAt: new Date().toISOString()
      };
      this.lastCorruptionReport = report;

      // Mark degraded state to block writes and subsequent reads
      fs.writeFileSync(this.getCorruptionMarkerPath(zenitchDir, filename), JSON.stringify(report, null, 2), 'utf8');
      throw new MemoryCorruptionError(report);
    }

    // S-002: Schema validation with transparent migration for older schema documents
    const docVersion = parsedJson?.schemaVersion || parsedJson?.version || '1.0.0';
    let toValidate = parsedJson;
    let wasMigrated = false;

    // Check if document is already valid under target schema
    let validated = schema.safeParse(toValidate);

    // If invalid OR if schema indicates older version, attempt migration
    if (!validated.success || (typeof docVersion === 'string' && docVersion !== PHASE5_SCHEMA_VERSION)) {
      try {
        const migrated = MigrationEngine.migrateDocument(filename, parsedJson, PHASE5_SCHEMA_VERSION);
        const reval = schema.safeParse(migrated);
        if (reval.success) {
          toValidate = migrated;
          validated = reval;
          // Mark migrated only if schema version or content changed
          if (toValidate.schemaVersion !== parsedJson.schemaVersion || JSON.stringify(toValidate) !== JSON.stringify(parsedJson)) {
            wasMigrated = true;
          }
        }
      } catch {
        // Migration failure will fall through to corruption handling below
      }
    }

    if (!validated.success) {
      const corruptFilename = `${filename}.corrupt.${new Date().toISOString().replace(/[:.]/g, '-')}`;
      const corruptPath = path.join(zenitchDir, corruptFilename);
      fs.copyFileSync(filePath, corruptPath);

      const report: MemoryCorruptionReport = {
        status: 'DEGRADED_CORRUPTION_DETECTED',
        file: filename,
        corruptPath,
        errorDetails: `Schema validation failed: ${validated.error.message}`,
        detectedAt: new Date().toISOString()
      };
      this.lastCorruptionReport = report;

      // Mark degraded state to block writes and subsequent reads
      fs.writeFileSync(this.getCorruptionMarkerPath(zenitchDir, filename), JSON.stringify(report, null, 2), 'utf8');
      throw new MemoryCorruptionError(report);
    }

    // If document was migrated, persist migrated state atomically preserving optimistic versioning
    if (wasMigrated) {
      try {
        const sanitized = redactSecrets(toValidate);
        const sorted = sortKeysDeep(sanitized);
        const serialized = JSON.stringify(sorted, null, 2) + '\n';
        const tempFilename = `${filename}.migrated.tmp.${process.pid}.${Date.now()}`;
        const tempPath = path.join(zenitchDir, tempFilename);
        fs.writeFileSync(tempPath, serialized, 'utf8');
        fs.renameSync(tempPath, filePath);
      } catch {
        // In-memory valid migrated result is still returned
      }
    }
    return validated.data as T;
  }

  public static writeDocument<T extends { _version?: number; updatedAt?: string }>(
    zenitchDir: string,
    filename: string,
    data: T,
    expectedVersion?: number
  ): T {
    // 1. BLOCK writes if corruption is detected for this document
    if (this.isDegraded(zenitchDir, filename)) {
      const existingReport = this.getCorruptionReport(zenitchDir, filename);
      const report: MemoryCorruptionReport = {
        status: 'DEGRADED_CORRUPTION_DETECTED',
        file: filename,
        corruptPath: existingReport?.corruptPath || path.join(zenitchDir, filename),
        errorDetails: `Writes are blocked on ${filename}: document is in DEGRADED_CORRUPTION_DETECTED state. Explicit recovery is required before writes can resume. (${existingReport?.errorDetails || 'Corrupted'})`,
        detectedAt: new Date().toISOString()
      };
      throw new MemoryCorruptionError(report);
    }

    const filePath = path.join(zenitchDir, filename);

    if (fs.existsSync(filePath) && expectedVersion !== undefined) {
      try {
        const existingRaw = fs.readFileSync(filePath, 'utf8');
        const existing = JSON.parse(existingRaw);
        if (typeof existing._version === 'number' && existing._version !== expectedVersion) {
          throw new ConcurrencyConflictError(filename, expectedVersion, existing._version);
        }
      } catch (err) {
        if (err instanceof ConcurrencyConflictError) throw err;
      }
    }

    // Increment version & update timestamp
    const nextVersion = (expectedVersion || data._version || 0) + 1;
    const toSave: any = {
      ...data,
      _version: nextVersion,
      updatedAt: new Date().toISOString()
    };

    // Sanitize secrets and sort keys deterministically
    const sanitized = redactSecrets(toSave);
    const sorted = sortKeysDeep(sanitized);
    const serialized = JSON.stringify(sorted, null, 2) + '\n';

    // Atomic write via temp file
    const tempFilename = `${filename}.tmp.${process.pid}.${Date.now()}`;
    const tempPath = path.join(zenitchDir, tempFilename);

    fs.writeFileSync(tempPath, serialized, 'utf8');

    // On Windows, atomic replacement via renameSync can race with pending file-handle closures
    // resulting in transient EPERM / EACCES. We safely retry with minimal backoff before throwing.
    if (process.platform === 'win32') {
      let renamed = false;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          fs.renameSync(tempPath, filePath);
          renamed = true;
          break;
        } catch (err: any) {
          if (err.code === 'EPERM' || err.code === 'EACCES') {
            lastErr = err;
            const waitTill = Date.now() + 5;
            while (Date.now() < waitTill) {}
          } else {
            throw err;
          }
        }
      }
      if (!renamed) {
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch {}
        }
        throw lastErr;
      }
    } else {
      fs.renameSync(tempPath, filePath);
    }

    return sorted as T;
  }
}
