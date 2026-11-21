import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { runCommand } from '../src/cli/commands/run.js';
import { bumpCounter, emptyLedger, readLedger, report, sessionIds, stats, summary, tokens, updateLedger } from '../src/guards/ledger.js';
import { commandInfo, lastSummary, workspaceFingerprint } from '../src/guards/repeat.js';
import { compactOutput, failurePattern, isSimpleNoisyCommand, noisyTool, shellQuote } from '../src/guards/trimmer.js';
import { wasteGuards } from '../src/hooks/handlers/waste-guards.js';
import { normalise, render, dispatch } from '../src/hooks/run.js';
import { readSessionLedger, updateSessionLedger } from '../src/hooks/session-ledger.js';
import * as sessionLedger from '../src/hooks/session-ledger.js';
import type { HookEvent } from '../src/hooks/types.js';
import { analyzeCorpus, failureCorpus, repeatScenario } from '../src/selftest/checks/phase5.js';

let root: string;
const git = (args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
const ctx = () => ({ root, config: structuredClone(defaultConfig()) });
const event = (event: HookEvent['event'] = 'pre_tool', tool = 'Bash', input: Record<string, unknown> = { command: 'ls' }): HookEvent => ({ agent: 'claude', sessionId: 'test', cwd: root, event, tool, input, response: 'one\ntwo\n', raw: {} });
beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'gw-guards-test-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
function initGit() {
  git(['init', '-q']); writeFileSync(path.join(root, '.gitignore'), '.groundwork/\n'); git(['add', '.gitignore']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-qm', 'fixture']);
}

describe('session ledger', () => {
  it('tolerates absent/corrupt state and never creates a session without an id', () => {
    expect(readLedger(root, 'test').step).toBe(0);
    updateLedger(root, null, () => { throw new Error('must not run'); });
    expect(sessionIds(root)).toEqual([]);
    mkdirSync(path.join(root, '.groundwork/sessions'), { recursive: true });
    writeFileSync(path.join(root, '.groundwork/sessions/test.json'), '{broken');
    expect(readLedger(root, 'test').step).toBe(0);
    updateLedger(root, 'test', (l) => { l.step++; });
    expect(readLedger(root, 'test').step).toBe(0);
    expect(readFileSync(path.join(root, '.groundwork/sessions/test.json'), 'utf8')).toBe('{broken');
    rmSync(path.join(root, '.groundwork/sessions/test.json'));
    updateLedger(root, 'test', (l) => { l.step++; });
    expect(readLedger(root, 'test').step).toBe(1);
  });
  it('preserves navigation and unknown top-level data verbatim', () => {
    const navigation = { files: { 'src/a.ts': 'sha256' }, nested: [1, false, null] };
    updateSessionLedger(root, 'test', () => ({ navigation, future: ['opaque'] }));
    updateLedger(root, 'test', (l) => { stats(l, 'repeatCommand').tokensSaved = 40; });
    expect(readSessionLedger(root, 'test')).toMatchObject({ navigation, future: ['opaque'], guards: { method: 'bytes/4' } });
    const before = readFileSync(path.join(root, '.groundwork/sessions/test.json'), 'utf8');
    updateSessionLedger(root, 'test', (l) => l);
    expect(readFileSync(path.join(root, '.groundwork/sessions/test.json'), 'utf8')).toBe(before);
  });
  it('aggregates measured stats and generic counters', () => {
    updateLedger(root, 'test', (l) => { const s = stats(l, 'repeatCommand'); s.tokensSaved = 38000; s.interventions = 3; s.forced = 1; });
    bumpCounter(root, 'test', 'duplicatesPrevented'); bumpCounter(root, 'test', 'inventedCallsCaught', 2); bumpCounter(root, 'test', 'ignores');
    const l = report(root, ['test']);
    expect(l.forceRate).toBe(0.25); expect(l.ignores).toBe(1); expect(tokens('é')).toBe(0.5);
    expect(summary(l)).toBe('Groundwork saved ~38k tokens, blocked 1 duplicate, caught 2 invented calls.');
    expect(report(root, []).forceRate).toBe(0);
  });
  it('fails open on an occupied session lock and unwritable state', () => {
    mkdirSync(path.join(root, '.groundwork/sessions'), { recursive: true });
    writeFileSync(path.join(root, '.groundwork/sessions/test.json.lock'), 'busy');
    expect(() => updateSessionLedger(root, 'test', (l) => ({ ...l }))).toThrow('locked');
    expect(() => updateLedger(root, 'test', (l) => { l.step++; })).not.toThrow();
    expect(readLedger(root, 'test').step).toBe(0);
    utimesSync(path.join(root, '.groundwork/sessions/test.json.lock'), new Date(0), new Date(0));
    updateLedger(root, 'test', (l) => { l.step++; });
    expect(readLedger(root, 'test').step).toBe(1);
  });
  it('uses the locked callback snapshot rather than a second read', () => {
    const snapshot = emptyLedger('test'); snapshot.step = 42;
    let result: Record<string, unknown> | undefined;
    const spy = vi.spyOn(sessionLedger, 'updateSessionLedger').mockImplementation((_root, _id, update) => {
      result = update({ navigation: { untouched: true }, guards: snapshot });
    });
    try {
      updateLedger(root, 'test', (l) => { l.step++; }); expect(spy).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ navigation: { untouched: true }, guards: { step: 43 } });
    }
    finally { spy.mockRestore(); }
  });
  it('validates malformed guard state and fails open for invalid ids in every wrapper', () => {
    updateSessionLedger(root, 'test', () => ({ navigation: { intact: true }, guards: { sessionId: 'test', step: 'broken' } }));
    updateLedger(root, 'test', (l) => { l.step++; });
    expect(readLedger(root, 'test').step).toBe(1);
    expect(readSessionLedger(root, 'test').navigation).toEqual({ intact: true });
    for (const id of ['bad/id', 'bad.id']) {
      expect(() => readSessionLedger(root, id)).toThrow();
      expect(() => updateSessionLedger(root, id, (l) => l)).toThrow();
      expect(() => updateLedger(root, id, () => { throw new Error('must not execute'); })).not.toThrow();
      expect(() => bumpCounter(root, id, 'ignores')).not.toThrow();
      expect(readLedger(root, id).step).toBe(0);
      expect(report(root, [id]).forced).toBe(0);
    }
    writeFileSync(path.join(root, '.groundwork/sessions/bad%2Fid.json'), '{}');
    expect(sessionIds(root)).toEqual(['test']);
  });
  it('shared reader throws on corrupt or nonobject JSON, but missing files are empty', () => {
    expect(readSessionLedger(root, 'missing')).toEqual({});
    mkdirSync(path.join(root, '.groundwork/sessions'), { recursive: true });
    for (const value of ['{broken', '[]', 'null']) {
      writeFileSync(path.join(root, '.groundwork/sessions/test.json'), value);
      expect(() => readSessionLedger(root, 'test')).toThrow();
      expect(readLedger(root, 'test').step).toBe(0);
      expect(report(root, ['test']).forced).toBe(0);
    }
  });
});

