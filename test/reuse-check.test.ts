import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as policy from '../src/reuse/policy.js';
import { defaultConfig } from '../src/config/load.js';
import { duplicateGate } from '../src/hooks/handlers/duplicate_gate.js';
import { HANDLERS } from '../src/hooks/handlers/index.js';
import { dispatch, normalise, render } from '../src/hooks/run.js';
import { readFingerprintedSymbols } from '../src/index/query.js';
import { indexDbPath } from '../src/index/store.js';
import { checkRepository, formatCheck, formatFinding, type CheckReport } from '../src/reuse/check.js';
import { CandidateIndex } from '../src/reuse/candidates.js';
import { inspectSource } from '../src/reuse/inspection.js';
import { thresholds } from '../src/reuse/model.js';
import { assertCheckScenario, assertStopScenario, CHECK_SCENARIOS, scenarioGit, stopEvent, withCheckScenario, writeScenarioFile } from '../src/reuse/scenarios.js';
import { openDb } from '../src/store/db.js';
import { estimateTokens } from '../src/util/tokens.js';

const MAIN = path.resolve(__dirname, '../src/cli/main.ts');
const TSX = import.meta.resolve('tsx');

describe('combined reuse and grounding check', () => {
  it('blocks definite grounding errors through check and Stop, then passes after correction', async () => {
    await withCheckScenario('clean', async (root) => {
      writeScenarioFile(root, '.groundwork/config.json', JSON.stringify({ profile: 'strict' }));
      writeScenarioFile(root, 'caller.ts', "import { parseDateString } from './utils.js';\nparseDateString();\n");
      const report = await checkRepository(root);
      expect(report.status).toBe('BLOCK');
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0]).toMatchObject({ kind: 'grounding', severity: 'BLOCK', grounding: { kind: 'arity', blocking: true } });
      expect(formatCheck(report)).toContain('BLOCK grounding (arity): caller.ts:2');
      const json = cli(root, 'check', '--json');
      expect(json.status).toBe(1);
      expect(JSON.parse(json.stdout).findings[0].grounding.kind).toBe('arity');
      const payload = { cwd: root, session_id: 'grounding-stop' };
      expect(JSON.parse(hook(root, payload).stdout)).toMatchObject({ decision: 'block', reason: expect.stringContaining('grounding') });
      expect(hook(root, payload).stdout).toBe('');
      writeScenarioFile(root, 'caller.ts', "import { parseDateString } from './utils.js';\nparseDateString('2024-01-01');\n");
      expect((await checkRepository(root)).findings).toEqual([]);
      expect(cli(root, 'check').status).toBe(0);
    });
  });

  it('keeps uncertain grounding findings nonblocking and honors changed lines, base and config', async () => {
    await withCheckScenario('clean', async (root) => {
      writeScenarioFile(root, 'caller.ts', "import * as dates from './utils.js';\ndates.missing('2024-01-01');\n");
      const report = await checkRepository(root);
      expect(report.status).toBe('WARN');
      expect(report.findings[0]).toMatchObject({ kind: 'grounding', severity: 'WARN', grounding: { kind: 'unknown-member', blocking: false } });
      expect(cli(root, 'check').status).toBe(0);
      scenarioGit(root, 'add', 'caller.ts');
      scenarioGit(root, 'commit', '-qm', 'existing grounding warning');
      writeScenarioFile(root, 'caller.ts', readFileSync(path.join(root, 'caller.ts'), 'utf8') + '\n// unrelated edit\n');
      expect((await checkRepository(root)).findings).toEqual([]);
      expect((await checkRepository(root, { base: 'HEAD~1' })).findings).toHaveLength(1);
      const config = defaultConfig();
      config.grounding.enabled = false;
      expect((await checkRepository(root, { base: 'HEAD~1', config })).findings).toEqual([]);
      config.grounding.enabled = true;
      config.grounding.exclude = ['caller.ts'];
      expect((await checkRepository(root, { base: 'HEAD~1', config })).findings).toEqual([]);
    });
  });
});

