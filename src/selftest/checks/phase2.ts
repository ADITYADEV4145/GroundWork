import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { defaultConfig } from '../../config/load.js';
import { dispatch, normalise } from '../../hooks/run.js';
import { NAVIGATION_BUDGETS, NAVIGATION_TOOLS } from '../../mcp/tools/navigation.js';
import type { ToolContext } from '../../mcp/registry.js';
import { estimateTokens } from '../../util/tokens.js';
import { tempDir, withIndexedFixture } from '../fixtures.js';
import type { Check } from '../registry.js';

export async function runNavigationTool(name: keyof typeof NAVIGATION_BUDGETS, args: object, ctx: ToolContext): Promise<string> {
  const tool = NAVIGATION_TOOLS.find((t) => t.name === name)!;
  const result = await tool.handler(z.object(tool.inputSchema).parse(args), ctx);
  if (estimateTokens(result) > NAVIGATION_BUDGETS[name]) throw new Error(`${name} exceeded its token budget`);
  return result;
}

export const FIXTURE_NAVIGATION = [
  ['find_code', { query: 'format date', kind: 'function' }, 'formatDate'],
  ['outline', { file: 'src/utils/date.ts' }, 'joinParts'],
  ['read_symbol', { symbol: 'ApiClient.get' }, "this.request('GET'"],
  ['callers', { symbol: 'formatDate' }, 'src/main.ts:10 main [import-resolved]'],
  ['callees', { symbol: 'ApiClient.request' }, 'fetch [unresolved]'],
  ['where_used', { name: 'formatDate' }, 'call formatDate [import-resolved]'],
  ['repo_map', { path: 'src/services' }, 'src/services/api.ts — ApiClient'],
] as const;

export const PHASE2_CHECKS: Check[] = [
  {
    phase: 2,
    name: 'navigation: fixture answers and token budgets',
    async run() {
      return withIndexedFixture('ts-app', async (db, root) => {
        const ctx = { root, db, config: defaultConfig() };
        for (const [name, args, expected] of FIXTURE_NAVIGATION) {
          const result = await runNavigationTool(name, args, ctx);
          if (!result.includes(expected)) return { ok: false, detail: `${name} missing ${expected}: ${result}` };
        }
        const short = await runNavigationTool('find_code', { query: 'src', limit: 1 }, ctx);
        if (!short.includes('Next: find_code(')) return { ok: false, detail: 'find_code did not give a continuation' };
        return { ok: true, detail: '7/7 fixture answers within budget; truncation returns a continuation' };
      });
    },
  },
  {
    phase: 2,
    name: 'read guard: repeat, force, edit, compact and large read',
    async run() {
      const root = tempDir('gw-read-guard-');
      try {
        const file = path.join(root, 'sample.ts');
        const event = (type: 'pre_tool' | 'post_tool' | 'pre_compact', offset?: number, limit?: number) => {
          const first = offset ?? 1;
          const lines = readFileSync(file, 'utf8').trimEnd().split('\n').slice(first - 1, limit ? first - 1 + limit : undefined);
          return dispatch(normalise('claude', type, {
            cwd: root, session_id: 'phase2-selftest', tool_name: 'Read',
            tool_input: { file_path: file, offset, limit },
            tool_response: { type: 'text', file: { filePath: file, startLine: first, numLines: lines.length, content: lines.join('\n') } },
          }), root);
        };
        writeFileSync(file, 'const x = 1;\n'.repeat(401));
        const first = await event('pre_tool', 1, 20);
        await event('post_tool', 1, 20);
        const repeat = await event('pre_tool', 1, 20);
        const forced = await event('pre_tool', 1, 20);
        writeFileSync(file, 'const y = 1;\n'.repeat(401));
        const changed = await event('pre_tool', 1, 20);
        await event('post_tool', 1, 20);
        await event('pre_compact');
        const after = await event('pre_tool', 1, 20);
        const large = await event('pre_tool');
        const observed = [first, repeat, forced, changed, after, large].map((r) => r.action).join(', ');
        return { ok: observed === 'allow, deny, allow, allow, allow, context', detail: observed };
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
];
