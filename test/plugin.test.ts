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
});