describe('budgeted check output', () => {
  it('ranks blocks before warnings, bounds output, and points to complete JSON', () => {
    const findings: CheckReport['findings'] = Array.from({ length: 100 }, (_, i) => ({
      id: String(i), kind: 'duplicate', severity: i === 99 ? 'BLOCK' : 'WARN',
      added: { file: `added-${i}.ts`, symbol: `clone${i}`, line: 1 },
      existing: { file: 'original.ts', symbol: 'original', line: 1 },
      signals: [], fix: 'Reuse original from original.ts.',
    }));
    const report: CheckReport = { status: 'BLOCK', blocked: true, base: 'HEAD', findings, allows: [], ms: 0 };
    const output = formatCheck(report);
    expect(output.startsWith('BLOCK duplicate: clone99')).toBe(true);
    expect(output).toMatch(/\d+ more findings.*--json/);
    expect(estimateTokens(output)).toBeLessThanOrEqual(500);
    expect(report.findings[0]!.severity).toBe('WARN');
    const small = { ...report, findings: [findings[99]!] };
    expect(formatCheck(small)).toBe(formatFinding(findings[99]!));
    expect(formatCheck({ ...report, findings: [] })).toBe('PASS: no reuse findings.');
    const huge = { ...findings[99]!, fix: '界'.repeat(10000) };
    const hugeOutput = formatCheck({ ...report, findings: [huge] });
    expect(estimateTokens(hugeOutput)).toBeLessThanOrEqual(500);
    expect(hugeOutput).toContain('BLOCK');
    expect(hugeOutput).toContain('--json');
  });
});
const cli = (root: string, ...args: string[]) => spawnSync(process.execPath, ['--import', TSX, MAIN, '--root', root, ...args], { encoding: 'utf8' });
const hook = (root: string, payload: unknown) => spawnSync(process.execPath, ['--import', TSX, MAIN, 'hook', 'claude', 'stop'], {
  cwd: root, encoding: 'utf8', input: typeof payload === 'string' ? payload : JSON.stringify(payload),
});

describe('git-scripted reuse check scenarios (also exercised by selftest)', () => {
  it.each(CHECK_SCENARIOS)('%s', async (name) => {
    await withCheckScenario(name, async (root) => {
      const report = await checkRepository(root);
      assertCheckScenario(name, report, root);
      for (const f of report.findings) {
        expect(formatFinding(f).split('\n').length).toBeLessThanOrEqual(6);
        expect(f.signals).toHaveLength(2);
        expect(formatFinding(f)).toContain('Fix:');
        if (f.kind === 'duplicate' && f.severity === 'BLOCK') expect(f.probability!).toBeGreaterThanOrEqual(thresholds.block);
      }
      if (!report.findings.length) expect(formatCheck(report)).toBe('PASS: no reuse findings.');
    });
  });

  it('counts getter noise independently of the tiny-body filter and honors skipTests', async () => {
    await withCheckScenario('getters', async (root) => {
      await checkRepository(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        const symbols = readFingerprintedSymbols(db);
        expect(symbols.find((s) => s.qualifiedName === 'Settings.current')!.fingerprint.tokenCount).toBeGreaterThanOrEqual(15);
        expect(symbols.find((s) => s.name === 'shortFormat')!.fingerprint.tokenCount).toBeLessThan(15);
      } finally { db.close(); }
    });
    await withCheckScenario('tests', async (root) => {
      const config = defaultConfig(); config.reuse.skipTests = false;
      expect((await checkRepository(root, { config })).blocked).toBe(true);
    });
    await withCheckScenario('generated', async (root) => {
      const config = defaultConfig(); config.index.skipGenerated = false;
      expect((await checkRepository(root, { config })).findings).toEqual([]);
    });
  });

  it('skips trivial Python property getters and setters, not validating setters', async () => {
    await withCheckScenario('clean', async (root) => {
      await checkRepository(root);
      const source = 'class Settings:\n    @property\n    def current(self):\n        return self.workspace.runtime.profile.preferences.appearance.color.primary.active\n    @current.setter\n    def current(self, value):\n        self.workspace.runtime.profile.preferences.appearance.color.primary.active = value\n';
      expect(inspectSource(source, 'python').trivialAccessors).toHaveLength(2);
      const validating = source.replace('        self.workspace', '        assert value is not None\n        self.workspace');
      expect(inspectSource(validating, 'python').trivialAccessors).toHaveLength(1);
      expect(inspectSource('class Empty:\n    pass\n', 'python').trivialAccessors).toEqual([]);
      writeScenarioFile(root, 'settings.py', source + '\n' + source.replace('class Settings:', 'class OtherSettings:'));
      expect((await checkRepository(root)).findings.filter((f) => f.added.file === 'settings.py')).toEqual([]);
    });
  });

  it('finds Python versioned files and same basenames in another directory', async () => {
    await withCheckScenario('clean', async (root) => {
      writeScenarioFile(root, 'dates_v2.py', readFileSync(path.join(root, 'dates.py'), 'utf8'));
      writeScenarioFile(root, 'other/utils.ts', readFileSync(path.join(root, 'utils.ts'), 'utf8'));
      const files = (await checkRepository(root)).findings.filter((f) => f.kind === 'duplicate-file').map((f) => f.added.file);
      expect(files).toEqual(expect.arrayContaining(['dates_v2.py', 'other/utils.ts']));
    });
  });
});

