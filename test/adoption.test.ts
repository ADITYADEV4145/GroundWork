import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applySetup, planSetup } from '../src/setup/apply.js';
import { CLIENTS, clientTargets, dedupeEdits, detectClients } from '../src/setup/clients.js';
import { clientStatuses } from '../src/setup/status.js';
import { doctorSeedResults } from '../src/selftest/checks/adoption.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { compareVersions, runUpdate, selfUpdateBlocker, verifyIntegrity } from '../src/update/update.js';
import { buildViewModel, lastSessionBlocks, renderViewHtml } from '../src/view/view.js';

const dirs: string[] = [];
const servers: Server[] = [];
afterEach(() => {
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
  servers.splice(0).forEach((s) => s.close());
});
const temp = () => {
  const d = tempDir('gw-adoption-');
  dirs.push(d);
  return d;
};
const read = (root: string, file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const install = (root: string, mode: 'add' | 'remove' = 'add') => {
  const targets = dedupeEdits(clientTargets({ root, gw: 'gw' }));
  applySetup(root, planSetup(root, targets, mode), mode);
};

describe('gw install', () => {
  it('knows eight clients and says which ones have hooks', () => {
    expect(CLIENTS.map((c) => c.name)).toEqual(['claude', 'codex', 'cursor', 'gemini', 'copilot', 'zed', 'kiro', 'opencode']);
    expect(CLIENTS.filter((c) => c.enforcement === 'hooks').map((c) => c.name)).toEqual(['claude', 'codex', 'cursor']);
    for (const c of CLIENTS.filter((c) => c.enforcement === 'mcp-only')) expect(c.enforced).toMatch(/nothing is blocked/);
  });

  it('detects clients from binaries, home directories and project config', () => {
    const home = temp(), root = temp();
    expect(detectClients(home, root, () => false)).toEqual([]);
    mkdirSync(path.join(home, '.gemini'));
    mkdirSync(path.join(home, '.config', 'zed'), { recursive: true });
    mkdirSync(path.join(root, '.kiro'));
    mkdirSync(path.join(root, '.claude'));
    expect(detectClients(home, root, () => false)).toContain('claude');
    rmSync(path.join(root, '.claude'), { recursive: true });
    expect(detectClients(home, root, (bin) => bin === 'opencode' || bin === 'code')).toEqual(['gemini', 'copilot', 'zed', 'kiro', 'opencode']);
  });

  it('writes each client its own MCP shape, keeps user entries, and removes without a trace', () => {
    const root = temp();
    mkdirSync(path.join(root, '.vscode'));
    writeFileSync(path.join(root, '.vscode', 'mcp.json'), '{"servers":{"mine":{"type":"stdio","command":"echo"}}}\n');
    mkdirSync(path.join(root, '.zed'));
    writeFileSync(path.join(root, '.zed', 'settings.json'), '{"context_servers":{"groundwork":{"command":"custom","args":[]}}}\n');
    const before = { vscode: readFileSync(path.join(root, '.vscode/mcp.json'), 'utf8'), zed: readFileSync(path.join(root, '.zed/settings.json'), 'utf8') };
    install(root);
    expect(read(root, '.gemini/settings.json').mcpServers.groundwork).toEqual({ command: 'gw', args: ['mcp'] });
    expect(read(root, '.vscode/mcp.json').servers).toEqual({ mine: { type: 'stdio', command: 'echo' }, groundwork: { type: 'stdio', command: 'gw', args: ['mcp'] } });
    expect(read(root, '.kiro/settings/mcp.json').mcpServers.groundwork).toEqual({ command: 'gw', args: ['mcp'] });
    expect(read(root, 'opencode.json')).toEqual({ $schema: 'https://opencode.ai/config.json', mcp: { groundwork: { type: 'local', command: ['gw', 'mcp'], enabled: true } } });
    // An entry the user wrote under our name is theirs.
    expect(readFileSync(path.join(root, '.zed/settings.json'), 'utf8')).toBe(before.zed);
    expect(existsSync(path.join(root, '.agents/skills/groundwork/SKILL.md'))).toBe(true);
    expect(planSetup(root, dedupeEdits(clientTargets({ root, gw: 'gw' })), 'add').every((c) => c.action === 'unchanged')).toBe(true);
    install(root, 'remove');
    expect(readFileSync(path.join(root, '.vscode/mcp.json'), 'utf8')).toBe(before.vscode);
    expect(readFileSync(path.join(root, '.zed/settings.json'), 'utf8')).toBe(before.zed);
    for (const gone of ['.gemini', '.kiro', 'opencode.json', '.agents', '.claude', '.codex', '.cursor', '.mcp.json']) expect(existsSync(path.join(root, gone))).toBe(false);
  });

  it('reports install state per client, with a custom launcher', () => {
    const root = temp(), home = temp();
    const targets = dedupeEdits(clientTargets({ root, gw: 'npx -y groundwork-agent' }));
    applySetup(root, planSetup(root, targets, 'add'), 'add');
    const statuses = clientStatuses(root, { home, hasBin: (b) => b === 'npx' });
    expect(statuses.map((s) => s.state)).toEqual(Array(8).fill('installed'));
    expect(statuses.every((s) => s.command === 'npx -y groundwork-agent' && s.commandFound)).toBe(true);
    rmSync(path.join(root, '.cursor/mcp.json'));
    const cursor = clientStatuses(root, { home, hasBin: () => true }).find((s) => s.client === 'cursor')!;
    expect(cursor).toMatchObject({ state: 'partial', missing: ['.cursor/mcp.json'] });
  });
});

describe('gw doctor', () => {
  it('reports every seeded misconfiguration', async () => {
    const results = await doctorSeedResults();
    expect(results.length).toBeGreaterThanOrEqual(15);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  }, 120_000);
});

describe('gw update', () => {
  const tarball = Buffer.from('pretend tarball');
  const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
  async function registry(version: string, sri: string): Promise<string> {
    const server = createServer((req, res) => {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      if (req.url === '/groundwork-agent/latest') res.end(JSON.stringify({ version, dist: { tarball: `${base}/t.tgz`, integrity: sri } }));
      else if (req.url === '/t.tgz') res.end(tarball);
      else {
        res.statusCode = 404;
        res.end();
      }
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('orders versions', () => {
    expect(compareVersions('0.1.0', '0.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
  });

  it('installs only a tarball whose sha512 matches', async () => {
    const installed: Buffer[] = [];
    const result = await runUpdate({ registry: await registry('9.0.0', integrity), current: '0.0.1', install: (f) => installed.push(readFileSync(f)) });
    expect(result).toMatchObject({ status: 'installed', verified: true, latest: '9.0.0' });
    expect(installed).toEqual([tarball]);
  });

  it('refuses a wrong, weak or missing checksum and installs nothing', async () => {
    const wrong = `sha512-${createHash('sha512').update('other').digest('base64')}`;
    const sha1 = `sha1-${createHash('sha1').update(tarball).digest('base64')}`;
    for (const [sri, message] of [[wrong, /checksum mismatch/], [sha1, /no sha512/], ['', /no sha512/]] as const) {
      let called = false;
      await expect(runUpdate({ registry: await registry('9.0.0', sri), current: '0.0.1', install: () => { called = true; } })).rejects.toThrow(message);
      expect(called).toBe(false);
    }
    expect(() => verifyIntegrity(tarball, integrity)).not.toThrow();
  });

  it('does not download when current, or with --check', async () => {
    const never = () => { throw new Error('installed'); };
    expect(await runUpdate({ registry: await registry('0.0.1', integrity), current: '0.0.1', install: never })).toMatchObject({ status: 'up-to-date', updateAvailable: false });
    expect(await runUpdate({ registry: await registry('9.0.0', 'sha512-bad'), current: '0.0.1', check: true, install: never })).toMatchObject({ status: 'available', updateAvailable: true });
  });

  it('will not replace a source checkout', () => {
    expect(selfUpdateBlocker()).toMatch(/source checkout/);
    const prefix = temp(), pkg = path.join(prefix, 'groundwork-agent');
    mkdirSync(pkg);
    expect(selfUpdateBlocker(pkg, () => prefix)).toBeNull();
    expect(selfUpdateBlocker(temp(), () => prefix)).toMatch(/not in npm's global directory/);
    expect(compareVersions('1.0.0-rc.10', '1.0.0-rc.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-alpha', '1.0.0-1')).toBeGreaterThan(0);
  });
});

describe('gw view', () => {
  it('reads the blocks of the last session from the log', () => {
    const root = temp();
    mkdirSync(path.join(root, '.groundwork/logs'), { recursive: true });
    const lines = [
      { t: '1', event: 'duplicate_gate', status: 'blocked', sessionId: 'old', findings: [{ kind: 'duplicate', file: 'old.ts', line: 1, symbol: 'x' }] },
      { t: '2', event: 'read_guard_blocked', sessionId: 'new', file: path.join(root, 'src/a.ts'), from: 1, to: 9 },
      { t: '3', event: 'duplicate_gate', status: 'ignored', sessionId: 'new' },
      { t: '4', event: 'duplicate_gate', status: 'warned', sessionId: 'new', findings: [{ kind: 'grounding:type', file: 'src/b.ts', line: 7, symbol: 'f' }] },
    ];
    writeFileSync(path.join(root, '.groundwork/logs/groundwork.log'), lines.map((l) => JSON.stringify(l)).join('\n') + '\nnot json\n');
    expect(lastSessionBlocks(root)).toEqual({ sessionId: 'new', blocks: [
      { kind: 'read-guard', file: 'src/a.ts', line: 1, symbol: null, outcome: 'blocked', at: '2' },
      { kind: 'grounding:type', file: 'src/b.ts', line: 7, symbol: 'f', outcome: 'warned', at: '4' },
    ] });
    expect(lastSessionBlocks(temp())).toEqual({ sessionId: null, blocks: [] });
  });

  it('builds a file graph, groups large repos by directory, and renders one offline page', () => {
    const session = { sessionId: 's', blocks: [{ kind: 'duplicate', file: 'src/a.ts', line: 3, symbol: 'a</script><b>', outcome: 'blocked' as const, at: 't' }] };
    const small = buildViewModel({ files: [{ path: 'src/a.ts', language: 'typescript', lines: 10 }, { path: 'src/b.ts', language: 'typescript', lines: 5 }], edges: [{ from: 'src/a.ts', to: 'src/b.ts' }] }, session);
    expect(small).toMatchObject({ granularity: 'file', edges: [{ from: 'src/a.ts', to: 'src/b.ts', weight: 1 }] });
    expect(small.nodes.find((n) => n.id === 'src/a.ts')!.blocks).toBe(1);
    const files = Array.from({ length: 500 }, (_, i) => ({ path: `pkg${i % 5}/f${i}.ts`, language: 'typescript', lines: 1 }));
    const big = buildViewModel({ files, edges: [{ from: 'pkg0/f0.ts', to: 'pkg1/f1.ts' }, { from: 'pkg0/f5.ts', to: 'pkg1/f6.ts' }, { from: 'pkg0/f0.ts', to: 'pkg0/f5.ts' }] }, { sessionId: null, blocks: [] });
    expect(big).toMatchObject({ granularity: 'directory', edges: [{ from: 'pkg0', to: 'pkg1', weight: 2 }] });
    expect(big.nodes).toHaveLength(5);
    const html = renderViewHtml(small, 'repo <x>');
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    expect(html).not.toContain('a</script>');
    expect(html).toContain('repo &#60;x&#62;');
  });
});