describe('repeat guard', () => {
  for (const scenario of ['repeat-intercept', 'changed-then-allowed', 'force', 'time-dependent exemption'])
    it(scenario, async () => { expect(await repeatScenario(scenario)).toBe(true); });
  it('normalizes whitespace and strips either force marker', () => {
    expect(commandInfo('  GW_FORCE=1 ls   -al ')).toEqual({ command: 'ls   -al ', normalized: 'ls -al', forced: true });
    expect(commandInfo(' ls # gw:force').normalized).toBe('ls');
    expect(lastSummary('a\n\nb\nc\n')).toBe('b\nc');
  });
  it('fingerprints dirty and untracked contents, ignores ignored files and fails open outside git', () => {
    expect(workspaceFingerprint(root)).toBe('unknown'); initGit();
    const initial = workspaceFingerprint(root);
    writeFileSync(path.join(root, 'new'), 'one'); const changed = workspaceFingerprint(root);
    expect(changed).not.toBe(initial); writeFileSync(path.join(root, 'new'), 'two'); expect(workspaceFingerprint(root)).not.toBe(changed);
    rmSync(path.join(root, 'new')); mkdirSync(path.join(root, '.groundwork')); writeFileSync(path.join(root, '.groundwork/log'), 'ignored'); expect(workspaceFingerprint(root)).toBe(initial);
    writeFileSync(path.join(root, 'large'), Buffer.alloc(1024 * 1024 + 1)); expect(workspaceFingerprint(root)).not.toBe('unknown');
  });
  it('counts saved bytes and force, respects toggles and no-session, never blocks unknown fingerprints', async () => {
    const ev = event('post_tool'); await wasteGuards.run(ev, ctx());
    ev.event = 'pre_tool'; expect((await wasteGuards.run(ev, ctx()))?.action).not.toBe('deny');
    initGit(); ev.event = 'post_tool'; await wasteGuards.run(ev, ctx());
    ev.event = 'pre_tool'; expect((await wasteGuards.run(ev, ctx()))?.action).toBe('deny');
    expect(readLedger(root, 'test').guards.repeatCommand?.tokensSaved).toBe(2);
    ev.input.command = 'GW_FORCE=1 ls'; await wasteGuards.run(ev, ctx()); expect(readLedger(root, 'test').guards.repeatCommand?.forced).toBe(1);
    const c = ctx(); c.config.guards.repeatCommand.enabled = false; ev.input.command = 'ls'; expect((await wasteGuards.run(ev, c))?.action).not.toBe('deny');
    ev.sessionId = null; expect(await wasteGuards.run(ev, ctx())).toBeNull();
  });
  it('allows a command after a staged file is edited and staged again', async () => {
    initGit();
    const file = path.join(root, 'tracked.txt');
    writeFileSync(file, 'base'); git(['add', 'tracked.txt']); git(['-c', 'user.name=Test', '-c', 'user.email=test@localhost', 'commit', '-qm', 'tracked']);
    writeFileSync(file, 'first edit'); git(['add', 'tracked.txt']);
    const before = workspaceFingerprint(root);
    await wasteGuards.run(event('post_tool'), ctx());
    expect((await wasteGuards.run(event(), ctx()))?.action).toBe('deny');
    writeFileSync(file, 'second edit'); git(['add', 'tracked.txt']);
    expect(workspaceFingerprint(root)).not.toBe(before);
    expect((await wasteGuards.run(event(), ctx()))?.action).not.toBe('deny');
  });
});

