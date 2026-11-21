import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalise, render, failOpenOutput } from '../src/hooks/run.js';
import { applySetup, planSetup } from '../src/setup/apply.js';
import { targetsFor } from '../src/setup/targets.js';
import { tempDir } from '../src/selftest/fixtures.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else out[path.relative(dir, p)] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

describe('gw setup', () => {
  it('install then remove leaves no trace and keeps existing settings', () => {
    const root = tempDir('gw-setup-root-');
    const home = tempDir('gw-setup-home-');
    dirs.push(root, home);
    mkdirSync(path.join(root, '.claude'));
    writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({ model: 'x', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo bye' }] }] } }, null, 2));
    mkdirSync(path.join(home, '.codex'));
    writeFileSync(path.join(home, '.codex', 'config.toml'), 'model = "o4"\n');
    const before = { root: snapshot(root), home: snapshot(home) };

    const targets = targetsFor({ root, home, gw: 'gw' });
    const plan = planSetup(root, targets, 'add');
    applySetup(root, plan, 'add');
    const settings = JSON.parse(readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
    expect(settings.model).toBe('x');
    expect(settings.hooks.Stop).toHaveLength(2);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe('gw hook claude pre_tool');
    expect(JSON.parse(readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers.groundwork).toEqual({ command: 'gw', args: ['mcp'] });
    expect(readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.groundwork]');
    expect(readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8')).toBe('model = "o4"\n');
    expect(JSON.parse(readFileSync(path.join(root, '.cursor', 'hooks.json'), 'utf8')).hooks.preToolUse[0].command).toBe('gw hook cursor pre_tool');
    expect(planSetup(root, targets, 'add').every((c) => c.action === 'unchanged')).toBe(true);

    applySetup(root, planSetup(root, targets, 'remove'), 'remove');
    expect(snapshot(root)).toEqual(before.root);
    expect(snapshot(home)).toEqual(before.home);
  });
});

describe('gw setup edge cases', () => {
  function fresh() {
    const root = tempDir('gw-setup-root-');
    const home = tempDir('gw-setup-home-');
    dirs.push(root, home);
    return { root, home };
  }

  it('removes hooks installed with a custom --command and does not duplicate them on re-setup', () => {
    const { root, home } = fresh();
    const custom = targetsFor({ root, home, gw: 'npx -y groundwork-agent@0.0.1' });
    applySetup(root, planSetup(root, custom, 'add'), 'add');
    const plain = targetsFor({ root, home, gw: 'gw' });
    applySetup(root, planSetup(root, plain, 'add'), 'add');
    const settings = JSON.parse(readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    applySetup(root, planSetup(root, plain, 'remove'), 'remove');
    expect(snapshot(root)).toEqual({});
  });
});

describe('gw setup keeps user config', () => {
  it('never overwrites or removes a groundwork MCP entry the user wrote', () => {
    const root = tempDir('gw-setup-root-');
    const home = tempDir('gw-setup-home-');
    dirs.push(root, home);
    const mine = JSON.stringify({ mcpServers: { groundwork: { command: 'gw', args: ['mcp'], env: { GW_LOG: '1' } } } }, null, 2) + '\n';
    writeFileSync(path.join(root, '.mcp.json'), mine);
    const targets = targetsFor({ root, home, gw: 'gw' }).filter((t) => t.agent === 'claude');
    applySetup(root, planSetup(root, targets, 'add'), 'add');
    expect(readFileSync(path.join(root, '.mcp.json'), 'utf8')).toBe(mine);
    applySetup(root, planSetup(root, targets, 'remove'), 'remove');
    expect(readFileSync(path.join(root, '.mcp.json'), 'utf8')).toBe(mine);
  });
});

describe('gw setup with Codex config', () => {
  it('does not declare mcp_servers.groundwork twice', () => {
    const root = tempDir('gw-setup-root-');
    dirs.push(root);
    mkdirSync(path.join(root, '.codex'));
    const mine = '[mcp_servers.groundwork] # local server\ncommand = "node"\nargs = ["dist/cli/main.js", "mcp"]\n';
    writeFileSync(path.join(root, '.codex', 'config.toml'), mine);
    const targets = targetsFor({ root, gw: 'gw' }).filter((t) => t.agent === 'codex');
    applySetup(root, planSetup(root, targets, 'add'), 'add');
    expect(readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8')).toBe(mine);
    applySetup(root, planSetup(root, targets, 'remove'), 'remove');
    expect(readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8')).toBe(mine);
  });
});

describe('gw setup ignores look-alikes', () => {
  it('keeps user hooks and servers that resemble Groundwork, and installs past a similar TOML table', () => {
    const root = tempDir('gw-setup-root-');
    dirs.push(root);
    mkdirSync(path.join(root, '.claude'));
    mkdirSync(path.join(root, '.codex'));
    const settings = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'python scripts/team_hooks.py hook claude stop' }] }] } }, null, 2) + '\n';
    const mcp = JSON.stringify({ mcpServers: { groundwork: { command: 'node', args: ['tools/other.js', 'mcp'] } } }, null, 2) + '\n';
    const toml = '[mcp_servers."ground work"]\ncommand = "x"\n';
    writeFileSync(path.join(root, '.claude', 'settings.json'), settings);
    writeFileSync(path.join(root, '.mcp.json'), mcp);
    writeFileSync(path.join(root, '.codex', 'config.toml'), toml);
    const targets = targetsFor({ root, gw: 'gw' }).filter((t) => t.agent !== 'cursor');
    applySetup(root, planSetup(root, targets, 'add'), 'add');
    expect(readFileSync(path.join(root, '.mcp.json'), 'utf8')).toBe(mcp);
    expect(readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.groundwork]');
    applySetup(root, planSetup(root, targets, 'remove'), 'remove');
    expect(readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')).toBe(settings);
    expect(readFileSync(path.join(root, '.mcp.json'), 'utf8')).toBe(mcp);
    expect(readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8')).toBe(toml);
  });
});

describe('gw setup after a formatter', () => {
  it('still removes an MCP entry whose keys were reordered', () => {
    const root = tempDir('gw-setup-root-');
    dirs.push(root);
    const targets = targetsFor({ root, gw: 'gw' }).filter((t) => t.agent === 'claude');
    applySetup(root, planSetup(root, targets, 'add'), 'add');
    writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { groundwork: { args: ['mcp'], command: 'gw' } } }, null, 2) + '\n');
    applySetup(root, planSetup(root, targets, 'remove'), 'remove');
    expect(snapshot(root)).toEqual({});
  });
});

