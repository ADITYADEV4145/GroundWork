import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { FIXTURE_NAVIGATION, runNavigationTool } from '../src/selftest/checks/phase2.js';
import { tempDir, withIndexedFixture } from '../src/selftest/fixtures.js';
import { initSqlBackend, openDb, sqliteBackendAvailable } from '../src/store/db.js';

const config = defaultConfig();

describe('MCP navigation', () => {
  it('matches the fixture goldens', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const output = Object.fromEntries(await Promise.all(FIXTURE_NAVIGATION.map(async ([name, args]) => {
        const value = await runNavigationTool(name, name === 'find_code' || name === 'outline' ? { ...args, locations_only: false } : args, { root, db, config });
        return [name, value.replace(/ · \d+(?:\.\d+)?/g, ' · <score>')];
      })));
      expect(output).toMatchSnapshot();
    });
    await withIndexedFixture('py-app', async (db, root) => {
      const ctx = { root, db, config };
      expect(await runNavigationTool('find_code', { query: 'including tax', locations_only: false }, ctx)).toContain('Charge an invoice including tax.');
      expect(await runNavigationTool('read_symbol', { symbol: 'charge' }, ctx)).toMatchSnapshot();
    });
  });

  it('keeps locator views short and pages without switching to signatures', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const ctx = { root, db, config };
      const query = { query: 'format date', kind: 'function' };
      const full = await runNavigationTool('find_code', { ...query, locations_only: false }, ctx);
      expect(full).toContain('formatDate(d: Date');
      const fullPage = await runNavigationTool('find_code', { ...query, locations_only: false, limit: 1 }, ctx);
      const fullCursor = JSON.parse(fullPage.split('Next: find_code(')[1]!.slice(0, -1));
      expect(fullCursor.locations_only).toBe(false);
      expect(await runNavigationTool('find_code', fullCursor, ctx)).toContain('pad(n: number');
      const locations = await runNavigationTool('find_code', { ...query, locations_only: true }, ctx);
      expect(locations).toContain('formatDate (function) — src/utils/date.ts:4');
      expect(locations).not.toContain('formatDate(d: Date');
      expect(locations.split('\n').filter((row) => row.startsWith('['))).toHaveLength(3);
      const next = JSON.parse(locations.split('Next: find_code(')[1]!.slice(0, -1));
      expect(await runNavigationTool('find_code', next, ctx)).toMatch(/joinParts \(function\).*date\.ts:18$/);
      const outline = await runNavigationTool('outline', { file: 'src/utils/date.ts', locations_only: true }, ctx);
      expect(outline).toContain('4-6 formatDate (function)');
      expect(outline).not.toContain('formatDate(d: Date');
      const map = await runNavigationTool('repo_map', { limit: 1 }, ctx);
      const cursor = JSON.parse(map.split('Next: repo_map(')[1]!.slice(0, -1));
      expect(cursor).toMatchObject({ limit: 1, offset: 1 });
      expect(await runNavigationTool('repo_map', cursor, ctx)).not.toBe(map);
    });
  });

  it('defaults to exact locations, preserves broad opt-in, and rejects invalid breadth', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const ctx = { root, db, config };
      const exact = await runNavigationTool('find_code', { query: 'formatDate' }, ctx);
      expect(exact).toContain('Exact (1)');
      expect(exact).toContain('breadth="all"');
      expect(exact).not.toContain('pad (');
      expect(exact).not.toContain('formatDate(d:');
      const broad = await runNavigationTool('find_code', { query: 'formatDate', breadth: 'all' }, ctx);
      expect(broad).toContain('pad (');
      expect(broad).toContain('Next:');
      expect(await runNavigationTool('find_code', { query: 'get' }, ctx)).toContain('ApiClient.get');
      expect(await runNavigationTool('outline', { file: 'src/utils/date.ts' }, ctx)).not.toContain('formatDate(d:');
      expect(await runNavigationTool('find_code', { query: 'notarealsymbolzz' }, ctx)).toContain('No indexed matches');
      await expect(runNavigationTool('find_code', { query: 'formatDate', breadth: 'invalid' }, ctx)).rejects.toThrow();
    });
  });

  it('bounds every response, returns usable cursors, and reads exact UTF-16 ranges', async () => {
    const root = tempDir('gw-nav-budget-');
    try {
      const target = 'export function needle() {\n' + "  return 'é😀" + '😀'.repeat(3200) + "';\n}";
      const file = 'massive.ts';
      const callers = Array.from({ length: 115 }, (_, i) => `export function needleCaller${i}() { return needle(); }`).join('\n');
      const manyCallees = 'export function needleMany() {\n' + '  needle();\n'.repeat(120) + '}';
      const lookalike = 'export class Lookalike { needle() { return 0; } }';
      const source = "// before\n/*é😀*/ " + target + '\n// after\n' + callers + '\n' + manyCallees + '\n' + lookalike + '\n';
      writeFileSync(path.join(root, file), source);
      for (let i = 0; i < 120; i++) writeFileSync(path.join(root, `sibling-${i}.ts`), `export function other${i}() {}\n`);
      await initSqlBackend();
      await refreshIndex(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        const ctx = { root, db, config };
        const ambiguous = await runNavigationTool('read_symbol', { symbol: 'needle' }, ctx);
        expect(ambiguous).toContain('Ambiguous symbol');
        expect(ambiguous).toContain('Lookalike.needle');
        expect(ambiguous).not.toContain('return');
        const exact = await runNavigationTool('find_code', { query: 'needle' }, ctx);
        expect(exact).toContain('Exact (2)');
        expect(exact).toContain('Lookalike.needle');
        expect(await runNavigationTool('find_code', { query: 'needle', include_body: true }, ctx)).toBe(exact);
        const explored = await runNavigationTool('explore', { symbol: 'needle', limit: 1 }, ctx);
        const continuation = JSON.parse(/Next: explore\((.+)\)$/.exec(explored)![1]!);
        expect(continuation.offset).toBe(1);
        expect(await runNavigationTool('explore', continuation, ctx)).toContain('Lookalike.needle');
        const id = ambiguous.split('\n')[1]!.match(/\[(\w+)\]/)![1]!;
        let args: object = { symbol: id };
        let combined = '';
        for (let i = 0; i < 10; i++) {
          const read = await runNavigationTool('read_symbol', args, ctx);
          const body = read.slice(read.indexOf('\n') + 1);
          const cursor = body.lastIndexOf('\n… ');
          combined += cursor < 0 ? body : body.slice(0, cursor);
          if (cursor < 0) break;
          args = JSON.parse(body.slice(body.lastIndexOf('Next: read_symbol(') + 'Next: read_symbol('.length, -1));
        }
        expect(combined).toBe(target.slice('export '.length));
        expect(await runNavigationTool('read_symbol', { symbol: id, context_lines: 1 }, ctx)).toContain('// before\n/*é😀*/ export function needle');
        for (const [name, input] of [
          ['find_code', { query: 'needle', limit: 100, breadth: 'all' }], ['outline', { file }], ['repo_map', {}],
          ['where_used', { name: 'needle' }], ['callers', { symbol: id }], ['callees', { symbol: 'needleMany' }],
        ] as const) {
          const result = await runNavigationTool(name, input, ctx);
          expect(result).toContain(`more. Next: ${name}(`);
          const next = JSON.parse(result.split(`Next: ${name}(`)[1]!.slice(0, -1));
          expect(next.offset).toBeGreaterThan(0);
          expect(await runNavigationTool(name, next, ctx)).not.toBe(result);
        }
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('batches compact bodies and opts in to a unique exact body without changing default output', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const ctx = { root, db, config };
      const names = ['formatDate', 'pad'];
      const batch = await runNavigationTool('read_symbol', { symbols: names }, ctx);
      expect(batch).toContain('function formatDate');
      expect(batch).toContain('function pad');
      const separate = await Promise.all(names.map((symbol) => runNavigationTool('read_symbol', { symbol }, ctx)));
      expect(Buffer.byteLength(batch)).toBeLessThan(separate.reduce((sum, body) => sum + Buffer.byteLength(body), 0));
      const body = await runNavigationTool('find_code', { query: 'formatDate', include_body: true }, ctx);
      expect(body).toContain('function formatDate');
      expect(body).toContain('d.toISOString()');
      expect(await runNavigationTool('find_code', { query: 'formatDate', breadth: 'all', include_body: true }, ctx)).toBe(body);
      expect(await runNavigationTool('find_code', { query: 'formatDate' }, ctx)).not.toContain('d.toISOString()');
      const query = { query: 'format date', limit: 1 };
      const fuzzy = await runNavigationTool('find_code', query, ctx);
      expect(fuzzy).not.toContain('include_body');
      expect(await runNavigationTool('find_code', { query: 'nonexistentzz', include_body: true }, ctx)).toContain('No indexed matches');
      expect(await runNavigationTool('read_symbol', {}, ctx)).toContain('exactly one');
      expect(await runNavigationTool('read_symbol', { symbol: 'pad', symbols: ['pad'] }, ctx)).toContain('exactly one');
      await expect(runNavigationTool('read_symbol', { symbols: [] }, ctx)).rejects.toThrow();
      await expect(runNavigationTool('read_symbol', { symbols: Array(21).fill('pad') }, ctx)).rejects.toThrow();
      const unknown = await runNavigationTool('read_symbol', { symbols: ['notarealnamezz', 'formatDate'] }, ctx);
      expect(unknown).toContain('No exact symbol match');
      expect(unknown).toContain('function formatDate');
      writeFileSync(path.join(root, 'src/utils/date.ts'), 'export function changed() {}');
      expect(await runNavigationTool('find_code', { query: 'formatDate', include_body: true }, ctx)).toContain('changed after indexing');
      expect(await runNavigationTool('read_symbol', { symbols: names }, ctx)).toContain('changed after indexing');
    });
  });

  it('pages batched bodies and source continuations within a shared budget', async () => {
    const root = tempDir('gw-nav-batch-');
    try {
      const names = Array.from({ length: 8 }, (_, i) => 'large' + i);
      const literals = Array.from({ length: 90 }, () => `    '${'é😀'.repeat(20)}',`).join('\n');
      writeFileSync(path.join(root, 'app.ts'), names.map((n) => `export function ${n}() {\n  return [\n${literals}\n  ].join('');\n}`).join('\n'));
      await initSqlBackend(); await refreshIndex(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        const ctx = { root, db, config };
        let args: object = { symbols: names, context_lines: 1 };
        const seen: string[] = [];
        for (let i = 0; i < 8; i++) {
          const output = await runNavigationTool('read_symbol', args, ctx);
          expect(output).not.toContain('\ufffd');
          seen.push(...[...output.matchAll(/\] (large\d+) —/g)].map((match) => match[1]!));
          const next = [...output.matchAll(/Next: read_symbol\(([^\n]+)\)/g)].map((match) => JSON.parse(match[1]!));
          const source = next.find((a) => a.symbol);
          expect(source.context_lines).toBe(1);
          expect(source.offset).toBeGreaterThan(0);
          expect(await runNavigationTool('read_symbol', source, ctx)).not.toContain('\ufffd');
          const batch = next.find((a) => a.symbols);
          if (!batch) break;
          expect(batch.symbol_offset).toBeGreaterThan(0);
          args = batch;
        }
        expect(seen).toEqual(names);
        expect(await runNavigationTool('read_symbol', { symbols: names, offset: 1 }, ctx)).toContain('symbol_offset');
      } finally { db.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('explores bodies, direct graph locations and files in one bounded payload', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const ctx = { root, db, config };
      const output = await runNavigationTool('explore', { symbol: 'ApiClient.get' }, ctx);
      expect(output).toContain("this.request('GET'");
      expect(output).toContain('callers (');
      expect(output).toContain('callees (');
      expect(output).toContain('Files (');
      expect(output).toContain('ApiClient.request');
      expect(output).toContain('src/services/api.ts:');
      expect(output).toContain('call src/services/api.ts:');
      expect(await runNavigationTool('explore', { query: 'formatDate' }, ctx)).toContain('d.toISOString()');
      expect(await runNavigationTool('explore', { symbol: 'ApiClient.request' }, ctx)).toContain('unresolved');
      expect(await runNavigationTool('explore', { query: 'notarealnamezz' }, ctx)).toContain('No indexed definitions');
      expect(await runNavigationTool('explore', {}, ctx)).toContain('exactly one');
      expect(await runNavigationTool('explore', { query: 'pad', symbol: 'pad' }, ctx)).toContain('exactly one');
      writeFileSync(path.join(root, 'src/utils/date.ts'), 'export function changed() {}');
      expect(await runNavigationTool('explore', { symbol: 'formatDate' }, ctx)).toContain('changed after indexing');
    });
  });

  it('serves the registered tools over stdio and refreshes before the next call', async () => {
    const root = tempDir('gw-mcp-stdio-');
    const client = new Client({ name: 'navigation-test', version: '1.0.0' });
    try {
      const file = path.join(root, 'app.ts');
      writeFileSync(file, 'export function first() { return 1; }\n');
      await client.connect(new StdioClientTransport({
        command: process.execPath,
        args: ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('../src/cli/main.ts', import.meta.url)), '--root', root, 'mcp'],
        stderr: 'pipe',
      }));
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(['find_code', 'outline', 'read_symbol', 'callers', 'callees', 'where_used', 'repo_map']));
      const read = (symbol: string) => client.callTool({ name: 'read_symbol', arguments: { symbol } });
      expect((await read('first')).content).toEqual([{ type: 'text', text: expect.stringContaining('return 1;') }]);
      writeFileSync(file, 'export function other() { return 2; }\n');
      expect((await read('other')).content).toEqual([{ type: 'text', text: expect.stringContaining('return 2;') }]);
      expect((await client.callTool({ name: 'find_code', arguments: { query: '', limit: -1 } })).isError).toBe(true);
    } finally {
      await client.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);

  it.skipIf(sqliteBackendAvailable() !== 'node:sqlite')('searches an FTS4 index built by sql.js after switching to native SQLite', async () => {
    const root = tempDir('gw-nav-backend-');
    try {
      writeFileSync(path.join(root, 'app.py'), 'def send():\n    """Deliver the message."""\n    pass\n');
      execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'),
        fileURLToPath(new URL('../src/cli/main.ts', import.meta.url)), '--root', root, 'index'], {
        env: { ...process.env, GW_FORCE_SQLJS: '1' },
      });
      await initSqlBackend();
      await refreshIndex(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        expect(await runNavigationTool('find_code', { query: 'deliv', locations_only: false }, { root, db, config })).toContain('Deliver the message.');
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds a symbol from documentation words written entirely in non-Latin scripts', async () => {
    const root = tempDir('gw-nav-unicode-');
    try {
      writeFileSync(path.join(root, 'app.py'), 'def pay():\n    """送金 処理"""\n    pass\n');
      await initSqlBackend();
      await refreshIndex(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        expect(await runNavigationTool('find_code', { query: '送金' }, { root, db, config })).toContain('pay (function)');
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds interior name fragments without treating underscores as wildcards', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const ctx = { root, db, config };
      expect(await runNavigationTool('find_code', { query: 'leep' }, ctx)).toContain('sleep (function)');
      expect(await runNavigationTool('find_code', { query: '_leep' }, ctx)).not.toContain('sleep (function)');
    });
  });

  it('finds a joined letter-number term whether the documentation separates it or not', async () => {
    const root = tempDir('gw-nav-numbers-');
    try {
      writeFileSync(path.join(root, 'app.py'), [
        'def negotiate():\n    """Negotiate HTTP/2."""\n    pass\n',
        'def multiplex():\n    """Multiplex HTTP2."""\n    pass\n',
        'def transport():\n    """Wrap HTTP2Server."""\n    pass\n',
        'def endpoint():\n    """Host the HTTP/2Server."""\n    pass\n',
        'def different_version():\n    """Support HTTP/20, HTTP20, HTTP20Server and HTTP/20Server."""\n    pass\n',
        'def retry():\n    """Retry HTTP 3 times."""\n    pass\n',
        'def retry_twice():\n    """Retry HTTP 2x on timeout."""\n    pass\n',
        'def decode():\n    """Decode MP3s."""\n    pass\n',
        'def verify():\n    """Verify 2-factor authentication."""\n    pass\n',
        'def retries():\n    """Allow 2 failed attempts."""\n    pass\n',
        'def authenticate():\n    """Require 2fa for login."""\n    pass\n',
        'def profile():\n    """Load a 3gpp2Profile."""\n    pass\n',
        'def other_profile():\n    """Load a 3gpp20Profile."""\n    pass\n',
        'def retain():\n    """Keep files for 3days."""\n    pass\n',
        'def render():\n    """Draw a 3-D scene."""\n    pass\n',
      ].join('\n'));
      await initSqlBackend();
      await refreshIndex(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        const result = await runNavigationTool('find_code', { query: 'HTTP2', limit: 8 }, { root, db, config });
        expect(result).toContain('negotiate (function)');
        expect(result).toContain('multiplex (function)');
        expect(result).toContain('transport (function)');
        expect(result).toContain('endpoint (function)');
        expect(result).not.toContain('different_version (function)');
        expect(result).not.toContain('retry (function)');
        expect(result).not.toContain('retry_twice (function)');
        expect(await runNavigationTool('find_code', { query: 'MP3' }, { root, db, config })).toContain('decode (function)');
        const auth = await runNavigationTool('find_code', { query: '2fa' }, { root, db, config });
        expect(auth).toContain('verify (function)');
        expect(auth.split('\n')[1]).toContain('authenticate (function)');
        const profiles = await runNavigationTool('find_code', { query: '3gpp2' }, { root, db, config });
        expect(profiles).toContain('profile (function)');
        expect(profiles).not.toContain('other_profile (function)');
        const geometry = await runNavigationTool('find_code', { query: '3d', limit: 1 }, { root, db, config });
        expect(geometry.split('\n')[1]).toContain('render (function)');
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('matches accented interior name fragments independent of case', async () => {
    const root = tempDir('gw-nav-accent-');
    try {
      writeFileSync(path.join(root, 'app.py'), 'def ladeÄnderung():\n    pass\n');
      await initSqlBackend();
      await refreshIndex(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        const ctx = { root, db, config };
        for (const query of ['Änder', 'änder']) {
          expect(await runNavigationTool('find_code', { query }, ctx)).toContain('ladeÄnderung (function)');
        }
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
