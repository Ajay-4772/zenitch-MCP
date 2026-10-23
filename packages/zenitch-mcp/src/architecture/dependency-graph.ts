import fs from 'node:fs';
import path from 'node:path';

export interface DependencyGraphOptions {
  maxCycleLength?: number;
  maxFileSize?: number;
  maxLineLength?: number;
}

export interface GraphBuildResult {
  adjacencyList: Map<string, Set<string>>;
  fileContents: Map<string, string>;
  cycles: string[][];
  unresolvedImportsCount: number;
}

export class DependencyGraph {
  public static readonly DEFAULT_MAX_CYCLE_LENGTH = 15;
  public static readonly DEFAULT_MAX_FILE_SIZE = 512 * 1024; // 512 KB
  public static readonly DEFAULT_MAX_LINE_LENGTH = 10000;

  /**
   * Extract import/export/require specifiers from file content.
   */
  public static extractSpecifiers(content: string, maxLineLength = DependencyGraph.DEFAULT_MAX_LINE_LENGTH): string[] {
    const specifiers: string[] = [];
    const lines = content.split(/\r?\n/);

    const importRegex = /(?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g;
    const requireRegex = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    for (const rawLine of lines) {
      const line = rawLine.length > maxLineLength ? rawLine.slice(0, maxLineLength) : rawLine;
      let match: RegExpExecArray | null;

      while ((match = importRegex.exec(line)) !== null) {
        if (match[1]) specifiers.push(match[1]);
      }
      while ((match = requireRegex.exec(line)) !== null) {
        if (match[1]) specifiers.push(match[1]);
      }
    }

    return specifiers;
  }

  /**
   * Resolve an import specifier to a known scanned relative file path.
   * Returns null if the import cannot be resolved to a scanned file.
   * NOTE: Never returns synthetic or placeholder paths for unresolved imports.
   */
  public static resolveImportSpecifier(
    importingFileRel: string,
    specifier: string,
    scannedFileSet: Set<string>
  ): string | null {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    const normImporting = importingFileRel.replace(/\\/g, '/');

    // 1. Relative imports (./foo, ../bar)
    if (specifier.startsWith('.')) {
      const dir = path.posix.dirname(normImporting);
      const target = path.posix.normalize(path.posix.join(dir, specifier));

      // Direct file match
      if (scannedFileSet.has(target)) return target;

      // Extension append match
      for (const ext of extensions) {
        if (scannedFileSet.has(target + ext)) return target + ext;
      }

      // Index file match
      for (const ext of extensions) {
        const indexTarget = path.posix.join(target, 'index' + ext);
        if (scannedFileSet.has(indexTarget)) return indexTarget;
      }
    }

    // 2. Alias imports (@/..., ~/...)
    if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
      const aliasBase = specifier.slice(2);
      const candidates = [
        aliasBase,
        path.posix.join('src', aliasBase)
      ];

      for (const cand of candidates) {
        if (scannedFileSet.has(cand)) return cand;
        for (const ext of extensions) {
          if (scannedFileSet.has(cand + ext)) return cand + ext;
        }
        for (const ext of extensions) {
          const indexTarget = path.posix.join(cand, 'index' + ext);
          if (scannedFileSet.has(indexTarget)) return indexTarget;
        }
      }
    }

    return null;
  }

  /**
   * Build the project dependency graph and detect cycles deterministically.
   */
  public static buildGraph(
    projectRoot: string,
    scannedFiles: string[],
    options: DependencyGraphOptions = {}
  ): GraphBuildResult {
    const maxCycleLength = options.maxCycleLength ?? this.DEFAULT_MAX_CYCLE_LENGTH;
    const maxFileSize = options.maxFileSize ?? this.DEFAULT_MAX_FILE_SIZE;
    const maxLineLength = options.maxLineLength ?? this.DEFAULT_MAX_LINE_LENGTH;

    const scannedFileSet = new Set<string>(scannedFiles.map(f => f.replace(/\\/g, '/')));
    const adjacencyList = new Map<string, Set<string>>();
    const fileContents = new Map<string, string>();
    let unresolvedImportsCount = 0;

    for (const relFile of scannedFileSet) {
      adjacencyList.set(relFile, new Set<string>());
    }

    for (const relFile of scannedFileSet) {
      const absPath = path.join(projectRoot, relFile);
      try {
        const stat = fs.statSync(absPath);
        if (stat.size > maxFileSize) {
          continue;
        }
        const content = fs.readFileSync(absPath, 'utf8');
        fileContents.set(relFile, content);

        const specifiers = this.extractSpecifiers(content, maxLineLength);
        for (const spec of specifiers) {
          const resolved = this.resolveImportSpecifier(relFile, spec, scannedFileSet);
          if (resolved) {
            adjacencyList.get(relFile)!.add(resolved);
          } else {
            unresolvedImportsCount++;
          }
        }
      } catch {
        // Read errors safely ignored
      }
    }

    const cycles = this.detectCycles(adjacencyList, maxCycleLength);

    return {
      adjacencyList,
      fileContents,
      cycles,
      unresolvedImportsCount
    };
  }