describe('scope, call provenance and literal provenance', () => {
  it('keeps same-named methods in different classes but excludes same-scope overloads', async () => {
    await withCheckScenario('clean', async (root) => {
      const body = 'const date = new Date(value); if (Number.isNaN(date.getTime())) return null; return date;';
      writeScenarioFile(root, 'classes.ts', `class First { parse(value: string) { ${body} } }\nclass Second { parse(value: string) { ${body} } }\nfunction parse(value: string): Date | null;\nfunction parse(value: string): Date | null { ${body} }\n`);
      await checkRepository(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        const index = new CandidateIndex(db);
        const method = index.symbols.find((s) => s.qualifiedName === 'Second.parse')!;
        expect(index.find(method).map((s) => s.qualifiedName)).toContain('First.parse');
        expect(index.find(method).map((s) => s.id)).not.toContain(method.id);
        const fn = index.symbols.find((s) => s.qualifiedName === 'parse')!;
        expect(index.find({ ...fn, id: 'overload-signature' }).some((s) => s.qualifiedName === 'parse' && s.file === fn.file)).toBe(false);
        expect(index.find({ name: 'parse', fingerprint: null, docstring: null, params: null, returnType: null })).toEqual([]);
      } finally { db.close(); }
    });
  });

  it('never recommends mutable bindings as reusable constants', async () => {
    await withCheckScenario('clean', async (root) => {
      writeScenarioFile(root, 'mutable.ts', "export let endpoint = 'https://mutable.test/api';\nendpoint = 'https://changed.test/api';\nexport var region = 'mutable-region';\nexport const API_URL = 'https://constant.test/api';\n");
      writeScenarioFile(root, 'mutable.py', "endpoint = 'https://python.test/api'\nDEFAULT_REGION = 'constant-region'\n");
      scenarioGit(root, 'add', 'mutable.ts', 'mutable.py');
      scenarioGit(root, 'commit', '-qm', 'literal binding baseline');
      writeScenarioFile(root, 'consumer.ts', "const endpoint = 'https://mutable.test/api';\nconst region = 'mutable-region';\nconst pythonEndpoint = 'https://python.test/api';\nconst fixedEndpoint = 'https://constant.test/api';\nconst fixedRegion = 'constant-region';\n");
      const findings = (await checkRepository(root)).findings.filter((f) => f.kind === 'duplicate-constant');
      expect(findings.map((f) => f.existing?.symbol)).toEqual(['API_URL', 'DEFAULT_REGION']);
    });
  });

  it('compares staged, untracked and modified bodies to HEAD; explicit base includes committed changes', async () => {
    await withCheckScenario('duplicate', async (root) => {
      expect((await checkRepository(root)).blocked).toBe(true);
      scenarioGit(root, 'add', 'calendar.ts');
      expect((await checkRepository(root)).blocked).toBe(true);
      scenarioGit(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'add clone');
      expect((await checkRepository(root)).findings).toEqual([]);
      expect((await checkRepository(root, { base: 'HEAD~1' })).blocked).toBe(true);
      const source = readFileSync(path.join(root, 'calendar.ts'), 'utf8');
      writeScenarioFile(root, 'calendar.ts', source.replace('const parts', '/* edited body */ const parts'));
      expect((await checkRepository(root)).findings.some((f) => f.kind === 'duplicate' && f.added.file === 'calendar.ts')).toBe(true);
    });
  });

  it('does not report existing literals just because their line or containing body changed', async () => {
    await withCheckScenario('constant', async (root) => {
      scenarioGit(root, 'add', 'request.ts');
      scenarioGit(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'existing config consumer');
      writeScenarioFile(root, 'request.ts', '\n\n' + readFileSync(path.join(root, 'request.ts'), 'utf8').replace('const region', '/* unchanged values */ const region'));
      const report = await checkRepository(root);
      expect(report.findings.filter((f) => f.kind === 'duplicate-constant')).toEqual([]);
    });
  });

  it('does not suggest a constant deleted by this change, or an arbitrary arithmetic number', async () => {
    await withCheckScenario('constant', async (root) => {
      rmSync(path.join(root, 'config.ts'));
      expect((await checkRepository(root)).findings.filter((f) => f.kind === 'duplicate-constant')).toEqual([]);
    });
    await withCheckScenario('clean', async (root) => {
      writeScenarioFile(root, 'math.ts', 'export function offset(value: number) { const squared = value * value; const shifted = squared + 5000; return Math.sqrt(shifted); }\n');
      expect((await checkRepository(root)).findings.filter((f) => f.kind === 'duplicate-constant')).toEqual([]);
    });
  });

  it('preserves signed numeric values and does not collapse distinct bigint literals', async () => {
    await withCheckScenario('clean', async (root) => {
      writeScenarioFile(root, 'numeric.ts', 'export const MAX_TIMEOUT = 25n;\n');
      scenarioGit(root, 'add', 'numeric.ts');
      scenarioGit(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'bigint config constant');
      writeScenarioFile(root, 'numeric-use.ts', 'export function configure(timeoutMs = -5000) { const maxTimeout = 26n; const config = { timeoutMs, maxTimeout }; return Object.freeze(config); }\n');
      expect((await checkRepository(root)).findings.filter((f) => f.kind === 'duplicate-constant')).toEqual([]);
    });
  });

  it('finds config numbers in default parameters without changing Phase 1 extraction', async () => {
    await withCheckScenario('clean', async (root) => {
      writeScenarioFile(root, 'defaults.ts', 'export function configure(timeoutMs = 5000) { const config = { timeoutMs, enabled: true }; return Object.freeze(config); }\n');
      expect((await checkRepository(root)).findings.some((f) => f.fix === 'use REQUEST_TIMEOUT_MS from config.ts')).toBe(true);
    });
  });

  it('resolves caller moves through import aliases at base and in the worktree', async () => {
    await withCheckScenario('replaced', async (root) => {
      const source = readFileSync(path.join(root, 'app.ts'), 'utf8');
      writeScenarioFile(root, 'app.ts', source.replace('{ decodeCalendar }', '{ decodeCalendar as parseDateString }').replace('const date = decodeCalendar(', 'const date = parseDateString('));
      const finding = (await checkRepository(root)).findings.find((f) => f.kind === 'dead-after-change');
      expect(finding?.existing?.symbol).toBe('parseDateString');
      expect(finding?.added.symbol).toBe('decodeCalendar');
    });
  });

  it('does not flag dead-after-change if a caller remains or callers were merely removed', async () => {
    await withCheckScenario('replaced', async (root) => {
      writeScenarioFile(root, 'remaining.ts', "import { parseDateString } from './utils.js';\nparseDateString('2024-01-01');\n");
      expect((await checkRepository(root)).findings.filter((f) => f.kind === 'dead-after-change')).toEqual([]);
      rmSync(path.join(root, 'remaining.ts'));
      writeScenarioFile(root, 'app.ts', 'export const noLongerUsed = true;\n');
      expect((await checkRepository(root)).findings.filter((f) => f.kind === 'dead-after-change')).toEqual([]);
    });
  });

  it('does not block partial syntax or an empty indexed repository, and rejects an invalid base', async () => {
    await withCheckScenario('duplicate', async (root) => {
      writeScenarioFile(root, 'calendar.ts', readFileSync(path.join(root, 'calendar.ts'), 'utf8') + '\nfunction {\n');
      expect((await checkRepository(root)).findings).toEqual([]);
      await expect(checkRepository(root, { base: 'nonexistent-reuse-base' })).rejects.toThrow();
      await expect(checkRepository(root, { timeoutMs: 0 })).rejects.toThrow('timed out');
      for (const file of ['utils.ts', 'dates.py', 'config.ts', 'getters.ts', 'app.ts', 'calendar.ts']) rmSync(path.join(root, file));
      scenarioGit(root, 'add', '-u');
      scenarioGit(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'empty source tree');
      expect((await checkRepository(root)).findings).toEqual([]);
    });
  });
});

