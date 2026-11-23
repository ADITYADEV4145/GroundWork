import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));

describe('marketplace metadata', () => {
  it('ties the stdio MCP registry entry to the npm package', () => {
    const server = JSON.parse(read('server.json'));
    expect(server.name).toBe(pkg.mcpName);
    expect(server.packages).toEqual([expect.objectContaining({
      registryType: 'npm',
      identifier: pkg.name,
      version: server.version,
      transport: { type: 'stdio' },
      packageArguments: [{ type: 'positional', value: 'mcp' }],
    })]);
  });

  it('configures the Smithery stdio launcher', () => {
    const { startCommand } = parse(read('smithery.yaml'));
    expect(startCommand.type).toBe('stdio');
    expect(startCommand.configSchema).toEqual({ type: 'object', properties: {} });
    expect(runInNewContext(`(${startCommand.commandFunction})()`, {}, { timeout: 1000 })).toEqual({
      command: 'npx',
      args: ['-y', pkg.name, 'mcp'],
    });
  });

  it('links to Cursor with a workspace-scoped launch command', () => {
    const [, href] = read('README.md').match(/\[Add to Cursor\]\(([^)]+)\)/)!;
    const url = new URL(href!);
    expect(url.origin + url.pathname).toBe('https://cursor.com/install-mcp');
    expect(url.searchParams.get('name')).toBe('groundwork');
    const config = Buffer.from(url.searchParams.get('config')!, 'base64').toString('utf8');
    expect(JSON.parse(config)).toEqual({
      command: 'gw',
      args: ['--root', '${workspaceFolder}', 'mcp'],
    });
  });
});
