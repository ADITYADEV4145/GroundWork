import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config/load.js';
import { verifyChanged, type ChangedFile } from '../grounding/index.js';
import { discoverFiles } from '../index/discover.js';
import { importingFiles } from '../index/query.js';
import { refreshIndex } from '../index/refresh.js';
import { indexDbPath } from '../index/store.js';
import type { ToolContext } from '../mcp/registry.js';
import { checkIndexedChanges, type CheckReport } from '../reuse/check.js';
import { openDb } from '../store/db.js';
import { sha1 } from '../util/hash.js';
import { readRepoFile, repoRelative } from '../util/repo-file.js';
import { isDeclarationFile, originalPosition, type FileEdit } from './project.js';

const maxSnapshotBytes = 128 * 1024 * 1024;
const maxFileBytes = 8 * 1024 * 1024;
const gitOptions = { timeout: 10_000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' as const };
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const git = (cwd: string, args: string[], input?: string) =>
  execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { ...gitOptions, env: gitEnv, cwd, input, stdio: ['pipe', 'pipe', 'pipe'] });

function assertGitRoot(root: string) {
  const toplevel = git(root, ['rev-parse', '--show-toplevel']).trimEnd();
  if (realpathSync(toplevel) !== realpathSync(root)) throw new Error('Refactoring requires the Git working-tree root.');
}

function write(root: string, file: string, source: string | Buffer) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source);
}

const protectedPath = (file: string) => file.split('/').some((p) => ['.git', '.groundwork', 'node_modules'].includes(p));
const listed = (root: string) => git(root, ['ls-files', '-co', '--exclude-standard', '-z']).split('\0')
  .filter((file) => file && !protectedPath(file));

