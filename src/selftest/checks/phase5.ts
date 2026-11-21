import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../../config/load.js';
import { wasteGuards } from '../../hooks/handlers/waste-guards.js';
import type { HookEvent } from '../../hooks/types.js';
import { compactOutput, type NoisyTool } from '../../guards/trimmer.js';
import type { Check } from '../registry.js';

export const corpusPath = fileURLToPath(new URL('../../../fixtures/waste-guards/', import.meta.url));
export interface FailureFixture { tool: NoisyTool; output: string; expected: string[] }
export function failureCorpus(): FailureFixture[] {
  return readdirSync(corpusPath).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(corpusPath, f), 'utf8')) as FailureFixture);
}
export async function repeatScenario(name: string): Promise<boolean> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-waste-'));
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  try {
    git(['init', '-q']);
    writeFileSync(path.join(root, '.gitignore'), '.groundwork/\n');
    git(['add', '.gitignore']);
    git(['-c', 'user.name=Selftest', '-c', 'user.email=selftest@localhost', 'commit', '-qm', 'fixture']);
    const ev: HookEvent = { agent: 'claude', event: 'post_tool', sessionId: 'selftest', cwd: root, tool: 'Bash', input: { command: name === 'time-dependent exemption' ? 'date' : 'ls' }, response: 'hello\nworld', raw: {} };
    const ctx = { root, config: defaultConfig() };
    await wasteGuards.run(ev, ctx);
    ev.event = 'pre_tool';
    if (name === 'changed-then-allowed') writeFileSync(path.join(root, 'new.txt'), 'changed');
    if (name === 'force') ev.input.command = 'ls # gw:force';
    const r = await wasteGuards.run(ev, ctx);
    return name === 'repeat-intercept' ? r?.action === 'deny' : r?.action !== 'deny';
  } finally { rmSync(root, { recursive: true, force: true }); }
}
export const PHASE5_CHECKS: Check[] = [
  ...['repeat-intercept', 'changed-then-allowed', 'force', 'time-dependent exemption'].map((name): Check => ({
    phase: 5, name,
    async run() { const ok = await repeatScenario(name); return { ok, detail: ok ? 'expected hook decision' : 'unexpected hook decision' }; },
  })),
  { phase: 5, name: 'trimmer-never-drops-a-failure (50 outputs)', async run() {
    const fixtures = failureCorpus();
    const missing = fixtures.flatMap((f, i) => f.expected.filter((line) => !compactOutput(f.output, f.tool).includes(line)).map((line) => `${i + 1}: ${line}`));
    return { ok: fixtures.length === 50 && missing.length === 0, detail: missing.length ? missing.join('\n') : `${fixtures.length} realistic outputs retain every expected failure line` };
  } },
];
