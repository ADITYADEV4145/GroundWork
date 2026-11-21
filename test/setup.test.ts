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
    expect(readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.groundwork]');
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
    const custom = targetsFor({ root, home, gw: 'npx -y groundwork-agent' });
    applySetup(root, planSetup(root, custom, 'add'), 'add');
    const plain = targetsFor({ root, home, gw: 'gw' });
    applySetup(root, planSetup(root, plain, 'add'), 'add');
    const settings = JSON.parse(readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    applySetup(root, planSetup(root, plain, 'remove'), 'remove');
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
