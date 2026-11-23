import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cargoWorkspaceCrates, expandGlobs } from './cargo.js';
import { goWorkModules } from './go.js';
import { pomDependencies } from './maven.js';

// Monorepo layout: which directories are packages of this repository, by the name other packages import them
// under. Read from the workspace manifests only (pnpm, Yarn, npm, go.work, Cargo, Maven modules).

export type WorkspaceKind = 'npm' | 'go' | 'cargo' | 'maven';

export interface WorkspacePackage {
  kind: WorkspaceKind;
  name: string;
  /** Repo-relative directory, forward slashes. */
  dir: string;
}

export interface Workspaces {
  packages: WorkspacePackage[];
  npm: Map<string, string>;
  go: Map<string, string>;
  cargo: Map<string, string>;
  /** Maven module directories (absolute). */
  maven: string[];
}

function read(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function npmPatterns(root: string): string[] {
  const patterns: string[] = [];
  const pnpm = read(path.join(root, 'pnpm-workspace.yaml'));
  if (pnpm !== null) {
    // `packages:` is a flat list of globs; a full YAML parser is not needed for it.
    let inList = false;
    for (const raw of pnpm.split('\n')) {
      const line = raw.replace(/\s+#.*$/, '');
      if (/^packages\s*:/.test(line)) {
        inList = true;
        const inline = /\[(.*)\]/.exec(line)?.[1];
        if (inline) patterns.push(...inline.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean));
      } else if (inList) {
        const item = /^\s*-\s*(.+?)\s*$/.exec(line)?.[1];
        if (item) patterns.push(item.replace(/^['"]|['"]$/g, ''));
        else if (/^\S/.test(line)) inList = false;
      }
    }
  }
  try {
    const pkg = JSON.parse(read(path.join(root, 'package.json')) ?? '{}') as { workspaces?: string[] | { packages?: string[] } };
    const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
    if (Array.isArray(ws)) patterns.push(...ws.filter((w): w is string => typeof w === 'string'));
  } catch {
    // malformed package.json: no workspaces
  }
  return [...new Set(patterns)];
}

function mavenModules(root: string, dir: string, out: string[], depth = 0): void {
  const pom = read(path.join(dir, 'pom.xml'));
  if (pom === null || depth > 6) return;
  for (const module of pomDependencies(pom).modules) {
    const moduleDir = path.resolve(dir, module);
    if (!moduleDir.startsWith(root) || out.includes(moduleDir) || !existsSync(path.join(moduleDir, 'pom.xml'))) continue;
    out.push(moduleDir);
    mavenModules(root, moduleDir, out, depth + 1);
  }
}

const cache = new Map<string, Workspaces>();

export function discoverWorkspaces(root: string, fresh = false): Workspaces {
  const hit = fresh ? undefined : cache.get(root);
  if (hit) return hit;
  const rel = (dir: string): string => path.relative(root, dir).split(path.sep).join('/') || '.';
  const ws: Workspaces = { packages: [], npm: new Map(), go: new Map(), cargo: new Map(), maven: [] };
  for (const dir of expandGlobs(root, npmPatterns(root))) {
    try {
      const name = (JSON.parse(read(path.join(dir, 'package.json')) ?? '{}') as { name?: unknown }).name;
      if (typeof name === 'string' && name && !ws.npm.has(name)) ws.npm.set(name, dir);
    } catch {
      // not a package
    }
  }
  ws.go = goWorkModules(root);
  ws.cargo = cargoWorkspaceCrates(root);
  mavenModules(root, root, ws.maven);
  for (const [name, dir] of ws.npm) ws.packages.push({ kind: 'npm', name, dir: rel(dir) });
  for (const [name, dir] of ws.go) ws.packages.push({ kind: 'go', name, dir: rel(dir) });
  for (const [name, dir] of ws.cargo) ws.packages.push({ kind: 'cargo', name, dir: rel(dir) });
  for (const dir of ws.maven) ws.packages.push({ kind: 'maven', name: rel(dir), dir: rel(dir) });
  cache.set(root, ws);
  return ws;
}