function snapshot(ctx: ToolContext, baseline: string, candidate: string, edits: FileEdit[]) {
  assertGitRoot(ctx.root);
  const source = new Set(discoverFiles(ctx.root, ctx.config));
  const absoluteRoot = realpathSync(ctx.root);
  const tracked = listed(ctx.root);
  const files = new Set([...tracked, ...source]);
  const proposed = new Map(edits.map((e) => [e.file, e]));
  const ignoreRules = new Map<string, Buffer>();
  const fingerprints = new Map<string, string>();
  let bytes = 0;
  if (files.size > 20_000) throw new Error('Too many files to prepare an isolated refactoring snapshot.');
  for (const file of files) {
    if (!file || repoRelative(ctx.root, file) !== file || protectedPath(file)) continue;
    const absolute = path.join(ctx.root, file);
    try {
      if (!lstatSync(absolute).isFile() || realpathSync(absolute) !== path.join(absoluteRoot, file)) {
        if (source.has(file)) throw new Error(`Cannot snapshot a linked source: ${file}`);
        continue;
      }
    } catch (e) {
      if (source.has(file) || (e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      continue;
    }
    if (source.has(file) || /(^|\/)(tsconfig\.json|jsconfig\.json|\.gitignore)$/.test(file)) {
      const content = readRepoFile(ctx.root, file, maxFileBytes);
      if (!content || (bytes += content.length) > maxSnapshotBytes) throw new Error('Refactoring snapshot exceeded its size limit or a source changed while reading.');
      fingerprints.set(file, sha1(content));
      if (path.basename(file) === '.gitignore') {
        ignoreRules.set(file, content);
        continue;
      }
      const edit = proposed.get(file);
      if (edit && !Buffer.from(edit.before).equals(content)) throw new Error(`File changed while planning: ${file}`);
      write(baseline, file, content);
      write(candidate, file, edit?.after ?? content);
    } else {
      // Grounding checks asset paths for existence; their contents are not needed.
      write(baseline, file, '');
      write(candidate, file, '');
    }
  }
  const assertCurrent = () => {
    if (JSON.stringify(loadConfig(ctx.root)) !== JSON.stringify(ctx.config)) {
      throw new Error('Groundwork configuration changed during validation. Nothing applied.');
    }
    const current = discoverFiles(ctx.root, ctx.config);
    if (current.length !== source.size || current.some((file) => !source.has(file)) ||
      listed(ctx.root).join('\0') !== tracked.join('\0')) throw new Error('Working-tree files changed during validation. Nothing applied.');
    for (const [file, hash] of fingerprints) {
      const bytes = readRepoFile(ctx.root, file, maxFileBytes);
      if (!bytes || sha1(bytes) !== hash) throw new Error(`Working-tree file changed during validation: ${file}. Nothing applied.`);
    }
  };
  return { ignoreRules, assertCurrent };
}

function makePatch(directory: string): string {
  const result = spawnSync('git', ['--no-pager', '-c', 'core.quotePath=true', '-c', 'core.autocrlf=false', 'diff', '--no-index',
    '--no-prefix', '--binary', '--no-renames', '--no-ext-diff', '--no-textconv', '--', 'before', 'after'],
  { ...gitOptions, env: gitEnv, cwd: directory });
  if (result.error) throw result.error;
  if (result.status !== 1 || !result.stdout) throw new Error('Could not produce a refactoring patch.');
  return result.stdout;
}

function changedFiles(edits: FileEdit[]): ChangedFile[] {
  return edits.map((e) => {
    let cursor = 0, line = 1;
    return {
      file: e.file,
      ranges: e.edits.map((edit) => {
        line += e.before.slice(cursor, edit.start).split('\n').length - 1;
        const start = line;
        line += edit.text.split('\n').length - 1;
        cursor = edit.end;
        return [start, line];
      }),
    };
  });
}

export async function guardCandidate(ctx: ToolContext, edits: FileEdit[], renamedFile?: string): Promise<{ patch: string; check: CheckReport; assertCurrent: () => void }> {
  const directory = mkdtempSync(path.join(tmpdir(), 'gw-refactor-'));
  const baseline = path.join(directory, 'before'), candidate = path.join(directory, 'after');
  try {
    mkdirSync(baseline);
    mkdirSync(candidate);
    const { ignoreRules, assertCurrent } = snapshot(ctx, baseline, candidate, edits);
    const patch = makePatch(directory);
    await refreshIndex(baseline, { config: ctx.config });
    await refreshIndex(candidate, { config: ctx.config });
    for (const [file, content] of ignoreRules) {
      write(baseline, file, content);
      write(candidate, file, content);
    }
    const before = openDb(indexDbPath(baseline), { readonly: true });
    try {
      const after = openDb(indexDbPath(candidate), { readonly: true });
      try {
        const importers = renamedFile === undefined ? [] : importingFiles(before, renamedFile);
        const candidateFiles = new Map(changedFiles(edits).map((c) => [c.file, c]));
        for (const file of importers) {
          if (!isDeclarationFile(file)) candidateFiles.set(file, { file, ranges: null });
        }
        const reports = verifyChanged(after, candidate, [...candidateFiles.values()], ctx.config);
        const unchecked = reports.find((r) => r.unchecked);
        if (unchecked) throw new Error(`Cannot ground candidate in ${unchecked.file}: ${unchecked.unchecked}.`);
        const baselines = [...candidateFiles.keys()].map((file) => ({ file, ranges: null }));
        const baseFindings = verifyChanged(before, baseline, baselines, ctx.config).flatMap((r) => r.findings);
        const byFile = new Map(edits.map((e) => [e.file, e]));
        const lineStarts = { before: new Map<string, number[]>(), after: new Map<string, number[]>() };
        const signature = (f: typeof baseFindings[number], revision: 'before' | 'after') => {
          const edit = byFile.get(f.file);
          if (!lineStarts[revision].has(f.file)) {
            const text = edit?.[revision] ?? readFileSync(path.join(baseline, f.file), 'utf8');
            lineStarts[revision].set(f.file, [0, ...Array.from(text.matchAll(/\n/g), (m) => m.index + 1)]);
          }
          const offset = lineStarts[revision].get(f.file)![f.line - 1]! + (f.column ?? 0);
          const original = edit && revision === 'after' ? originalPosition(edit.edits, offset) : offset;
          return JSON.stringify([f.file, f.kind, f.name, f.blocking, f.message, original]);
        };
        const existing = new Map<string, number>();
        for (const f of baseFindings) {
          const key = signature(f, 'before');
          existing.set(key, (existing.get(key) ?? 0) + 1);
        }
        const findings = reports.flatMap((r) => r.findings).filter((f) => {
          const key = signature(f, 'after');
          const count = existing.get(key) ?? 0;
          if (count) existing.set(key, count - 1);
          return count === 0;
        });
        const check = await checkIndexedChanges(candidate, after, baseline, before, ctx.config, findings, ctx.root, 10_000);
        return { patch, check, assertCurrent };
      } finally { after.close(); }
    } finally { before.close(); }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function applyPatch(root: string, patch: string): void {
  assertGitRoot(root);
  git(root, ['-c', 'core.autocrlf=false', 'apply', '-p1', '--whitespace=nowarn', '--'], patch);
}
