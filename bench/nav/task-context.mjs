import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { defaultConfig } from '../../src/config/load.ts';
import { navigationSymbols } from '../../src/index/navigation.ts';
import { indexedSource } from '../../src/mcp/symbol-source.ts';
import { taskContextTool } from '../../src/mcp/tools/task_context.ts';
import { runNavigationTool } from '../../src/selftest/checks/phase2.ts';
import { withIndexedFixture } from '../../src/selftest/fixtures.ts';
import { estimateTokens } from '../../src/util/tokens.ts';

const { tasks } = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url), 'utf8'));
const definitions = {
  'ts-01': ['src/utils/date.ts:formatDate'],
  'ts-02': ['src/main.ts:main', 'src/services/api.ts:ApiClient.get', 'src/services/api.ts:ApiClient.request'],
  'ts-03': ['src/components/Button.tsx:Button', 'src/utils/text.ts:slug'],
  'ts-04': ['src/utils/date.ts:joinParts'],
  'ts-05': ['src/legacy.js:legacyPath', 'src/utils/text.ts:slug'],
  'ts-06': ['src/services/api.ts:API_URL'],
  'ts-07': ['src/main.ts:main', 'src/utils/date.ts:pad'],
  'py-01': ['app/models.py:Invoice.total'],
  'py-02': ['app/cli.py:main', 'app/services/billing.py:charge', 'app/services/tax.py:rate'],
  'py-03': ['app/services/tax.py:fetch_rates'],
  'py-04': ['app/models.py:Customer.display'],
  'py-05': ['tests/test_billing.py:test_charge', 'app/services/billing.py:charge'],
  'py-06': ['app/services/tax.py:TAX_RATE_ENV'],
  'py-07': ['app/cli.py:main', 'app/models.py:Customer.parse'],
};
const functions = new Set(['function', 'method', 'component']);
const totals = { baseline: { calls: 0, tokens: 0, oneCall: 0 }, context: { calls: 0, tokens: 0, oneCall: 0 } };
let count = 0;
console.log('task   baseline calls/tokens  task_context calls/tokens');
for (const fixture of ['ts-app', 'py-app']) {
  await withIndexedFixture(fixture, async (db, root) => {
    const ctx = { db, root, config: defaultConfig() };
    for (const { id, prompt, category } of tasks.filter((t) => t.repo === fixture && definitions[t.id])) {
      const targets = definitions[id].map((ref) => {
        const [s] = navigationSymbols(db, ref);
        assert(s, ref);
        const indexed = indexedSource(ctx, s);
        assert(indexed, ref);
        return { id: s.id, body: functions.has(s.kind) ? indexed.source.slice(indexed.start, indexed.end) : null };
      });
      const baseline = category === 'trace'
        ? await runNavigationTool('explore', { query: prompt }, ctx)
        : await runNavigationTool('find_code', { query: prompt, include_body: true }, ctx);
      const context = await taskContextTool.handler(z.object(taskContextTool.inputSchema).parse({ task: prompt }), ctx);
      const scores = [];
      for (const [arm, first] of Object.entries({ baseline, context })) {
        const missing = targets.filter((s) => !first.includes(`[${s.id}]`) || (s.body !== null && !first.includes(s.body)));
        const replies = [first];
        if (missing.length) {
          replies.push(await runNavigationTool('read_symbol', { symbols: missing.map((s) => s.id) }, ctx));
          for (const s of missing) assert(replies[1].includes(`[${s.id}]`) && (s.body === null || replies[1].includes(s.body)), `Incomplete replay for ${id}`);
        }
        const calls = replies.length, tokens = replies.reduce((n, reply) => n + estimateTokens(reply), 0);
        totals[arm].calls += calls;
        totals[arm].tokens += tokens;
        totals[arm].oneCall += Number(calls === 1);
        scores.push(`${calls}/${tokens}`);
      }
      console.log(id, scores[0].padStart(11), scores[1].padStart(23));
      count++;
    }
  });
}
for (const [arm, { calls, tokens, oneCall }] of Object.entries(totals)) {
  console.log(`${arm}: ${calls}/${count} calls (${(calls / count).toFixed(2)}/task); ${tokens} output tokens (bytes/4); ${oneCall}/${count} one-call tasks`);
}
