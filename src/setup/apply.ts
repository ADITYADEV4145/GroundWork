import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { BLOCK_END, BLOCK_START, type AgentTarget, type Edit } from './targets.js';
import { gwPath } from '../util/paths.js';

// Plans and applies `gw setup`. The manifest records which files and directories setup created, so
// `--remove` deletes those and only strips Groundwork entries from files that already existed.

export interface PlannedChange {
  agent: string;
  file: string;
  action: 'create' | 'update' | 'unchanged' | 'remove' | 'delete';
  before: string | null;
  after: string | null;
}

interface Manifest {
  created: string[];
  createdDirs: string[];
}

function manifestPath(root: string): string {
  return gwPath(root, 'setup.json');
}

function readManifest(root: string): Manifest {
  try {
    return JSON.parse(readFileSync(manifestPath(root), 'utf8')) as Manifest;
  } catch {
    return { created: [], createdDirs: [] };
  }
}

function read(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function stripBlock(text: string): string {
  const re = new RegExp(`\\n?${BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${BLOCK_END}\\n?`, 'g');
  return text.replace(re, '');
}

function transform(edit: Edit, before: string | null, mode: 'add' | 'remove'): string | null {
  if (edit.kind === 'block') {
    const base = stripBlock(before ?? '');
    if (mode === 'remove') return before === null ? null : base;
    const head = base ? `${base.endsWith('\n') ? base : `${base}\n`}\n` : '';
    return `${head}${BLOCK_START}\n${edit.block}\n${BLOCK_END}\n`;
  }
  let doc: Record<string, unknown> = {};
  if (before !== null && before.trim()) {
    try {
      doc = JSON.parse(before) as Record<string, unknown>;
    } catch {
      throw new Error(`${edit.file} is not valid JSON; fix or remove it and run gw setup again`);
    }
  }
  if (mode === 'add') edit.add(doc);
  else edit.remove(doc);
  if (mode === 'remove' && before === null) return null;
  // Keep the file's own indentation and trailing newline so add + remove round-trips byte for byte.
  const indent = before ? (/\n([ \t]+)\S/.exec(before)?.[1] ?? 2) : 2;
  const eol = before === null || before.endsWith('\n') ? '\n' : '';
  return JSON.stringify(doc, null, indent) + eol;
}

export function planSetup(root: string, targets: AgentTarget[], mode: 'add' | 'remove'): PlannedChange[] {
  const manifest = readManifest(root);
  const out: PlannedChange[] = [];
  for (const t of targets)
    for (const edit of t.edits) {
      const before = read(edit.file);
      let after = transform(edit, before, mode);
      let action: PlannedChange['action'];
      if (mode === 'add') action = before === null ? 'create' : after === before ? 'unchanged' : 'update';
      else {
        const empty = after !== null && (after.trim() === '{}' || after.trim() === '');
        if (before === null) action = 'unchanged';
        else if (empty && manifest.created.includes(edit.file)) {
          action = 'delete';
          after = null;
        } else action = after === before ? 'unchanged' : 'remove';
      }
      out.push({ agent: t.label, file: edit.file, action, before, after });
    }
  return out;
}

function mkdirTracked(dir: string, manifest: Manifest): void {
  const missing: string[] = [];
  for (let d = dir; !existsSync(d); d = path.dirname(d)) missing.push(d);
  if (!missing.length) return;
  mkdirSync(dir, { recursive: true });
  for (const d of missing) if (!manifest.createdDirs.includes(d)) manifest.createdDirs.push(d);
}

export function applySetup(root: string, changes: PlannedChange[], mode: 'add' | 'remove'): void {
  const manifest = readManifest(root);
  for (const c of changes) {
    if (c.action === 'unchanged') continue;
    if (c.action === 'delete') {
      rmSync(c.file, { force: true });
      manifest.created = manifest.created.filter((f) => f !== c.file);
      continue;
    }
    mkdirTracked(path.dirname(c.file), manifest);
    if (c.action === 'create' && !manifest.created.includes(c.file)) manifest.created.push(c.file);
    writeFileSync(c.file, c.after ?? '');
  }
  if (mode === 'remove') {
    // Deepest first, and only directories that are empty now.
    for (const d of [...manifest.createdDirs].sort((a, b) => b.length - a.length)) {
      try {
        if (readdirSync(d).length === 0) rmdirSync(d);
        manifest.createdDirs = manifest.createdDirs.filter((x) => x !== d);
      } catch {
        manifest.createdDirs = manifest.createdDirs.filter((x) => x !== d);
      }
    }
    if (!manifest.created.length && !manifest.createdDirs.length) {
      rmSync(manifestPath(root), { force: true });
      return;
    }
  }
  mkdirSync(gwPath(root), { recursive: true });
  writeFileSync(manifestPath(root), JSON.stringify(manifest, null, 2) + '\n');
}
