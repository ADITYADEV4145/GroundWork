import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpackWorkspace, applyPatch, git } from '../workspace.mjs';
import { grade } from './grade.mjs';
import { good } from './validation/good.mjs';

const source = fileURLToPath(new URL('../../', import.meta.url));
const { revision, tasks } = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url), 'utf8'));
const temp = mkdtempSync(path.join(os.tmpdir(), 'gw-long-horizon-validation-'));
let serial = 0;
const fresh = () => {
  const root = path.join(temp, String(++serial));
  unpackWorkspace(source, revision, 'long-horizon-events', root);
  return root;
};
const patches = [];
function patchFor(step, kind) {
  const root = fresh();
  for (let i = 0; i < step - 1; i++) applyPatch(root, patches[i], `lh-${i + 1}`);
  const [name, code] = good[step - 1];
  mkdirSync(path.join(root, 'src/features'), { recursive: true });
  let content = code;
  if (kind === 'broken') content = `export function ${step === 1 ? 'createEventCard' : 'buildInvitation'}() { return {}; }\n`;
  if (kind === 'flawed') {
    const helper = step === 1 ? readFileSync(path.join(root, 'src/lib/text.js'), 'utf8').split('\n\n')[0].replace('export function slugify', 'function copiedSlugify') :
      readFileSync(path.join(root, 'src/lib/validation.js'), 'utf8').split('\n\n')[0].replace('export function normalizeEmail', 'function copiedNormalizeEmail');
    content += `\n${helper}\n`;
    content = step === 1 ? content.replace('id: slugify(title)', 'id: copiedSlugify(title)') : content.replace('to: normalizeEmail(guest.email)', 'to: copiedNormalizeEmail(guest.email)');
    // Valid import of a known module; a call to a nonexistent member survives until the verifier.
    content += `\nimport * as dates from '../lib/date.js';\nexport function unusedPreview(value) { return dates.formatImaginaryDate(value); }\n`;
  }
  writeFileSync(path.join(root, `src/features/${name}.js`), content);
  git(root, 'add', '-N', '.');
  return git(root, 'diff', 'HEAD', '--', '.', ':(exclude).groundwork/**');
}
async function evaluate(step, patch) {
  return grade(tasks[step - 1], { patch }, { async withWorkspace(run) {
    const root = fresh();
    for (let i = 0; i < step - 1; i++) applyPatch(root, patches[i], `lh-${i + 1}`);
    applyPatch(root, patch);
    return run(root);
  } });
}
try {
  assert.equal(tasks.length, 10);
  assert.deepEqual(tasks.map((t) => t.step), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(new Set(tasks.map((t) => t.repo)).size, 1);
  assert.equal(new Set(tasks.map((t) => t.sequence)).size, 1);
  for (let step = 1; step <= 10; step++) {
    const patch = patchFor(step, 'good');
    const result = await evaluate(step, patch);
    assert.equal(result.success, true, `good step ${step}`);
    assert.equal(result.metrics.inventedCalls, 0, `good step ${step} grounding`);
    console.log(`PASS step ${step} reference: ${JSON.stringify(result)}`);
    if (step <= 2) {
      assert.equal(result.metrics.duplicatesAdded, 0, `good step ${step} duplication`);
      const flawed = await evaluate(step, patchFor(step, 'flawed'));
      assert.equal(flawed.success, true, 'flawed patch still satisfies feature acceptance');
      assert.ok(flawed.metrics.duplicatesAdded > 0, 'real duplicate scorer catches copied helper');
      assert.ok(flawed.metrics.inventedCalls > 0, 'real grounding verifier catches invented member');
      console.log(`PASS step ${step} duplicate + invented member: ${JSON.stringify(flawed)}`);
      const broken = await evaluate(step, patchFor(step, 'broken'));
      assert.equal(broken.success, false);
      console.log(`PASS step ${step} broken acceptance rejected: ${JSON.stringify(broken)}`);
    }
    patches.push(patch);
  }
  assert.equal(await grade(tasks[0], { patch: '' }, { withWorkspace() { throw new Error('must not run'); } }), false);
  console.log('PASS empty patch rejected; all 10 sequential acceptance contracts validated');
} finally { rmSync(temp, { recursive: true, force: true }); }
