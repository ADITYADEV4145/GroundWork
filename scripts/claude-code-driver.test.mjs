import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { billedTokens, parseAnswer, parseResult, reduction, report, runSession } from '../bench/claude-code/driver.mjs';

test('reads the last JSON string array from a reply', () => {
  assert.deepEqual(parseAnswer('See [1] and [x].\n["src/a.ts:f", "src/b.ts:C.m"]'), ['src/a.ts:f', 'src/b.ts:C.m']);
  assert.deepEqual(parseAnswer('first ["a:b"] then\n["c:d"]\n'), ['c:d']);
  assert.equal(parseAnswer('no answer [1, 2]'), null);
});

test('takes billed usage only from the provider result', () => {
  const ok = parseResult(JSON.stringify({ result: 'hi', num_turns: 3, total_cost_usd: 0.5,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 } }));
  assert.equal(billedTokens(ok.usage), 135);
  assert.equal(ok.usage.costUsd, 0.5);
  assert.equal(parseResult('not json').usage, null);
  assert.equal(parseResult(JSON.stringify({ result: 'x', usage: { input_tokens: 1 } })).usage, null);
});

test('bootstrap reduction is deterministic and signed', () => {
  const a = reduction([100, 110, 90, 105], [50, 55, 45, 52]);
  assert.deepEqual(a, reduction([100, 110, 90, 105], [50, 55, 45, 52]));
  assert.ok(a.ci9875[0] > 0 && a.reductionPct > 45 && a.reductionPct < 55);
  assert.ok(reduction([50, 55], [100, 110]).ci9875[1] < 0);
  assert.equal(reduction([], [1]), null);
});

test('a session records usage, answers and failures, resumes, and reports as exploratory', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gw-cc-driver-'));
  try {
    const fake = path.join(dir, 'claude.mjs'), calls = path.join(dir, 'calls');
    writeFileSync(fake, `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('fake 1.0'); process.exit(0); }
appendFileSync(${JSON.stringify(calls)}, 'x');
const prompt = args[args.indexOf('-p') + 1];
if (prompt.startsWith('Which function performs the incremental index refresh')) {
  console.log(JSON.stringify({ result: 'It is this.\\n["src/index/refresh.ts:refreshIndex"]', num_turns: 2, total_cost_usd: 0.01, usage: { input_tokens: 7, output_tokens: 3 } }));
} else if (readFileSync(${JSON.stringify(calls)}, 'utf8').length === 2) console.log('garbage');
else console.log(JSON.stringify({ result: 'done', usage: { input_tokens: 7, output_tokens: 3 } }));
`);
    chmodSync(fake, 0o755);
    const options = { suite: 'nav', arm: 'baseline', run: 1, model: 'test-model', out: path.join(dir, 'out'), claude: [process.execPath, fake] };
    const session = runSession(options);
    const first = JSON.parse(readFileSync(path.join(session, 'gw-01.json'), 'utf8'));
    assert.deepEqual(first.answer, ['src/index/refresh.ts:refreshIndex']);
    assert.deepEqual(first.invalid, []);
    assert.equal(first.usage.inputTokens, 7);
    const second = JSON.parse(readFileSync(path.join(session, 'gw-02.json'), 'utf8'));
    assert.deepEqual(second.invalid, ['Claude Code reported no billed usage']);
    const before = readFileSync(calls, 'utf8').length;
    assert.equal(before, 30);
    runSession(options);
    assert.equal(readFileSync(calls, 'utf8').length, before);
    assert.throws(() => runSession({ ...options, model: 'other' }), /different model/);
    assert.throws(() => runSession({ ...options, run: 17 }), /Run must be/);

    const nav = (await report(path.join(dir, 'out'))).suites.nav;
    assert.equal(nav.confirmatory, false);
    assert.equal(nav.verdict, 'exploratory: no verdict');
    assert.equal(nav.successByCategory.locate.baseline >= 1, true);
    assert.ok(nav.problems.some((p) => p.includes('1 invalid task record')));
    assert.ok(nav.problems.some((p) => p.includes('needs exactly 1 to 16')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
