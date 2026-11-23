import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defaultConfig } from '../src/config/load.js';
import type { ToolContext } from '../src/mcp/registry.js';
import { TOOLS } from '../src/mcp/tools/index.js';
import { withIndexedFixture } from '../src/selftest/fixtures.js';
import { estimateTokens } from '../src/util/tokens.js';

function context(args: object, ctx: ToolContext) {
  const tool = TOOLS.find((t) => t.name === 'task_context')!;
  return tool.handler(z.object(tool.inputSchema).parse(args), ctx);
}

describe('task_context', () => {
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
