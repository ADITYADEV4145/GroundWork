import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const definitions = {
  'gw-01': ['src/index/refresh.ts:refreshIndex'],
  'gw-02': ['src/store/schema.ts:ensureSchema', 'src/index/store.ts:openIndex'],
  'gw-03': ['src/lang/parser.ts:languageForPath'],
  'gw-04': ['src/mcp/server.ts:startMcpServer', 'src/index/refresh.ts:refreshIndex'],
  'gw-05': ['src/util/tokens.ts:fitToBudget'],
  'gw-06': ['src/util/paths.ts:findRepoRoot', 'src/hooks/run.ts:runHook'],
  'gw-07': ['src/hooks/handlers/read_guard.ts:readGuard'],
  'gw-08': ['src/store/db.ts:openDb'],
  'gw-09': ['src/setup/apply.ts:applySetup', 'src/setup/apply.ts:planSetup'],
  'gw-10': ['src/util/zod.ts:formatZodError'],
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

const tsChecks = {
  'edit-01': String.raw`const { slug } = require('./src/utils/text.ts');
    assert.equal(slug('  BIG  New\tDay  '), 'big-new-day');
    assert.equal(slug(''), '');
    assert.equal(slug('a\nb'), 'a-b');`,
  'edit-03': `const { joinParts } = require('./src/utils/date.ts');
    assert.equal(joinParts(':', 'phase', '2', '0', '12'), 'phase:02:00:12');
    assert.equal(joinParts('-', '1', '2'), '01-02');
    assert.equal(joinParts('+', 'v2'), 'v2');`,
  'edit-05': `const { ApiClient } = require('./src/services/api.ts');
    let options;
    globalThis.fetch = async (url, opts) => {
      options = opts;
      if (opts.signal) {
        assert.ok(opts.signal instanceof AbortSignal);
        assert.equal(opts.signal.aborted, false);
        await new Promise((resolve) => setTimeout(resolve, 75));
        assert.equal(opts.signal.aborted, true);
      }
      return new Response('ok');
    };
    assert.equal(await new ApiClient('https://example.test', 15).get('/x'), 'ok');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.cfg, 'services.api.timeout');
    assert.equal(await new ApiClient('https://example.test').get('/x'), 'ok');
    assert.equal(options.signal, undefined);
    `,
};

const pythonChecks = {
  'edit-02': `import sys
from app.cli import main
assert main(["List Name"]).name == "List Name"
assert main("String Name").name == "String Name"
sys.argv = ["cli", "Default Name"]
assert main().name == "Default Name"`,
  'edit-04': `from app.models import Invoice
from app.services.billing import charge
assert Invoice("c", [12.0, 8.0], "EUR").total() == 20.0
inv = Invoice("c", [12.0, 8.0], discount=5.0)
assert inv.total() == 15.0
assert abs(charge(inv) - 18.0) < 1e-10`,
  'edit-06': `import asyncio
import os
from app.services.tax import fetch_rates
assert asyncio.run(fetch_rates("us", "eu")) == [0.2, 0.2]
assert asyncio.run(fetch_rates("us", "eu", default=0.35)) == [0.35, 0.35]
os.environ["TAX_RATE"] = "0.11"
assert asyncio.run(fetch_rates("us", "eu", default=0.35)) == [0.11, 0.11]`,
};

export async function grade(task, observation, { withWorkspace }) {
  if (Object.hasOwn(definitions, task.id)) {
    return isDeepStrictEqual([...definitions[task.id]].sort(), [...(observation.answer ?? [])].sort());
  }
  const js = tsChecks[task.id];
  const py = pythonChecks[task.id];
  if (!js && !py) throw new Error('Missing navigation benchmark oracle for ' + task.id);
  if (!observation.patch) return false;
  return withWorkspace((cwd) => {
    const env = { PATH: process.env.PATH, LANG: 'C.UTF-8' };
    const check = js ? spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module',
      '-e', 'import assert from "node:assert/strict"; import { createRequire } from "node:module"; const require = createRequire(import.meta.url);\n' + js], { cwd, env, timeout: 10_000 }) :
      spawnSync('python3', ['-BE', '-c', py], { cwd, env, timeout: 10_000 });
    if (check.error && check.error.code !== 'ETIMEDOUT') throw check.error;
    return check.status === 0;
  });
}
