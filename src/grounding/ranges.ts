import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { toPosix } from '../util/paths.js';
import type { LineRange } from './verify.js';

// Which lines did the agent just change? From an edit tool's input (hook path) or a git diff (`gw verify --changed`).

export interface ChangedFile {
  file: string;
  /** null = the whole file (a Write, or an edit whose new text we cannot locate). */
  ranges: LineRange[] | null;
}

/** "10-20,31" -> [[10,20],[31,31]] */
export function parseLineSpec(spec: string): LineRange[] {
  return spec
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [a, b] = p.split('-').map((n) => Number(n));
      if (!Number.isInteger(a) || (b !== undefined && !Number.isInteger(b))) throw new Error(`bad line range '${p}'`);
      return [a!, b ?? a!] as LineRange;
    });
}

function lineOf(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** Lines in `text` where each inserted snippet now sits. */
export function locate(text: string, snippets: string[]): LineRange[] {
  const out: LineRange[] = [];
  for (const s of snippets) {
    if (!s.trim()) continue;
    const span = s.split('\n').length - 1;
    for (let at = text.indexOf(s); at !== -1; at = text.indexOf(s, at + Math.max(1, s.length))) {
      const start = lineOf(text, at);
      out.push([start, start + span]);
    }
  }
  return out;
}

function rel(root: string, cwd: string, file: string): string | null {
  const r = toPosix(path.relative(root, path.resolve(cwd, file)));
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : null;
}

function readText(root: string, file: string): string | null {
  try {
    return readFileSync(path.join(root, file), 'utf8');
  } catch {
    return null;
  }
}

/** Claude Edit/Write/MultiEdit, Cursor edit_file and Codex apply_patch inputs. */
export function changedFromToolInput(root: string, cwd: string, input: Record<string, unknown>): ChangedFile[] {
  const file = typeof input.file_path === 'string' ? input.file_path : typeof input.path === 'string' ? input.path : typeof input.target_file === 'string' ? input.target_file : null;
  if (file) {
    const r = rel(root, cwd, file);
    if (!r) return [];
    const snippets: string[] = [];
    if (typeof input.new_string === 'string') snippets.push(input.new_string);
    if (Array.isArray(input.edits)) for (const e of input.edits) if (e && typeof (e as { new_string?: unknown }).new_string === 'string') snippets.push((e as { new_string: string }).new_string);
    if (!snippets.length) return [{ file: r, ranges: null }];
    const text = readText(root, r);
    return text === null ? [] : [{ file: r, ranges: locate(text, snippets) }];
  }
  const patch = [input.patch, input.input, input.command].map((v) => (Array.isArray(v) ? v.join('\n') : v)).find((v): v is string => typeof v === 'string' && v.includes('*** '));
  return patch ? changedFromApplyPatch(root, cwd, patch) : [];
}

export function changedFromApplyPatch(root: string, cwd: string, patch: string): ChangedFile[] {
  const added = new Map<string, string[]>();
  let cur: string[] | null = null;
  for (const line of patch.split('\n')) {
    const m = /^\*\*\* (Add|Update) File: (.+)$/.exec(line) ?? /^\*\*\* Move to: (.+)$/.exec(line);
    if (m) {
      const r = rel(root, cwd, (m[2] ?? m[1]!).trim());
      cur = r ? (added.get(r) ?? []) : null;
      if (r && cur) added.set(r, cur);
    } else if (/^\*\*\* /.test(line)) cur = null;
    else if (cur && line.startsWith('+')) cur.push(line.slice(1));
  }
  const out: ChangedFile[] = [];
  for (const [file, lines] of added) {
    const text = readText(root, file);
    if (text === null) continue;
    const fileLines = text.split('\n');
    const want = new Set(lines.filter((l) => l.trim()));
    const ranges: LineRange[] = [];
    fileLines.forEach((l, i) => {
      if (want.has(l)) ranges.push([i + 1, i + 1]);
    });
    out.push({ file, ranges });
  }
  return out;
}

/** Lines added or changed since `base` (default HEAD), plus untracked files in full. */
export function changedFromGit(root: string, base = 'HEAD'): ChangedFile[] {
  const run = (args: string[]) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).toString();
  const byFile = new Map<string, LineRange[]>();
  let cur: LineRange[] | null = null;
  for (const line of run(['diff', '-U0', '--no-color', '--no-ext-diff', base, '--']).split('\n')) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      cur = p === '/dev/null' ? null : (byFile.get(p.replace(/^b\//, '')) ?? []);
      if (cur) byFile.set(p.replace(/^b\//, ''), cur);
      continue;
    }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m && cur) {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      if (count > 0) cur.push([start, start + count - 1]);
    }
  }
  const out: ChangedFile[] = [...byFile].filter(([, r]) => r.length).map(([file, ranges]) => ({ file, ranges }));
  for (const f of run(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) out.push({ file: f, ranges: null });
  return out;
}