describe('output trimmer', () => {
  it('detects noisy commands without matching arbitrary command substrings', () => {
    for (const command of ['pytest -q', 'npx vitest run', 'jest', 'tsc --noEmit', 'eslint src', 'ruff check', 'npm test', 'npm run build', 'npm run lint', 'pnpm test', 'yarn install', 'pip install a']) expect(noisyTool(command)).not.toBeNull();
    expect(noisyTool('echo harmless')).toBeNull(); expect(noisyTool('mytsc')).toBeNull();
  });
  it('retains small and empty output exactly', () => { expect(compactOutput('')).toBe(''); expect(compactOutput('hello\n')).toBe('hello\n'); });
  it('preserves every failure in the 50-output corpus', () => {
    const corpus = failureCorpus(); expect(corpus).toHaveLength(50);
    const proof = analyzeCorpus(corpus); expect(proof.issues).toEqual([]); expect(proof.averageByteReduction).toBeGreaterThanOrEqual(0.5);
    for (const f of corpus) {
      const compact = compactOutput(f.output, f.tool);
      for (const line of f.expected) expect(compact).toContain(line);
      for (const line of f.output.split('\n').filter((line) => failurePattern.test(line))) expect(compact).toContain(line);
      expect(compact.length).toBeLessThan(f.output.length);
    }
  });
  it('rejects vacuous short fixtures and outputs that do not compact', () => {
    expect(analyzeCorpus([{ tool: 'generic', output: 'FAIL small\n', expected: ['FAIL small'] }]).issues.join('\n')).toContain('input lines');
    expect(analyzeCorpus([{ tool: 'generic', output: 'FAIL error\n'.repeat(70), expected: ['FAIL error'] }]).issues.join('\n')).toContain('not compacted');
    expect(analyzeCorpus([]).averageByteReduction).toBe(0);
  });
  it('generic fallback keeps failures plus three context lines and final summary', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`); lines[40] = '✗ unexpected failure';
    const out = compactOutput(lines.join('\n')); expect(out).toContain(lines.slice(37, 44).join('\n')); expect(out).toContain('line 99');
  });
  it('only rewrites simple noisy commands without overriding permission checks', async () => {
    for (const command of ['rm -rf x; npm test', 'npm test | tee log', 'npm test && git push', 'npm test || git push', 'npm test &', 'npm test > log', 'npm test < input', 'npm test\nwhoami', 'npm test $(whoami)', 'npm test "$(whoami)"', 'npm test `whoami`', 'npm test <(cat input)', 'echo "npm test"', '']) {
      expect(isSimpleNoisyCommand(command), command).toBe(false);
      expect((await wasteGuards.run(event('pre_tool', 'Bash', { command }), ctx()))?.updatedInput, command).toBeUndefined();
    }
    for (const command of ['npx vitest run', 'CI=1 npm test', 'pnpm exec vitest run', 'python -m pytest', 'npm test -- "a;b|c&d"', "npm test -- '$(literal)'", 'npm test -- a\\;b']) {
      expect(isSimpleNoisyCommand(command), command).toBe(true);
      expect((await wasteGuards.run(event('pre_tool', 'Bash', { command }), ctx()))?.updatedInput, command).toBeDefined();
    }
    expect(isSimpleNoisyCommand('npm test "unfinished')).toBe(false);
  });
  it('rewrites Claude pre-tool input only and leaves permissions unchanged', async () => {
    const ev = event('pre_tool', 'Bash', { command: 'npm test', timeout: 2000 });
    const r = await dispatch(ev, root); expect(r.updatedInput?.command).toContain(' run -- '); expect(r.updatedInput?.timeout).toBe(2000);
    expect(JSON.parse(render(ev, r)).hookSpecificOutput.permissionDecision).toBeUndefined();
    ev.agent = 'codex'; expect(render(ev, { action: 'allow', updatedInput: { command: 'different' } })).toBe('');
    expect((await wasteGuards.run(ev, ctx()))?.updatedInput).toBeUndefined();
    ev.agent = 'claude'; const c = ctx(); c.config.guards.outputTrimmer.enabled = false;
    expect((await wasteGuards.run(ev, c))?.updatedInput).toBeUndefined();
  });
  it('run logs full output, preserves exit code, and records actual savings', async () => {
    initGit();
    const script = `for(let i=0;i<100;i++) console.log('progress '+i); console.error('Error: src/a.ts:2: expected 1');process.exitCode=7;`;
    const result = await runCommand(root, `${shellQuote(process.execPath)} -e ${shellQuote(script)}`, 'test', root);
    expect(result.exitCode).toBe(7); expect(result.output).toContain('Error: src/a.ts:2: expected 1'); expect(result.output).toContain('Full log:');
    expect(readFileSync(result.logPath, 'utf8')).toContain('progress 0'); expect(readLedger(root, 'test').guards.outputTrimmer?.tokensSaved).toBeGreaterThan(0);
    const failed = await runCommand(root, 'this_command_does_not_exist_gw', undefined, root); expect(failed.exitCode).not.toBe(0); expect(failed.output).toMatch(/not found/);
  });
  it('run uses bash for bash-specific shell syntax', async () => {
    const result = await runCommand(root, '[[ 2 -gt 1 ]] && printf bash-ok', undefined, root);
    expect(result.exitCode).toBe(0); expect(result.output).toContain('bash-ok');
  });
});

describe('exploration and summary', () => {
  it('counts distinct reads, hints once after threshold and resets on edits', async () => {
    const c = ctx(); c.config.guards.explorationHint.threshold = 1;
    const ev = event('post_tool', 'Read', { file_path: 'one.ts' });
    expect(await wasteGuards.run(ev, c)).toBeNull(); expect(await wasteGuards.run(ev, c)).toBeNull();
    ev.input.file_path = 'two.ts'; expect((await wasteGuards.run(ev, c))?.action).toBe('context'); expect(await wasteGuards.run(ev, c)).toBeNull();
    ev.tool = 'Edit'; await wasteGuards.run(ev, c); expect(readLedger(root, 'test').exploration).toEqual({ files: [], hinted: false });
    ev.tool = 'Glob'; ev.response = { filenames: ['a.ts', 'b.ts'] }; expect((await wasteGuards.run(ev, c))?.action).toBe('context');
    c.config.guards.explorationHint.enabled = false; ev.tool = 'Read'; ev.input.file_path = 'three'; expect(await wasteGuards.run(ev, c)).toBeNull();
  });
  it('stop summary is opt-in, nonblocking and respects stop_hook_active', async () => {
    const ev = normalise('claude', 'stop', { session_id: 'test', cwd: root }); const c = ctx();
    expect(await wasteGuards.run(ev, c)).toBeNull(); c.config.guards.sessionSummary = true;
    const r = await wasteGuards.run(ev, c); expect(r?.action).toBe('context'); expect(render(ev, r!)).toContain('systemMessage');
    ev.raw = { stop_hook_active: true }; expect(await wasteGuards.run(ev, c)).toBeNull();
  });
});

describe('waste CLI', () => {
  const cli = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url));
  const invoke = (args: string[]) => execFileSync(process.execPath, ['--import', 'tsx', cli, '--root', root, '--json', ...args], { encoding: 'utf8' });
  it('hooks allow invalid session ids with clean stdout and exit zero', () => {
    for (const id of ['bad/id', 'bad.id']) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', cli, 'hook', 'claude', 'pre_tool'], {
        encoding: 'utf8', input: JSON.stringify({ session_id: id, cwd: root, tool_name: 'Bash', tool_input: { command: 'npm test' } }),
      });
      expect(result.status).toBe(0); expect(result.stdout).toBe(''); expect(result.stderr).toBe('');
    }
  });
  it('reports latest, explicit and aggregate sessions as JSON, including empty state', () => {
    expect(JSON.parse(invoke(['report'])).forced).toBe(0);
    bumpCounter(root, 'first', 'duplicatesPrevented', 2); bumpCounter(root, 'second', 'inventedCallsCaught', 3);
    utimesSync(path.join(root, '.groundwork/sessions/first.json'), new Date(0), new Date(0));
    expect(JSON.parse(invoke(['report', '--session', 'first'])).duplicatesPrevented).toBe(2);
    expect(JSON.parse(invoke(['report', '--all'])).inventedCallsCaught).toBe(3);
    expect(JSON.parse(invoke(['report'])).sessionId).toBe('second');
  });
  it('run supports JSON and argv without shell injection', () => {
    const result = JSON.parse(invoke(['run', '--', process.execPath, '-e', 'console.log("hello");']));
    expect(result.exitCode).toBe(0); expect(result.output).toContain('hello'); expect(result.logPath).toContain('.groundwork/logs/');
  });
});