describe('scoped duplicate exemptions', () => {
  it.each(['needed', 'different', 'ok', 'temp', 'only two', 'needed because different', 'it is needed'])('rejects vague reason: %s', async (reason) => {
    await withCheckScenario('duplicate', async (root) => {
      writeScenarioFile(root, 'calendar.ts', `// groundwork: allow-duplicate ${reason}\n` + readFileSync(path.join(root, 'calendar.ts'), 'utf8'));
      const report = await checkRepository(root);
      expect(report.blocked).toBe(true);
      expect(report.findings.some((f) => f.kind === 'invalid-allow')).toBe(true);
      expect(report.allows).toEqual([]);
    });
  });

  it('accepts a comment on the first symbol line and above an exported arrow declaration', async () => {
    await withCheckScenario('duplicate', async (root) => {
      const source = readFileSync(path.join(root, 'calendar.ts'), 'utf8');
      writeScenarioFile(root, 'calendar.ts', source.replace('Date | null {', 'Date | null { /* groundwork: allow-duplicate preserves isolated legacy runtime compatibility */'));
      expect((await checkRepository(root)).findings).toEqual([]);
      writeScenarioFile(root, 'calendar.ts', '// groundwork: allow-duplicate preserves isolated legacy runtime compatibility\n' +
        source.replace('export function decodeCalendar(value: string): Date | null {', 'export const decodeCalendar = (value: string): Date | null => {') + ';\n');
      expect((await checkRepository(root)).findings).toEqual([]);
    });
  });

  it('does not interpret a string or a detached comment as an exemption', async () => {
    await withCheckScenario('duplicate', async (root) => {
      const source = readFileSync(path.join(root, 'calendar.ts'), 'utf8');
      writeScenarioFile(root, 'calendar.ts', "const note = 'groundwork: allow-duplicate preserves isolated legacy runtime compatibility';\n" + source);
      expect((await checkRepository(root)).blocked).toBe(true);
      writeScenarioFile(root, 'calendar.ts', '// groundwork: allow-duplicate preserves isolated legacy runtime compatibility\nconst unrelated = 42;\n' + source);
      expect((await checkRepository(root)).findings.some((f) => f.kind === 'duplicate')).toBe(true);
    });
  });
});

