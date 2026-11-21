import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../config/load.js';
import { duplicateGate } from '../hooks/handlers/duplicate_gate.js';
import type { HookEvent } from '../hooks/types.js';
import { checkRepository, type CheckReport } from './check.js';

const FIXTURE = fileURLToPath(new URL('../../fixtures/reuse-check/', import.meta.url));
export const CHECK_SCENARIOS = ['duplicate', 'clean', 'replaced', 'constant', 'file', 'allow', 'vague',
  'tests', 'dunder', 'getters', 'tiny', 'overloads', 'generated'] as const;
export type CheckScenario = typeof CHECK_SCENARIOS[number];

export function scenarioGit(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 'Groundwork fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
      GIT_COMMITTER_NAME: 'Groundwork fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test' } });
}

export function writeScenarioFile(root: string, file: string, source: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), source);
}

export function createCheckScenario(name: CheckScenario, root = mkdtempSync(path.join(os.tmpdir(), 'gw-check-'))): string {
  cpSync(path.join(FIXTURE, 'base'), root, { recursive: true });
  writeScenarioFile(root, '.gitignore', '.groundwork/\n');
  scenarioGit(root, 'init', '-q');
  scenarioGit(root, 'add', 'utils.ts', 'dates.py', 'app.ts', 'config.ts', 'getters.ts', '.gitignore');
  scenarioGit(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'reuse check base');
  const utility = readFileSync(path.join(root, 'utils.ts'), 'utf8').split('\nexport function shortFormat')[0]!;
  const clone = utility.replaceAll('parseDateString', 'decodeCalendar');
  if (['duplicate', 'allow', 'vague'].includes(name)) {
    const prefix = name === 'allow' ? '// groundwork: allow-duplicate preserves isolated legacy runtime compatibility\n' :
      name === 'vague' ? '// groundwork: allow-duplicate needed\n' : '';
    writeScenarioFile(root, 'calendar.ts', prefix + clone);
  } else if (name === 'clean') cpSync(path.join(FIXTURE, 'clean.ts'), path.join(root, 'partition.ts'));
  else if (name === 'constant') cpSync(path.join(FIXTURE, 'constants.ts'), path.join(root, 'request.ts'));
  else if (name === 'file') writeScenarioFile(root, 'utils2.ts', readFileSync(path.join(root, 'utils.ts'), 'utf8'));
  else if (name === 'replaced') {
    writeScenarioFile(root, 'utils.ts', readFileSync(path.join(root, 'utils.ts'), 'utf8') + '\n' + clone);
    writeScenarioFile(root, 'app.ts', readFileSync(path.join(root, 'app.ts'), 'utf8').replaceAll('parseDateString', 'decodeCalendar'));
  } else if (name === 'tests') writeScenarioFile(root, 'calendar.test.ts', clone);
  else if (name === 'dunder') writeScenarioFile(root, 'dunder.py', readFileSync(path.join(root, 'dates.py'), 'utf8').replace('parse_date_string', '__calendar__'));
  else if (name === 'getters') writeScenarioFile(root, 'getters2.ts', readFileSync(path.join(root, 'getters.ts'), 'utf8').replace('class Settings', 'class OtherSettings'));
  else if (name === 'tiny') writeScenarioFile(root, 'tiny.ts', 'export function shortClone(value: string): string { return value.trim(); }\n');
  else if (name === 'overloads') writeScenarioFile(root, 'utils.ts', 'export function parseDateString(value: string): Date | null;\n' + readFileSync(path.join(root, 'utils.ts'), 'utf8'));
  else if (name === 'generated') writeScenarioFile(root, 'generated.ts', '// @generated DO NOT EDIT\n' + clone);
  return root;
}

export async function withCheckScenario<T>(name: CheckScenario, run: (root: string) => T | Promise<T>): Promise<T> {
  const root = createCheckScenario(name);
  try { return await run(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

export function assertCheckScenario(name: CheckScenario, report: CheckReport, root: string): void {
  if (name === 'duplicate') assert(report.findings.some((f) => f.kind === 'duplicate' && f.severity === 'BLOCK'));
  else if (name === 'replaced') assert(report.findings.some((f) => f.kind === 'dead-after-change' && f.existing?.symbol === 'parseDateString' && f.signals[1]?.value === 1));
  else if (name === 'constant') {
    for (const constant of ['CACHE_PATH', 'API_URL', 'API_TOKEN_KEY', 'RETRY_CONFIG_KEY', 'REQUEST_TIMEOUT_MS', 'DEFAULT_REGION'])
      assert(report.findings.some((f) => f.kind === 'duplicate-constant' && f.fix === `use ${constant} from config.ts`), `missing ${constant}`);
  } else if (name === 'file') assert(report.findings.some((f) => f.kind === 'duplicate-file' && f.added.file === 'utils2.ts' && f.existing?.file === 'utils.ts'));
  else if (name === 'vague') assert(report.blocked && report.findings.some((f) => f.kind === 'invalid-allow'));
  else {
    assert.deepEqual(report.findings, [], JSON.stringify(report.findings));
    assert.equal(report.status, 'PASS');
    if (name === 'allow') {
      const log = readFileSync(path.join(root, '.groundwork/logs/allows.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      assert(log.some((l) => l.symbol === 'decodeCalendar' && l.reason === 'preserves isolated legacy runtime compatibility'));
    }
  }
}

export const stopEvent = (root: string, active = false, sessionId = 'reuse-fixture'): HookEvent => ({
  agent: 'claude', event: 'stop', sessionId, cwd: root, tool: null, input: {}, response: null, raw: { stop_hook_active: active },
});

export async function assertStopScenario(root: string): Promise<void> {
  const context = { root, config: { ...defaultConfig(), profile: 'strict' as const } };
  // Warm the index before testing the hook's bounded execution path.
  await checkRepository(root);
  assert.equal((await duplicateGate.run(stopEvent(root, true), context))?.action, 'allow');
  assert.equal((await duplicateGate.run(stopEvent(root), context))?.action, 'deny');
  assert.equal((await duplicateGate.run(stopEvent(root), context))?.action, 'allow');
  const log = readFileSync(path.join(root, '.groundwork/logs/groundwork.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert(log.some((l) => l.event === 'duplicate_gate' && l.status === 'ignored'));
}
