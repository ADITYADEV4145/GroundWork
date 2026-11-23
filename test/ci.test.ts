import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { badgeMarkdown, checkSarif, COMMENT_MARKER, commitTexts, detectAi, readEvent, renderComment, renderSummary, repoSlug, runCheck, type CheckResult } from '../src/ci/index.js';
import { defaultConfig } from '../src/config/load.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import type { ScanFinding } from '../src/scan/index.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { REPLAY_PRS, replayRepo } from './ci-replay.js';

const roots: string[] = [];
const git = (root: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function repo(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-ci-')); roots.push(root);
  for (const [file, text] of Object.entries(replayRepo)) writeFileSync(path.join(root, file), text);
  git(root, 'init'); git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  return root;
}
async function check(root: string, files: Record<string, string>, options: Partial<Parameters<typeof runCheck>[2]> = {}) {
  const base = git(root, 'rev-parse', 'HEAD').trim();
  for (const [file, text] of Object.entries(files)) writeFileSync(path.join(root, file), text);
  git(root, 'add', '.'); git(root, 'commit', '-m', 'change');
  const config = defaultConfig();
  await initSqlBackend(); await refreshIndex(root, { config });
  const db = openDb(indexDbPath(root), { readonly: true });
  try { return await runCheck(db, root, { config, base, ...options }); } finally { db.close(); }
}
const finding = (over: Partial<ScanFinding> = {}): ScanFinding => ({ kind: 'invented-call', confidence: 'high', file: 'a.ts', line: 1, message: 'm', ...over } as ScanFinding);
const result = (over: Partial<CheckResult> = {}): CheckResult => ({ conclusion: 'pass', reason: null, blocking: [], warnings: [], lowConfidence: 0, files: 1, skipped: [], ms: 5, ...over });

describe('gw ci', () => {
  it('blocks invented calls and wrong arguments, warns on duplicates', async () => {
    const root = repo();
    const r = await check(root, {
      'use.ts': 'import { total, missing } from "./lists.js";\nexport const sum = total(1);\nexport const other = missing;\n',
      'copy.ts': replayRepo['lists.ts']!.replace('function chunk', 'function splitEvery').split('\n').slice(0, 9).join('\n') + '\n',
    });
    expect(r.conclusion).toBe('fail');
    expect(r.blocking.map((f) => f.kind).sort()).toEqual(['invented-call', 'wrong-arguments']);
    expect(r.warnings.map((f) => f.kind)).toContain('duplicate-logic');
    const sarif = checkSarif(r) as { runs: { results: { ruleId: string; level: string }[] }[] };
    expect(sarif.runs[0]!.results.filter((x) => x.level === 'error').map((x) => x.ruleId).sort()).toEqual(['invented-call', 'wrong-arguments']);
    expect(sarif.runs[0]!.results.find((x) => x.ruleId === 'duplicate-logic')!.level).toBe('warning');
  });

  it('follows configured severities and ignored paths', async () => {
    const files = { 'use.ts': 'import { total } from "./lists.js";\nexport const sum = total(1);\n' };
    expect((await check(repo(), files, { severity: { 'wrong-arguments': 'warn' } })).conclusion).toBe('pass');
    expect((await check(repo(), files, { severity: { 'wrong-arguments': 'warn' } })).warnings).toHaveLength(1);
    const off = await check(repo(), files, { severity: { 'wrong-arguments': 'off' } });
    expect([off.blocking.length, off.warnings.length]).toEqual([0, 0]);
    const ignored = await check(repo(), files, { ignore: ['use.*'] });
    expect([ignored.conclusion, ignored.blocking.length]).toEqual(['pass', 0]);
  });

  it('passes with no comment when the pull request changes nothing checkable', async () => {
    const r = await check(repo(), { 'notes.md': 'hello\n' });
    expect(r.conclusion).toBe('pass');
    expect(renderComment(r)).toBeNull();
  });

  it('writes one grouped comment capped at ten findings, blocking first', () => {
    const warnings = Array.from({ length: 9 }, (_, i) => finding({ kind: 'duplicate-logic', line: i + 1, message: `dup ${i}`, suggestion: 'chunk (lists.ts:1)' }));
    const blocking = [finding({ message: 'calls `x` <b>@team</b>', suggestion: 'total (lists.ts:10)' }), finding({ kind: 'wrong-arguments', line: 2 }), finding({ line: 3 })];
    const text = renderComment(result({ conclusion: 'fail', blocking, warnings }))!;
    expect(text.startsWith(COMMENT_MARKER)).toBe(true);
    expect(text.match(/^- /gm)).toHaveLength(10);
    expect(text.indexOf('**Blocking**')).toBeLessThan(text.indexOf('**Warnings**'));
    expect(text).toContain('Use `total (lists.ts:10)`.');
    expect(text).toContain('2 more not shown');
    expect(text).not.toContain('<b>');
    expect(text).not.toMatch(/@team/);
    expect(renderComment(result())).toBeNull();
    expect(renderComment(result({ conclusion: 'skipped', reason: 'x' }))).toBeNull();
    expect(renderSummary(result({ conclusion: 'skipped', reason: 'no agent label' }))).toContain('skipped (no agent label)');
  });

  it('detects agent-written pull requests from labels, bot authors and commit trailers', () => {
    const labels = defaultConfig().ci.aiLabels;
    const human = { author: 'octocat', authorIsBot: false, labels: [] as string[] };
    expect(detectAi(human, ['Ann <ann@example.com>\nFix the parser'], labels)).toBeNull();
    expect(detectAi({ ...human, labels: ['AI-Generated'] }, [], labels)).toBe('label AI-Generated');
    expect(detectAi({ ...human, author: 'devin-ai-integration[bot]', authorIsBot: true }, [], labels)).toContain('author');
    expect(detectAi({ ...human, author: 'dependabot[bot]', authorIsBot: true }, [], labels)).toBeNull();
    expect(detectAi(human, ['Ann <ann@example.com>\nFix\n\nCo-Authored-By: Claude <noreply@anthropic.com>'], labels)).toContain('commit trailer');
    expect(detectAi(human, ['Ann <ann@example.com>\nFix\n\nCo-authored-by: Claudette Jones <cj@example.com>'], labels)).toBeNull();
    expect(detectAi(human, ['Ann <ann@example.com>\nMove the cursor before reading'], labels)).toBeNull();
    expect(detectAi(human, ['Cursor Agent <cursoragent@cursor.com>\nFix'], labels)).toContain('commit author');
    expect(readEvent({ pull_request: { number: 7, base: { sha: 'a' }, head: { sha: 'b' }, user: { login: 'copilot-swe-agent[bot]', type: 'Bot' }, labels: [{ name: 'x' }] } }))
      .toEqual({ number: 7, base: 'a', head: 'b', author: 'copilot-swe-agent[bot]', authorIsBot: true, labels: ['x'] });
    expect(readEvent({ push: {} })).toBeNull();
    const root = repo();
    const base = git(root, 'rev-parse', 'HEAD').trim();
    writeFileSync(path.join(root, 'n.md'), 'x\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Add notes\n\nCo-Authored-By: Codex <codex@openai.com>');
    expect(detectAi(human, commitTexts(root, base), labels)).toContain('Codex');
  });

  it('builds the badge from the repository remote', () => {
    expect(repoSlug('https://git-manager.devin.ai/proxy/github.com/ADITYADEV4145/GroundWork')).toBe('ADITYADEV4145/GroundWork');
    expect(repoSlug('git@github.com:acme/app.git')).toBe('acme/app');
    expect(repoSlug('https://example.com/acme/app')).toBeNull();
    expect(badgeMarkdown('acme/app')).toBe('[![agent-checked](https://github.com/acme/app/actions/workflows/groundwork.yml/badge.svg)](https://github.com/acme/app/actions/workflows/groundwork.yml)');
  });

  // Phase 6 gate on a synthetic corpus: 20 scripted pull requests with known defects. Not real agent-written pull requests.
  it('replays 20 scripted pull requests: comment precision at least 90%, no comment on clean ones, under two minutes', async () => {
    expect(REPLAY_PRS).toHaveLength(20);
    const started = Date.now();
    let reported = 0, correct = 0, cleanComments = 0;
    const missed: string[] = [];
    for (const pr of REPLAY_PRS) {
      const r = await check(repo(), pr.files);
      const got = [...r.blocking, ...r.warnings].map((f) => `${f.kind} ${f.file}:${f.line}`);
      reported += got.length;
      correct += got.filter((g) => pr.expect.includes(g)).length;
      if (pr.expect.some((e) => !got.includes(e))) missed.push(pr.name);
      if (!pr.expect.length && renderComment(r) !== null) cleanComments++;
      expect(r.conclusion, pr.name).toBe(got.some((g) => /^(invented-call|wrong-arguments) /.test(g)) ? 'fail' : 'pass');
    }
    expect(cleanComments).toBe(0);
    expect(correct / reported).toBeGreaterThanOrEqual(0.9);
    expect(reported).toBe(14);
    // Known miss, kept in the corpus: a missing member of a namespace import is only a low-confidence finding, so it is not reported.
    expect(missed).toEqual(['calls a method the module does not export']);
    expect(Date.now() - started).toBeLessThan(120_000);
  }, 180_000);
});
