import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ModuleSurface, PackageRef } from './surface.js';

// Cargo surface: Rust re-exports, features and macros make an exact public API impractical to read without the
// compiler, so this only records which identifiers a crate's source mentions. A name the crate never mentions
// is reported as a warning, never a block.

function read(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Crate versions pinned by Cargo.lock (nearest ancestor of the file inside the repo). */
export function cargoLock(root: string, relFile: string): { dir: string; versions: Map<string, string[]> } | null {
  let dir = path.dirname(path.resolve(root, relFile));
  for (;;) {
    const text = read(path.join(dir, 'Cargo.lock'));
    if (text !== null) {
      const versions = new Map<string, string[]>();
      for (const m of text.matchAll(/\[\[package\]\]\s*\nname = "([^"]+)"\s*\nversion = "([^"]+)"/g)) {
        const key = m[1]!.replaceAll('-', '_');
        versions.set(key, [...(versions.get(key) ?? []), `${m[1]}@${m[2]}`]);
      }
      return { dir, versions };
    }
    if (dir === root || path.dirname(dir) === dir) return null;
    dir = path.dirname(dir);
  }
}

export function locateCrate(lock: { dir: string; versions: Map<string, string[]> }, crate: string, workspace: Map<string, string>): PackageRef | null {
  const local = workspace.get(crate);
  if (local) return { ecosystem: 'cargo', name: crate, version: 'workspace', location: local };
  const pinned = lock.versions.get(crate);
  // Two versions of one crate in the lockfile: which one this file sees depends on the manifest.
  if (!pinned || pinned.length !== 1) return null;
  const [name, version] = pinned[0]!.split('@') as [string, string];
  const dirName = `${name}-${version}`;
  const vendored = path.join(lock.dir, 'vendor', name);
  if (existsSync(path.join(vendored, 'Cargo.toml'))) return { ecosystem: 'cargo', name, version, location: vendored };
  const registry = path.join(process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo'), 'registry', 'src');
  try {
    for (const index of readdirSync(registry)) {
      const dir = path.join(registry, index, dirName);
      if (existsSync(dir)) return { ecosystem: 'cargo', name, version, location: dir };
    }
  } catch {
    // no registry sources on this machine
  }
  return null;
}

const MAX_BYTES = 24 * 1024 * 1024;

export function buildCrateSurface(ref: PackageRef): ModuleSurface {
  const mentions = new Set<string>();
  let bytes = 0;
  let files = 0;
  const walk = (dir: string, depth: number): boolean => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 12 && !['target', 'tests', 'benches', 'examples', '.git'].includes(e.name) && !walk(p, depth + 1)) return false;
      } else if (e.name.endsWith('.rs')) {
        const text = read(p);
        if (text === null) continue;
        bytes += text.length;
        files++;
        if (bytes > MAX_BYTES) return false;
        for (const m of text.matchAll(/[A-Za-z_]\w*/g)) mentions.add(m[0]);
      }
    }
    return true;
  };
  const complete = walk(existsSync(path.join(ref.location, 'src')) ? path.join(ref.location, 'src') : ref.location, 0);
  if (!complete || !files) return { exports: {}, open: true, why: complete ? 'crate has no Rust sources here' : 'crate is too large to list' };
  return { exports: {}, open: false, mentions: [...mentions] };
}

/** Workspace member crates: crate name (underscored) -> directory. */
export function cargoWorkspaceCrates(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const manifest = read(path.join(root, 'Cargo.toml'));
  if (manifest === null) return out;
  const section = /\[workspace\]([\s\S]*?)(?=\n\[|$)/.exec(manifest)?.[1];
  if (section === undefined) return out;
  const members = [...(/members\s*=\s*\[([\s\S]*?)\]/.exec(section)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  for (const dir of expandGlobs(root, members)) {
    const name = /\[package\][\s\S]*?\bname\s*=\s*"([^"]+)"/.exec(read(path.join(dir, 'Cargo.toml')) ?? '')?.[1];
    if (name) out.set(name.replaceAll('-', '_'), dir);
  }
  return out;
}

/** Expand `packages/*`-style member globs (one `*` per segment, and `**` for any depth up to 4). */
export function expandGlobs(root: string, patterns: string[]): string[] {
  const out = new Set<string>();
  const negated = patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1).replace(/\/+$/, ''));
  const expand = (base: string, segments: string[], depth: number): void => {
    if (!segments.length) {
      out.add(base);
      return;
    }
    const [seg, ...rest] = segments as [string, ...string[]];
    if (!seg.includes('*')) {
      const next = path.join(base, seg);
      if (existsSync(next)) expand(next, rest, depth);
      return;
    }
    let entries: string[] = [];
    try {
      entries = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')).map((e) => e.name);
    } catch {
      return;
    }
    if (seg === '**') {
      expand(base, rest, depth);
      if (depth < 4) for (const e of entries) expand(path.join(base, e), segments, depth + 1);
      return;
    }
    const re = new RegExp(`^${seg.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    for (const e of entries) if (re.test(e)) expand(path.join(base, e), rest, depth);
  };
  for (const p of patterns) if (!p.startsWith('!')) expand(root, p.replace(/^\.\//, '').replace(/\/+$/, '').split('/'), 0);
  return [...out].filter((dir) => !negated.some((n) => path.relative(root, dir).split(path.sep).join('/') === n));
}