describe('hook rendering', () => {
  it('cursor permission hooks always answer with valid JSON', () => {
    const ev = normalise('cursor', 'pre_tool', { tool_name: 'Shell', tool_input: { command: 'ls' }, workspace_roots: ['/w'] });
    expect(ev.tool).toBe('Bash');
    expect(ev.cwd).toBe('/w');
    expect(JSON.parse(render(ev, { action: 'allow' }))).toEqual({ permission: 'allow' });
    expect(JSON.parse(render(ev, { action: 'deny', message: 'no' })).permission).toBe('deny');
    expect(failOpenOutput('cursor', 'pre_tool')).toBe('{"permission":"allow"}');
    expect(normalise('cursor', 'post_tool', { tool_name: 'MCP:find_code' }).tool).toBe('mcp__groundwork__find_code');
  });

  it('claude and codex share hookSpecificOutput; stop blocks with decision', () => {
    const ev = normalise('codex', 'pre_tool', { tool_name: 'Bash' });
    expect(JSON.parse(render(ev, { action: 'deny', message: 'x' })).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(JSON.parse(render(normalise('claude', 'stop', {}), { action: 'deny', message: 'dup' }))).toEqual({ decision: 'block', reason: 'dup' });
    expect(render(normalise('claude', 'pre_tool', {}), { action: 'allow' })).toBe('');
  });
});
