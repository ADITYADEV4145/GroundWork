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
  /** Entry keys this change writes, recorded so later runs recognise them. */
  owned: string[];
}

interface Manifest {
  created: string[];
  createdDirs: string[];
  /** Hook commands and MCP entries setup wrote, so removal never touches look-alikes. */
  installed?: string[];
  originals?: Record<string, { before: string | null; after: string | null }>;
}

function manifestPath(root: string): string {
  return gwPath(root, 'setup.json');
}

const SEP = '\u0000';

function installedIn(manifest: Manifest, file: string): string[] {
  return (manifest.installed ?? []).filter((k) => k.startsWith(file + SEP)).map((k) => k.slice(file.length + 1));
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

/** `[mcp_servers.groundwork]` in any TOML spelling: bare or quoted keys, spacing, trailing comment. */
const SERVER_TABLE = /^\s*\[\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\.\s*(?:groundwork|"groundwork"|'groundwork')\s*\]\s*(?:#.*)?$/;

function stripBlock(text: string): string {
  const re = new RegExp(`\\n?${BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${BLOCK_END}\\n?`, 'g');
  return text.replace(re, '');
}

function transform(edit: Edit, before: string | null, mode: 'add' | 'remove', known: Set<string>): string | null {
  if (edit.kind === 'skill') {
    if (mode === 'remove') return known.has(`skill:${before}`) ? null : before;
    return before === null || known.has(`skill:${before}`) ? edit.content : before;
  }
  if (edit.kind === 'block') {
    const base = stripBlock(before ?? '');
    if (mode === 'remove') return before === null ? null : base;
    // A table the user declared themselves wins; TOML rejects a second declaration.
    if (base.split('\n').some((l) => SERVER_TABLE.test(l))) return before;
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
  const original = JSON.stringify(doc);
  if (mode === 'add') edit.add(doc, known);
  else edit.remove(doc, known);
  if (mode === 'remove' && before === null) return null;
  if (before !== null && JSON.stringify(doc) === original) return before;
  // Keep the file's own indentation and trailing newline so add + remove round-trips byte for byte.
  const indent = before ? (/\n([ \t]+)\S/.exec(before)?.[1] ?? 2) : 2;
  const eol = before === null || before.endsWith('\n') ? '\n' : '';
  return JSON.stringify(doc, null, indent) + eol;
}

function parseOrEmpty(text: string | null): Record<string, unknown> {
  try {
    const v: unknown = text?.trim() ? JSON.parse(text) : {};
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function planSetup(root: string, targets: AgentTarget[], mode: 'add' | 'remove'): PlannedChange[] {
  const manifest = readManifest(root);
  const out: PlannedChange[] = [];
  for (const t of targets)
    for (const edit of t.edits) {
      const before = read(edit.file);
      const installed = new Set(installedIn(manifest, edit.file));
      const owned = edit.kind === 'skill' ? (before === null || installed.has(`skill:${before}`) ? [`skill:${edit.content}`] : []) : edit.kind !== 'json' ? [] : typeof edit.owned === 'function' ? edit.owned(parseOrEmpty(before), installed) : edit.owned;
      const known = new Set([...installed, ...owned]);
      let after = transform(edit, before, mode, known);
      const original = manifest.originals?.[edit.file];
      if (mode === 'remove' && original && before === original.after) after = original.before;
      let action: PlannedChange['action'];
      if (mode === 'add') action = before === null ? 'create' : after === before ? 'unchanged' : 'update';
      else {
        const empty = after === null || after.trim() === '{}' || after.trim() === '';
        if (before === null) action = 'unchanged';
        else if (empty && manifest.created.includes(edit.file)) {
          action = 'delete';
          after = null;
        } else action = after === before ? 'unchanged' : 'remove';
      }
      out.push({ agent: t.label, file: edit.file, action, before, after, owned });
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
  manifest.originals ??= {};
  for (const c of changes) {
    if (c.action === 'unchanged') continue;
    if (mode === 'add') manifest.originals[c.file] = { before: manifest.originals[c.file] ? manifest.originals[c.file]!.before : c.before, after: c.after };
    else delete manifest.originals[c.file];
    if (c.action === 'delete') {
      rmSync(c.file, { force: true });
      manifest.created = manifest.created.filter((f) => f !== c.file);
      continue;
    }
    mkdirTracked(path.dirname(c.file), manifest);
    if (c.action === 'create' && !manifest.created.includes(c.file)) manifest.created.push(c.file);
    writeFileSync(c.file, c.after ?? '');
  }
  // Per file, the manifest holds exactly what setup's latest write left there.
  const touched = new Set(changes.map((c) => c.file));
  manifest.installed = [
    ...(manifest.installed ?? []).filter((k) => !touched.has(k.slice(0, k.indexOf(SEP)))),
    ...(mode === 'add' ? changes.flatMap((c) => c.owned.map((k) => `${c.file}${SEP}${k}`)) : []),
  ];
  if (mode === 'remove') {
    // Deepest first, and only directories that are empty now. .groundwork/ holds the manifest, so it goes last.
    const gwDir = gwPath(root);
    for (const d of [...manifest.createdDirs].filter((x) => x !== gwDir).sort((a, b) => b.length - a.length)) {
      try {
        if (readdirSync(d).length === 0) rmdirSync(d);
        manifest.createdDirs = manifest.createdDirs.filter((x) => x !== d);
      } catch {
        manifest.createdDirs = manifest.createdDirs.filter((x) => x !== d);
      }
    }
    const ownsGwDir = manifest.createdDirs.includes(gwDir);
    if (!manifest.created.length && manifest.createdDirs.every((x) => x === gwDir) && !manifest.installed.length) {
      rmSync(manifestPath(root), { force: true });
      if (ownsGwDir && readdirSync(gwDir).length === 0) rmdirSync(gwDir);
      return;
    }
  }
  mkdirSync(gwPath(root), { recursive: true });
  writeFileSync(manifestPath(root), JSON.stringify(manifest, null, 2) + '\n');
}