  /**
   * Detect circular dependencies using Tarjan's Strongly Connected Components
   * followed by canonical elementary cycle extraction.
   */
  public static detectCycles(
    adjacencyList: Map<string, Set<string>>,
    maxCycleLength = DependencyGraph.DEFAULT_MAX_CYCLE_LENGTH
  ): string[][] {
    const sccs = this.findSCCs(adjacencyList);
    const discoveredCycles = new Map<string, string[]>();

    for (const scc of sccs) {
      // An SCC with 1 node has no cycle unless it has a self-loop
      if (scc.length === 1) {
        const node = scc[0];
        const neighbors = adjacencyList.get(node);
        if (neighbors && neighbors.has(node)) {
          const cycle = [node, node];
          discoveredCycles.set(cycle.join(' -> '), cycle);
        }
        continue;
      }

      // For SCC with > 1 node, extract simple cycles up to maxCycleLength
      const sccSet = new Set(scc);
      this.extractCyclesFromSCC(scc, sccSet, adjacencyList, maxCycleLength, discoveredCycles);
    }

    // Sort cycles deterministically by representation key
    return Array.from(discoveredCycles.values()).sort((a, b) => {
      const keyA = a.join(' -> ');
      const keyB = b.join(' -> ');
      return keyA.localeCompare(keyB);
    });
  }

  /**
   * Tarjan's Strongly Connected Components algorithm.
   */
  private static findSCCs(adjacencyList: Map<string, Set<string>>): string[][] {
    let index = 0;
    const indices = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];

    // Sort nodes deterministically
    const nodes = Array.from(adjacencyList.keys()).sort();

    const strongConnect = (v: string) => {
      indices.set(v, index);
      lowlink.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);

      const neighbors = Array.from(adjacencyList.get(v) || []).sort();
      for (const w of neighbors) {
        if (!indices.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      }

      if (lowlink.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        sccs.push(scc);
      }
    };

    for (const node of nodes) {
      if (!indices.has(node)) {
        strongConnect(node);
      }
    }

    return sccs;
  }

  /**
   * Extract elementary cycles from an SCC via bounded DFS.
   */
  private static extractCyclesFromSCC(
    scc: string[],
    sccSet: Set<string>,
    adjacencyList: Map<string, Set<string>>,
    maxCycleLength: number,
    discoveredCycles: Map<string, string[]>
  ): void {
    const visitedInPath = new Set<string>();
    const pathStack: string[] = [];

    const dfs = (current: string) => {
      visitedInPath.add(current);
      pathStack.push(current);

      const neighbors = Array.from(adjacencyList.get(current) || [])
        .filter(n => sccSet.has(n))
        .sort();

      for (const neighbor of neighbors) {
        const pathIndex = pathStack.indexOf(neighbor);
        if (pathIndex !== -1) {
          // Found cycle from pathIndex to end + neighbor
          const rawCycle = pathStack.slice(pathIndex);
          rawCycle.push(neighbor);

          const cycleHops = rawCycle.length - 1;
          if (cycleHops >= 2 && cycleHops <= maxCycleLength) {
            const canonical = this.canonicalizeCycle(rawCycle);
            const key = canonical.join(' -> ');
            if (!discoveredCycles.has(key)) {
              discoveredCycles.set(key, canonical);
            }
          }
        } else if (pathStack.length < maxCycleLength) {
          dfs(neighbor);
        }
      }

      pathStack.pop();
      visitedInPath.delete(current);
    };

    for (const startNode of scc) {
      dfs(startNode);
    }
  }

  /**
   * Canonicalize cycle representation so permutations like A->B->A and B->A->B
   * have the identical canonical form.
   */
  public static canonicalizeCycle(cycle: string[]): string[] {
    if (cycle.length < 2) return cycle;
    // Nodes in loop without the repeated closing node
    const loop = cycle.slice(0, cycle.length - 1);
    let minIdx = 0;
    for (let i = 1; i < loop.length; i++) {
      if (loop[i].localeCompare(loop[minIdx]) < 0) {
        minIdx = i;
      }
    }

    const rotated: string[] = [];
    for (let i = 0; i < loop.length; i++) {
      rotated.push(loop[(minIdx + i) % loop.length]);
    }
    rotated.push(rotated[0]);
    return rotated;
  }
}
