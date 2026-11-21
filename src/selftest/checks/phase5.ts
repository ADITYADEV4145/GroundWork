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
export function analyzeCorpus(fixtures: FailureFixture[]): { issues: string[]; detail: string; averageByteReduction: number } {
  const issues: string[] = [];
  const groups = new Map<string, { count: number; lines: number; bytes: number }>();
  for (const [i, f] of fixtures.entries()) {
    const compact = compactOutput(f.output, f.tool);
    const linesBefore = f.output.trimEnd().split(/\r?\n/).length;
    const linesAfter = compact.trimEnd().split(/\r?\n/).length;
    const byteReduction = 1 - Buffer.byteLength(compact) / Buffer.byteLength(f.output);
    if (linesBefore < 60) issues.push(`${i + 1}: only ${linesBefore} input lines`);
    if (byteReduction <= 0 || linesAfter >= linesBefore) issues.push(`${i + 1}: output was not compacted`);
    for (const line of f.expected) if (!compact.includes(line)) issues.push(`${i + 1}: missing ${line}`);
    const name = f.tool === 'install' ? /npm ERR!/.test(f.output) ? 'npm install' : /PNPM/.test(f.output) ? 'pnpm install' : 'pip install' : f.tool;
    const group = groups.get(name) ?? { count: 0, lines: 0, bytes: 0 };
    group.count++; group.lines += 1 - linesAfter / linesBefore; group.bytes += byteReduction;
    groups.set(name, group);
  }
  const averageByteReduction = [...groups.values()].reduce((n, g) => n + g.bytes, 0) / (fixtures.length || 1);
  if (averageByteReduction < 0.5) issues.push(`average byte reduction ${(averageByteReduction * 100).toFixed(1)}% < 50%`);
  const detail = [...groups].map(([tool, g]) => `${tool} (${g.count}): lines -${(g.lines / g.count * 100).toFixed(1)}%, bytes -${(g.bytes / g.count * 100).toFixed(1)}%`).join('\n');
  return { issues, averageByteReduction, detail: `${detail}\nCorpus average byte reduction: ${(averageByteReduction * 100).toFixed(1)}%` };
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
    const proof = analyzeCorpus(fixtures);
    return { ok: fixtures.length === 50 && proof.issues.length === 0, detail: [...proof.issues, `${fixtures.length} outputs (each >=60 lines) compacted; every expected failure retained`, proof.detail].join('\n') };
  } },
];
