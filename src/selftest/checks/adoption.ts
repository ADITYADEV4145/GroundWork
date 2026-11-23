import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor, type DoctorCheck } from '../../cli/commands/doctor.js';
import { withCheckScenario } from '../../reuse/scenarios.js';
import { CLIENTS } from '../../setup/clients.js';
import { tempDir } from '../fixtures.js';
import type { Check } from '../registry.js';

// Adoption gate: every seeded misconfiguration is reported by `gw doctor`, and a fresh
// `gw install` reaches a first block on each client's route (the Stop hook where the client
// has hooks, `gw check` where it is MCP-only). The clients themselves are not launched here.

const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
const cli = path.join(packageRoot, existsSync(path.join(packageRoot, 'src/cli/main.ts')) ? 'src/cli/main.ts' : 'dist/cli/main.js');
const node = cli.endsWith('.ts') ? ['--import', 'tsx', cli] : [cli];
const gw = (root: string, args: string[], input?: string) => spawnSync(process.execPath, [...node, '--root', root, ...args], { cwd: packageRoot, encoding: 'utf8', input, timeout: 120_000 });

const write = (root: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};

interface Seed {
  name: string;
  /** Breaks one thing in an installed, healthy repo. */
  seed(root: string): void;
  /** Present on PATH for this seed (default: everything). */
  hasBin?: (bin: string) => boolean;
  /** The doctor line that must report it. */
  expect: { check: string; status: 'warn' | 'fail'; detail: RegExp };
}

export const SEEDED_MISCONFIGURATIONS: Seed[] = [
  { name: 'Claude settings are not valid JSON', seed: (r) => write(r, '.claude/settings.json', '{ "hooks": '), expect: { check: 'client:claude', status: 'fail', detail: /not valid JSON/ } },
  { name: 'Claude Stop hook deleted', seed: (r) => write(r, '.claude/settings.json', '{"hooks":{"PreToolUse":[{"matcher":"Read|Bash","hooks":[{"type":"command","command":"gw hook claude pre_tool","timeout":10}]}]}}\n'), expect: { check: 'client:claude', status: 'warn', detail: /incomplete.*\.claude\/settings\.json/ } },
  { name: 'Claude MCP server missing', seed: (r) => rmSync(path.join(r, '.mcp.json')), expect: { check: 'client:claude', status: 'warn', detail: /\.mcp\.json/ } },
  { name: 'Codex hooks file removed', seed: (r) => rmSync(path.join(r, '.codex/hooks.json')), expect: { check: 'client:codex', status: 'warn', detail: /\.codex\/hooks\.json/ } },
  { name: 'Codex MCP block removed', seed: (r) => write(r, '.codex/config.toml', 'model = "x"\n'), expect: { check: 'client:codex', status: 'warn', detail: /\.codex\/config\.toml/ } },
  { name: 'Cursor hooks emptied', seed: (r) => write(r, '.cursor/hooks.json', '{"version":1,"hooks":{}}\n'), expect: { check: 'client:cursor', status: 'warn', detail: /\.cursor\/hooks\.json/ } },
  { name: 'Gemini MCP entry removed', seed: (r) => write(r, '.gemini/settings.json', '{"theme":"dark"}\n'), expect: { check: 'client:gemini', status: 'warn', detail: /\.gemini\/settings\.json/ } },
  { name: 'Zed settings are not valid JSON', seed: (r) => write(r, '.zed/settings.json', '// comment\n{}'), expect: { check: 'client:zed', status: 'fail', detail: /not valid JSON/ } },
  { name: 'skill deleted (OpenCode)', seed: (r) => rmSync(path.join(r, '.agents/skills/groundwork/SKILL.md')), expect: { check: 'client:opencode', status: 'warn', detail: /SKILL\.md/ } },
  { name: 'gw is not on PATH', seed: () => {}, hasBin: () => false, expect: { check: 'client:kiro', status: 'warn', detail: /`gw` is not on PATH/ } },
  { name: 'client present but never installed', seed: (r) => gw(r, ['install', '--remove', '--client', 'copilot', '--yes']), expect: { check: 'client:copilot', status: 'warn', detail: /not installed for it/ } },
  { name: 'index deleted', seed: (r) => rmSync(path.join(r, '.groundwork/index.db')), expect: { check: 'index', status: 'warn', detail: /not built yet/ } },
  { name: 'index is not a database', seed: (r) => write(r, '.groundwork/index.db', 'not sqlite'), expect: { check: 'index', status: 'warn', detail: /unreadable|schema/ } },
  { name: 'config.json invalid', seed: (r) => write(r, '.groundwork/config.json', '{"profile":"loud"}'), expect: { check: 'config', status: 'fail', detail: /profile/ } },
  { name: 'type checks disabled', seed: (r) => write(r, '.groundwork/config.json', '{"types":{"enabled":false}}'), expect: { check: 'types:typescript', status: 'warn', detail: /disabled/ } },
  { name: 'Python files but no pyright', seed: () => {}, hasBin: (b) => b !== 'pyright', expect: { check: 'types:python', status: 'warn', detail: /pyright not found/ } },
  { name: 'stale index lock', seed: (r) => write(r, '.groundwork/index.lock', '999999'), expect: { check: 'lock', status: 'warn', detail: /index\.lock/ } },
];

