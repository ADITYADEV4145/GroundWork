import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defaultConfig } from '../src/config/load.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import type { ToolContext } from '../src/mcp/registry.js';
import { TOOLS } from '../src/mcp/tools/index.js';
import { tempDir, withIndexedFixture } from '../src/selftest/fixtures.js';
import { openDb } from '../src/store/db.js';
import { estimateTokens } from '../src/util/tokens.js';

function context(args: object, ctx: ToolContext) {
  const tool = TOOLS.find((t) => t.name === 'task_context')!;
  return tool.handler(z.object(tool.inputSchema).parse(args), ctx);
}

async function indexedTestSource(source: string, run: (ctx: ToolContext) => Promise<void>) {
  const root = tempDir('gw-task-context-');
  try {
    writeFileSync(path.join(root, 'options.ts'), source);
    const config = defaultConfig();
    await refreshIndex(root, { config });
    const db = openDb(indexDbPath(root), { readonly: true });
    try { await run({ db, root, config }); }
    finally { db.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('task_context', () => {
  it('keeps a later file-qualified hint ahead of five ambiguous matches', async () => {
    const choices = Array.from({ length: 5 }, (_, i) => `export class Choice${i} { pick() { return ${i}; } }`);
    await indexedTestSource([...choices, 'export function selected() { return 42; }',
      'export function invokeSelected() { return selected(); }'].join('\n'), async (ctx) => {
      const text = await context({ task: 'Update behavior', symbols: ['pick', 'options.ts:selected'] }, ctx);
      expect(text.split('\n')[0]).toContain('selected options.ts:6');
      expect(text).toContain('invokeSelected options.ts:7 (exact)');
    });
  });

  it('returns a ranked definition, its caller and existing helper without reading the whole file', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const ctx = { db, root, config: defaultConfig() };
      const text = await context({ task: 'Change joinParts', files: ['src/utils/date.ts'] }, ctx);
      expect(text.split('\n')[0]).toContain('joinParts');
      expect(text).toContain('joinParts(sep: string');
      expect(text).toContain('main src/main.ts:10 (import-resolved)');
      expect(text).toMatch(/Helper: pad .*used by joinParts/);
      expect(text).toMatch(/Body \[.*?\]:\nfunction joinParts/);
      expect(text).not.toContain('export {');
    });
  });

  it('honors the UTF-8 budget and does not serve changed source', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const ctx = { db, root, config: defaultConfig() };
      const args = { task: 'Change date formatting', symbols: ['src/utils/date.ts:formatDate'] };
      const short = await context({ ...args, budget_tokens: 128 }, ctx);
      expect(estimateTokens(short)).toBeLessThanOrEqual(128);
      expect(short).toContain('context shortened');
      writeFileSync(path.join(root, 'src/utils/date.ts'), 'export function formatDate() { return "changed"; }');
      const stale = await context(args, ctx);
      expect(stale).toContain('unavailable or changed after indexing');
      expect(stale).not.toContain('return "changed"');
      expect(() => context({ ...args, budget_tokens: 127 }, ctx)).toThrow();
    });
  });
});