describe('check command and Stop gate', () => {
  it('names duplicate files directly and only mentions callers when there are callers', async () => {
    await withCheckScenario('duplicate', async (root) => {
      const fileFinding = (await checkRepository(root)).findings.find((f) => f.kind === 'duplicate-file')!;
      expect(formatFinding(fileFinding)).toBe('BLOCK duplicate-file: calendar.ts:1\nExisting: utils.ts:1\nWhy: symbolOverlap=1, versionOrSameBasename=0\nFix: Delete calendar.ts; use utils.ts instead.');
      expect(fileFinding.added.symbol).toBe('calendar.ts');
      expect(fileFinding.existing?.symbol).toBe('utils.ts');
      writeScenarioFile(root, 'consumer.ts', "import { decodeCalendar } from './calendar.js';\ndecodeCalendar('2024-01-01');\n");
      const withCaller = (await checkRepository(root)).findings.find((f) => f.kind === 'duplicate-file')!;
      expect(withCaller.fix).toBe('Delete calendar.ts and update its 1 caller to use utils.ts.');
    });
  });

  it('emits JSON and short human BLOCK output; PASS and unavailable checks exit zero', async () => {
    await withCheckScenario('duplicate', async (root) => {
      const json = cli(root, 'check', '--json');
      expect(json.status).toBe(1);
      expect(JSON.parse(json.stdout)).toMatchObject({ blocked: true, status: 'BLOCK' });
      const human = cli(root, 'check');
      expect(human.status).toBe(1);
      expect(human.stdout).toContain('Duplicate of parseDateString: REUSE it as-is or EXTEND/parameterize it');
      expect(human.stdout).not.toContain('\x1b');
      const unavailable = cli(root, '--json', 'check', '--base', 'does-not-exist');
      expect(unavailable.status).toBe(0);
      expect(JSON.parse(unavailable.stdout)).toMatchObject({ blocked: false, status: 'UNAVAILABLE', findings: [] });
    });
    await withCheckScenario('clean', async (root) => {
      const passed = cli(root, 'check', '--json');
      expect(passed.status).toBe(0);
      expect(JSON.parse(passed.stdout)).toMatchObject({ status: 'PASS', findings: [] });
    });
  });

  it('keeps calibrated medium-band findings as WARN and exits zero', async () => {
    await withCheckScenario('clean', async (root) => {
      writeScenarioFile(root, 'utils3.ts', readFileSync(path.join(root, 'utils.ts'), 'utf8').replace('month > 12', 'month > 11'));
      const result = cli(root, 'check', '--json');
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.status).toBe('WARN');
      expect(report.blocked).toBe(false);
      expect(report.findings.some((f: { kind: string }) => f.kind === 'duplicate')).toBe(true);
      expect(report.findings.every((f: { severity: string }) => f.severity === 'WARN')).toBe(true);
    });
  });

  it('blocks once per finding set, remembers earlier sets and isolates sessions', async () => {
    await withCheckScenario('duplicate', async (root) => {
      await assertStopScenario(root);
      const ctx = { root, config: { ...defaultConfig(), profile: 'strict' as const } };
      const source = readFileSync(path.join(root, 'calendar.ts'), 'utf8');
      writeScenarioFile(root, 'z-calendar.ts', source.replaceAll('decodeCalendar', 'readCalendar'));
      expect((await duplicateGate.run(stopEvent(root), ctx))?.action).toBe('deny');
      rmSync(path.join(root, 'z-calendar.ts'));
      expect((await duplicateGate.run(stopEvent(root), ctx))?.action).toBe('allow');
      expect((await duplicateGate.run(stopEvent(root, false, 'another-session'), ctx))?.action).toBe('deny');
      writeScenarioFile(root, 'y-calendar.ts', source.replaceAll('decodeCalendar', 'loadCalendar'));
      const standard = await duplicateGate.run(stopEvent(root, false, 'standard-session'), { root, config: defaultConfig() });
      expect(standard?.action).toBe('context');
      expect(standard?.message).toContain('BLOCK');
      rmSync(path.join(root, 'y-calendar.ts'));
      ctx.config.reuse.duplicateGate = false;
      expect((await duplicateGate.run(stopEvent(root, false, 'disabled-session'), ctx))?.action).toBe('allow');
      expect(HANDLERS).toContain(duplicateGate);
    });
  });

  it('renders a real Stop block, then stays silent on ignored, active and malformed stops', async () => {
    await withCheckScenario('duplicate', async (root) => {
      writeScenarioFile(root, '.groundwork/config.json', JSON.stringify({ profile: 'strict' }));
      await checkRepository(root);
      const event = normalise('claude', 'stop', { cwd: root, session_id: 'dispatch-test' });
      const result = await dispatch(event, root);
      expect(JSON.parse(render(event, result))).toMatchObject({ decision: 'block' });
      const first = hook(root, { cwd: root, session_id: 'process-test' });
      expect(first.status).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({ decision: 'block' });
      for (const payload of [{ cwd: root, session_id: 'process-test' }, { cwd: root, session_id: 'other', stop_hook_active: true }, 'not JSON']) {
        const result = hook(root, payload);
        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');
      }
    });
  });

  it('keeps fast and global-option hook routes equivalent without the compile cache', async () => {
    await withCheckScenario('duplicate', async (root) => {
      writeScenarioFile(root, '.groundwork/config.json', JSON.stringify({ profile: 'strict' }));
      await checkRepository(root);
      for (const [i, args] of [['hook', 'claude', 'stop'], ['--root', root, 'hook', 'claude', 'stop']].entries()) {
        const run = (input: string) => spawnSync(process.execPath, ['--import', TSX, MAIN, ...args], {
          cwd: root, encoding: 'utf8', input, env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: '1' },
        });
        const payload = { cwd: root, session_id: `route-${i}` };
        const first = run(JSON.stringify(payload));
        expect(first.status).toBe(0);
        expect(JSON.parse(first.stdout)).toMatchObject({ decision: 'block' });
        const second = run(JSON.stringify(payload));
        expect(second.status).toBe(0);
        expect(second.stdout).toBe('');
        const active = run(JSON.stringify({ ...payload, stop_hook_active: true }));
        expect(active.status).toBe(0);
        expect(active.stdout).toBe('');
        const malformed = run('not JSON');
        expect(malformed.status).toBe(0);
        expect(malformed.stdout).toBe('');
      }
    });
  });

  it('does not promote policy-rejected advisory matches into whole-file BLOCKs', async () => {
    await withCheckScenario('file', async (root) => {
      const eligibility = vi.spyOn(policy, 'canBlock').mockReturnValue(false);
      try {
        const report = await checkRepository(root);
        const advisory = report.findings.find((f) => f.kind === 'duplicate');
        expect(advisory).toMatchObject({ severity: 'WARN' });
        expect(advisory!.probability).toBeGreaterThanOrEqual(thresholds.block);
        expect(report.findings.find((f) => f.kind === 'duplicate-file')).toMatchObject({ severity: 'WARN' });
      } finally { eligibility.mockRestore(); }
    });
  });

  it('preserves packaging profiles and agent renderers on both hook routes', async () => {
    await withCheckScenario('duplicate', async (root) => {
      await checkRepository(root);
      for (const [agent, profile] of [['claude', 'standard'], ['claude', 'minimal'], ['codex', 'strict'], ['cursor', 'strict']]) {
        writeScenarioFile(root, '.groundwork/config.json', JSON.stringify({ profile }));
        for (const global of [false, true]) {
          const result = spawnSync(process.execPath, ['--import', TSX, MAIN, ...(global ? ['--root', root] : []), 'hook', agent!, 'stop'], {
            cwd: root, encoding: 'utf8', input: JSON.stringify({ workspace_roots: [root], session_id: `${agent}-${profile}-${global}` }),
          });
          expect(result.status).toBe(0);
          if (profile === 'minimal') expect(result.stdout).toBe('');
          else expect(JSON.parse(result.stdout)).toMatchObject(agent === 'cursor' ? { followup_message: expect.stringContaining('BLOCK') } :
            profile === 'strict' ? { decision: 'block' } : { systemMessage: expect.stringContaining('BLOCK') });
        }
      }
      const result = spawnSync(process.execPath, ['--import', TSX, MAIN, 'setup', '--help'], { cwd: root, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('--profile');
    });
  });

  it('allows Cursor permission hooks even when loading the hook runner fails', async () => {
    const loader = `export async function resolve(s, c, next) { if (s.includes('/hooks/run.')) { process.stderr.write('unavailable runner\\n'); throw new Error('unavailable runner'); } return next(s, c); }`;
    const preload = `import { register } from 'node:module'; register(${JSON.stringify('data:text/javascript,' + encodeURIComponent(loader))}, import.meta.url);`;
    const result = spawnSync(process.execPath, ['--import', TSX, '--import', 'data:text/javascript,' + encodeURIComponent(preload), MAIN, 'hook', 'cursor', 'pre_tool'], {
      encoding: 'utf8', input: '{}',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ permission: 'allow' });
    expect(result.stderr).toContain('unavailable runner');
  });

  it('prioritizes Stop denial while preserving opt-in nonblocking waste summaries', async () => {
    await withCheckScenario('duplicate', async (root) => {
      await checkRepository(root);
      writeScenarioFile(root, '.groundwork/config.json', JSON.stringify({ profile: 'strict', guards: { sessionSummary: true } }));
      const payload = { cwd: root, session_id: 'combined-summary' };
      const first = hook(root, payload);
      expect(first.status).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({ decision: 'block', reason: expect.stringContaining('BLOCK duplicate') });
      const second = hook(root, payload);
      expect(second.status).toBe(0);
      expect(JSON.parse(second.stdout)).toEqual({ systemMessage: expect.stringContaining('Groundwork saved') });
      const active = hook(root, { ...payload, stop_hook_active: true });
      expect(active.status).toBe(0);
      expect(active.stdout).toBe('');
    });
  });

  it('fails open on missing Git history, index lock timeouts and unwritable session state', async () => {
    await withCheckScenario('duplicate', async (root) => {
      await checkRepository(root);
      const ctx = { root, config: defaultConfig() };
      const event = stopEvent(root);
      const lock = path.join(root, '.groundwork/index.lock');
      writeFileSync(lock, String(process.pid));
      expect((await duplicateGate.run(event, ctx))?.action).toBe('allow');
      const timedOut = hook(root, { cwd: root, session_id: 'locked-process' });
      expect(timedOut.status).toBe(0); expect(timedOut.stdout).toBe('');
      rmSync(lock);
      writeFileSync(path.join(root, '.groundwork/sessions'), 'not a directory');
      expect((await duplicateGate.run(event, ctx))?.action).toBe('allow');
      renameSync(path.join(root, '.git'), path.join(root, 'saved-git'));
      expect((await duplicateGate.run(event, ctx))?.action).toBe('allow');
    });
  });

  it('does not silently accept an unloggable exemption', async () => {
    await withCheckScenario('allow', async (root) => {
      mkdirSync(path.join(root, '.groundwork/logs/allows.jsonl'), { recursive: true });
      await expect(checkRepository(root)).rejects.toThrow();
      expect((await duplicateGate.run(stopEvent(root), { root, config: defaultConfig() }))?.action).toBe('allow');
    });
  });
});