function installed(root: string): string | null {
  const r = gw(root, ['install', '--client', 'all', '--yes', '--json']);
  return r.status === 0 ? null : `gw install failed: ${r.stdout}${r.stderr}`;
}

export async function doctorSeedResults(): Promise<{ name: string; ok: boolean; got: DoctorCheck | undefined }[]> {
  const out: { name: string; ok: boolean; got: DoctorCheck | undefined }[] = [];
  for (const s of SEEDED_MISCONFIGURATIONS) {
    await withCheckScenario('clean', async (root) => {
      const home = tempDir('gw-adoption-home-');
      try {
        const failed = gw(root, ['init']).status !== 0 ? 'gw init failed' : installed(root);
        if (failed) throw new Error(failed);
        const hasBin = s.hasBin ?? (() => true);
        const healthy = await runDoctor(root, { home, hasBin: () => true });
        const bad = healthy.filter((c) => c.status !== 'ok' && !c.name.startsWith('grammar'));
        if (bad.length) throw new Error(`baseline is not healthy: ${bad.map((c) => `${c.name}: ${c.detail}`).join('; ')}`);
        s.seed(root);
        const got = (await runDoctor(root, { home, hasBin })).find((c) => c.name === s.expect.check);
        out.push({ name: s.name, ok: !!got && got.status === s.expect.status && s.expect.detail.test(got.detail), got });
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    });
  }
  return out;
}

export interface FirstBlock { client: string; route: 'stop-hook' | 'gw-check'; blocked: boolean; ms: number; detail: string }

/** Empty repo with a duplicate about to be added -> `gw init`, `gw install`, the client's gate. Timed end to end. */
export async function firstBlockTimes(): Promise<FirstBlock[]> {
  const out: FirstBlock[] = [];
  for (const client of CLIENTS) {
    await withCheckScenario('duplicate', (root) => {
      rmSync(path.join(root, '.groundwork'), { recursive: true, force: true });
      const start = performance.now();
      const steps = [gw(root, ['init']), gw(root, ['install', '--client', client.name, '--profile', 'strict', '--yes'])];
      const failed = steps.find((s) => s.status !== 0);
      let blocked = false, detail = failed ? `${failed.stdout}${failed.stderr}`.trim() : '';
      if (!failed && client.enforcement === 'hooks') {
        const r = gw(root, ['hook', client.name, 'stop'], JSON.stringify({ cwd: root, workspace_roots: [root], session_id: `adoption-${client.name}` }));
        try {
          const answer = JSON.parse(r.stdout) as { decision?: string; followup_message?: string };
          blocked = answer.decision === 'block' || /BLOCK/.test(answer.followup_message ?? '');
        } catch {
          blocked = false;
        }
        detail = blocked ? 'Stop hook blocked the duplicate' : `Stop hook did not block: ${r.stdout.slice(0, 200)}`;
      } else if (!failed) {
        const r = gw(root, ['check', '--json']);
        try {
          blocked = r.status === 1 && (JSON.parse(r.stdout) as { blocked?: boolean }).blocked === true;
        } catch {
          blocked = false;
        }
        detail = blocked ? 'gw check blocked the duplicate (no hooks in this client)' : `gw check did not block: ${r.stdout.slice(0, 200)}`;
      }
      out.push({ client: client.name, route: client.enforcement === 'hooks' ? 'stop-hook' : 'gw-check', blocked, ms: Math.round(performance.now() - start), detail });
    });
  }
  return out;
}

const LIMIT_MS = 5 * 60_000;

export const ADOPTION_CHECKS: Check[] = [
  { phase: 8, name: 'doctor reports every seeded misconfiguration', async run() {
    const results = await doctorSeedResults();
    const missed = results.filter((r) => !r.ok);
    return { ok: missed.length === 0, detail: missed.length ? missed.map((m) => `missed: ${m.name} (doctor said: ${m.got ? `${m.got.status} ${m.got.detail}` : 'nothing'})`).join('\n') : `${results.length}/${results.length} seeded misconfigurations reported`, metrics: { seeded: results.length, reported: results.length - missed.length } };
  } },
  { phase: 8, name: 'install to first block on every client route (clients not launched)', async run() {
    const times = await firstBlockTimes();
    const bad = times.filter((t) => !t.blocked || t.ms >= LIMIT_MS);
    const slowest = Math.max(...times.map((t) => t.ms));
    return { ok: bad.length === 0, detail: bad.length ? bad.map((b) => `${b.client}: ${b.detail} (${b.ms} ms)`).join('\n') : `${times.length} clients blocked; slowest ${slowest} ms on ${os.platform()} (limit ${LIMIT_MS} ms; excludes installing Node, Groundwork and the client)`, metrics: Object.fromEntries(times.map((t) => [`${t.client}_ms`, t.ms])) };
  } },
];

