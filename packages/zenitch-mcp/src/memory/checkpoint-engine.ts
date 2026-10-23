import { StorageEngine } from './storage-engine.js';
import { CheckpointSchema, CheckpointRecord } from '../schemas/memory.schema.js';

export interface FastPathResult {
  hasChanged: boolean;
  checkpoint?: CheckpointRecord;
}

export class CheckpointEngine {
  public static readCheckpoint(zenitchDir: string): CheckpointRecord | null {
    try {
      return StorageEngine.readDocument<CheckpointRecord>(
        zenitchDir,
        'checkpoint.json',
        CheckpointSchema,
        () => ({
          projectId: 'unknown',
          timestamp: new Date().toISOString(),
          _version: 0,
          updatedAt: new Date().toISOString(),
          trackedState: {
            modifiedFiles: [],
            addedFiles: [],
            deletedFiles: []
          },
          summary: 'Initial checkpoint'
        })
      );
    } catch {
      return null;
    }
  }

  public static checkFastPath(
    zenitchDir: string,
    currentCommit?: string,
    currentModified: string[] = [],
    currentAdded: string[] = [],
    currentDeleted: string[] = []
  ): FastPathResult {
    const existing = this.readCheckpoint(zenitchDir);
    if (!existing) {
      return { hasChanged: true };
    }

    // If git commit is known and differs
    if (currentCommit && existing.gitCommit && currentCommit !== existing.gitCommit) {
      return { hasChanged: true, checkpoint: existing };
    }

    // Compare tracked files arrays
    const prevMod = existing.trackedState.modifiedFiles || [];
    const prevAdd = existing.trackedState.addedFiles || [];
    const prevDel = existing.trackedState.deletedFiles || [];

    const isSameArray = (a: string[], b: string[]) =>
      a.length === b.length && a.every((val, idx) => val === b[idx]);

    if (
      isSameArray(currentModified.slice().sort(), prevMod.slice().sort()) &&
      isSameArray(currentAdded.slice().sort(), prevAdd.slice().sort()) &&
      isSameArray(currentDeleted.slice().sort(), prevDel.slice().sort())
    ) {
      return { hasChanged: false, checkpoint: existing };
    }

    return { hasChanged: true, checkpoint: existing };
  }

  public static updateCheckpoint(
    zenitchDir: string,
    projectId: string,
    gitCommit?: string,
    modifiedFiles: string[] = [],
    addedFiles: string[] = [],
    deletedFiles: string[] = [],
    summary?: string
  ): CheckpointRecord {
    const record: CheckpointRecord = {
      projectId,
      gitCommit,
      timestamp: new Date().toISOString(),
      _version: 0,
      updatedAt: new Date().toISOString(),
      trackedState: {
        modifiedFiles,
        addedFiles,
        deletedFiles
      },
      summary: summary || `Inspected at ${new Date().toISOString()}`
    };

    StorageEngine.writeDocument(zenitchDir, 'checkpoint.json', record, 0);
    return record;
  }
}
