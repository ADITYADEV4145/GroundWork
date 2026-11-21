import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../../config/load.js';
import { wasteGuards } from '../../hooks/handlers/waste-guards.js';
import type { HookEvent } from '../../hooks/types.js';
import { compactOutput, type NoisyTool } from '../../guards/trimmer.js';
import { failureEvidence } from '../../guards/failure-evidence.js';
import { packagingChecks } from './phase5-packaging.js';
import type { Check } from '../registry.js';

export const corpusPath = fileURLToPath(new URL('../../../fixtures/waste-guards/', import.meta.url));
export interface FailureFixture { tool: NoisyTool; output: string; expected: string[]; provenance?: { suite: string; scenario: number; command: string[]; toolVersion: string; capturedAt: string; exitCode: number; files: Record<string, string> } }
export function failureCorpus(): FailureFixture[] {
  return readdirSync(corpusPath).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(corpusPath, f), 'utf8')) as FailureFixture);
}
export function analyzeCorpus(fixtures: FailureFixture[]): { issues: string[]; detail: string; averageByteReduction: number } {
  const issues: string[] = [];
  const groups = new Map<string, { count: number; lines: number; bytes: number }>();
  let inputBytes = 0;
  let outputBytes = 0;
  for (const [i, f] of fixtures.entries()) {
    const compact = compactOutput(f.output, f.tool);
    const linesBefore = f.output.trimEnd().split(/\r?\n/).length;
    const linesAfter = compact.trimEnd().split(/\r?\n/).length;
    const byteReduction = 1 - Buffer.byteLength(compact) / Buffer.byteLength(f.output);
    inputBytes += Buffer.byteLength(f.output);
    outputBytes += Buffer.byteLength(compact);
    if (!f.provenance?.command.length || !f.provenance.toolVersion || !Number.isFinite(Date.parse(f.provenance.capturedAt)) || !f.provenance.exitCode || !Object.keys(f.provenance.files).length) issues.push(`${i + 1}: missing capture provenance`);
    const evidence = failureEvidence(f.output);
    if (!evidence.length || JSON.stringify(evidence) !== JSON.stringify(f.expected)) issues.push(`${i + 1}: expected failures differ from independent raw-output evidence`);
    const compactLines = compact.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split(/\r?\n/);
    for (const line of evidence) if (!compactLines.includes(line)) issues.push(`${i + 1}: missing ${line}`);
    const name = f.tool === 'install' ? `${f.provenance?.suite ?? 'unknown'} install` : f.tool;
    const group = groups.get(name) ?? { count: 0, lines: 0, bytes: 0 };
    group.count++; group.lines += 1 - linesAfter / linesBefore; group.bytes += byteReduction;
    groups.set(name, group);
  }
  const averageByteReduction = inputBytes ? 1 - outputBytes / inputBytes : 0;
  if (averageByteReduction < 0.5) issues.push(`average byte reduction ${(averageByteReduction * 100).toFixed(1)}% < 50%`);
  const detail = [...groups].map(([tool, g]) => `${tool} (${g.count}): lines -${(g.lines / g.count * 100).toFixed(1)}%, bytes -${(g.bytes / g.count * 100).toFixed(1)}%`).join('\n');
  return { issues, averageByteReduction, detail: `${detail}\nCorpus total byte reduction: ${(averageByteReduction * 100).toFixed(1)}%` };
}
export async function repeatScenario(name: string): Promise<boolean> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-waste-'));
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  try {
    git(['init', '-q']);
    writeFileSync(path.join(root, '.gitignore'), '.groundwork/\n');
    writeFileSync(path.join(root, 'tracked.txt'), 'before\n');
    git(['add', '.gitignore', 'tracked.txt']);
    git(['-c', 'user.name=Selftest', '-c', 'user.email=selftest@localhost', 'commit', '-qm', 'fixture']);
    const ev: HookEvent = { agent: 'claude', event: 'post_tool', sessionId: 'selftest', cwd: root, tool: 'Bash', input: { command: name === 'time-dependent exemption' ? 'date' : 'ls' }, response: 'hello\nworld', raw: {} };
    const ctx = { root, config: defaultConfig() };
    await wasteGuards.run(ev, ctx);
    ev.event = 'pre_tool';
    if (name === 'changed-then-allowed') writeFileSync(path.join(root, 'tracked.txt'), 'changed\n');
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
    const distinct = new Set(fixtures.map((f) => JSON.stringify(f.expected))).size;
    return { ok: fixtures.length === 50 && distinct === 50 && proof.issues.length === 0, detail: [...proof.issues, `${fixtures.length} captured outputs, ${distinct} distinct failure sets; ${proof.issues.length ? 'evidence check failed' : 'every independently extracted failure retained'}`, proof.detail].join('\n') };
  } },
  ...packagingChecks,
];
