import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pluginHooks } from '../scripts/gen-plugin.js';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

describe('Claude Code plugin', () => {
  it('hooks/hooks.json matches the gw setup hook map (run `node --import tsx scripts/gen-plugin.ts`)', () => {
    expect(json('hooks/hooks.json')).toEqual(pluginHooks());
  });

  it('manifest and marketplace agree', () => {
    const plugin = json('.claude-plugin/plugin.json');
    const market = json('.claude-plugin/marketplace.json');
    expect(market.plugins[0].name).toBe(plugin.name);
    expect(plugin.version).toBe(json('package.json').version);
    expect(json('.mcp.json').mcpServers.groundwork.args).toContain('mcp');
  });

  it('launches the gw on PATH, so it works from a source install before npm publish', () => {
    expect(json('.mcp.json').mcpServers.groundwork.command).toBe('gw');
    expect(JSON.stringify(json('hooks/hooks.json'))).not.toContain('npx');
  });

  it('ships the plugin, skill and references in the npm package', () => {
    const files: string[] = json('package.json').files;
    for (const f of ['dist', 'SKILL.md', 'references', 'hooks', '.claude-plugin', '.mcp.json']) expect(files).toContain(f);
  });
});
