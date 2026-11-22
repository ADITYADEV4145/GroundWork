# V2 JavaScript oracle evidence — three confirmed omissions, one counterexample

**This is targeted evidence for the published v2 FAIL, not a new benchmark run or rescore.**
V1 and v2 results.json and RESULTS.md remain unchanged. No v3 was preregistered or
run: the condition that all four precision misses arise from omitted JS checking
does **not** hold. The six separately committed review fixes do not change these
frozen v2 predictions; no impact calls were rerun to obtain them.

## Frozen inputs and scope

- V2 checker: `593bfe8f181380db8a4912f72a0a26c9b6ad5cdb`.
- Source anchor: `4507e279fa853f6676b15f590808f088be949eae`.
- Manifest SHA256: `f9e3c01a16728d368515be6ae600efb453dd66c94ffb75eeee2036e5679bdd85`.
- Node v24.22.2, TypeScript 5.9.3, existing project development dependencies; no downloads.
- Target workspace: `/home/ubuntu/work/gw-impact-gate-n67uKU/customer-desk-target`, the restored frozen
  customer-desk workspace from the single v2 run, including the reference workflow.
- Each mutation starts from the original src/users.ts and is restored in finally.
  No published result is modified.

## Where the JS oracle is excluded

At v2 checker commit 593bfe8, `scripts/bench-impact.ts:145` selects the workspace files:

```ts
const files = git(target, 'ls-files').split('\n').filter((f) => repo === 'dispatch-desk' ? f.endsWith('.py') : /\.tsx?$/.test(f));
```

This excludes .js/.mjs/.cjs. The TS program has a second TS-only filter at
`scripts/bench-impact.ts:51`:

```ts
const program = ts.createProgram(files.filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(root, f)), parsed?.options ?? { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true });
```

The customer-desk tsconfig also does not enable allowJs/checkJs. The same filtered
file list is passed to the independent affectedTests oracle at line 163.
Ground-truth caller files exclude diagnostics inside the edited file at line 162.
That last exclusion is important for the return-shape counterexample below.

The real JavaScript test is tracked in both the v1 and v2 anchors:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUserByEmail, getUserById } from '../src/users.ts';
import { TicketStore } from '../src/tickets.ts';
test('customer lookup and ticket ownership', () => {
  const users = [{ id: 'u1', name: 'Ada', email: 'Ada@example.test', plan: 'free' }];
  assert.equal(getUserByEmail(users, ' ADA@example.test ').id, 'u1');
  assert.equal(getUserById(users, 'Ada@example.test'), null);
  assert.deepEqual(new TicketStore([{id:'t1',userId:'u1',state:'closed'}]).listOpenForUser('u1'), []);
});
```

## Per-task outcome

| Frozen v2 task | Predicted caller | New diagnostic after JS checking | Runtime test exit | Verdict |
| --- | --- | --- | ---: | --- |
| customer-desk/required-param | test/services.test.mjs:8, import-resolved | TS2554 at test/services.test.mjs:8 | 1 | JS omission confirmed |
| customer-desk/rename | test/services.test.mjs:8, name-only | TS2305 at test/services.test.mjs:3 | 1 | JS omission confirmed |
| customer-desk/delete | test/services.test.mjs:8, name-only | TS2305 at test/services.test.mjs:3 | 1 | JS omission confirmed |
| customer-desk/return-shape | test/services.test.mjs:8, import-resolved | TS2322 only in edited src/users.ts:6; no new external caller diagnostic | 0 | Claim disproven for this task |

The first three are not invented callers: broadening only the oracle finds new
errors in the predicted JS file, and the actual test fails from a passing baseline.
For return-shape, only a declared return annotation changes. The unchanged
implementation and null-returning test invocation behave the same; the runtime
test passes and JS checking yields no new external caller error. A compilation
failure solely inside the edited target does not meet the preregistered external
caller-file rule. We therefore cannot attribute **all four** misses to JS exclusion.

## Original predictions (raw JSON from the published result)

```json
[
  {
    "task": "customer-desk/required-param",
    "expectedCallers": [],
    "highRisk": true,
    "callers": [
      {
        "file": "test/services.test.mjs",
        "line": 8,
        "symbol": "<module>",
        "depth": 1,
        "confidence": "import-resolved",
        "changedFile": false,
        "lookedAt": false
      }
    ]
  },
  {
    "task": "customer-desk/rename",
    "expectedCallers": [],
    "highRisk": true,
    "callers": [
      {
        "file": "test/services.test.mjs",
        "line": 8,
        "symbol": "<module>",
        "depth": 1,
        "confidence": "name-only",
        "changedFile": false,
        "lookedAt": false
      }
    ]
  },
  {
    "task": "customer-desk/delete",
    "expectedCallers": [],
    "highRisk": true,
    "callers": [
      {
        "file": "test/services.test.mjs",
        "line": 8,
        "symbol": "<module>",
        "depth": 1,
        "confidence": "name-only",
        "changedFile": false,
        "lookedAt": false
      }
    ]
  },
  {
    "task": "customer-desk/return-shape",
    "expectedCallers": [],
    "highRisk": true,
    "callers": [
      {
        "file": "test/services.test.mjs",
        "line": 8,
        "symbol": "<module>",
        "depth": 1,
        "confidence": "import-resolved",
        "changedFile": false,
        "lookedAt": false
      }
    ]
  }
]
```

## Reproduction procedure

Use the restored frozen workspace above (or materialize customer-desk from anchor
4507e27, apply the registered reference workflow, and link the same node_modules).
Read the four customer-desk tasks from tasks-v2.json. Save original src/users.ts;
for each task, replace its single before-text occurrence with after-text, then
restore the original in finally.

For the compiler demonstration, use TypeScript createProgram with all tracked
files matching `/\.(tsx?|[cm]?js)$/`, project tsconfig options, and these overrides:

```ts
const options = {
  ...ts.parseJsonConfigFileContent(config.config, ts.sys, root).options,
  allowJs: true, checkJs: true, noEmit: true,
};
const program = ts.createProgram(files.map(f => path.join(root, f)), options);
const errors = ts.getPreEmitDiagnostics(program)
  .filter(d => d.file && d.category === ts.DiagnosticCategory.Error
    && d.file.fileName.startsWith(root))
  .map(d => ({
    file: path.relative(root, d.file.fileName),
    line: d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1,
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  }));
```

Baseline diagnostics are printed and retained. Node built-in declaration errors
and the existing possible-null finding also occur before mutation and are **not**
new evidence against any task. Compare normalized file/code/message, ignoring
line, just as the registered oracle does. The raw arrays below make that comparison
explicit and avoid treating a baseline compiler failure as mutation evidence.

For runtime, execute this separately from the same baseline and after each edit:

```sh
node --import tsx --test test/services.test.mjs
```

## Raw compiler outputs (baseline, then each independent mutation)

```text
BASELINE [{"file":"test/services.test.mjs","line":1,"code":2307,"message":"Cannot find module 'node:test' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":2,"code":2307,"message":"Cannot find module 'node:assert/strict' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":7,"code":2531,"message":"Object is possibly 'null'."}]
customer-desk/required-param [{"file":"test/services.test.mjs","line":1,"code":2307,"message":"Cannot find module 'node:test' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":2,"code":2307,"message":"Cannot find module 'node:assert/strict' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":7,"code":2531,"message":"Object is possibly 'null'."},{"file":"test/services.test.mjs","line":8,"code":2554,"message":"Expected 3 arguments, but got 2."}]
customer-desk/rename [{"file":"test/services.test.mjs","line":1,"code":2307,"message":"Cannot find module 'node:test' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":2,"code":2307,"message":"Cannot find module 'node:assert/strict' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":3,"code":2305,"message":"Module '\"../src/users.ts\"' has no exported member 'getUserById'."},{"file":"test/services.test.mjs","line":7,"code":2531,"message":"Object is possibly 'null'."}]
customer-desk/delete [{"file":"test/services.test.mjs","line":1,"code":2307,"message":"Cannot find module 'node:test' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":2,"code":2307,"message":"Cannot find module 'node:assert/strict' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":3,"code":2305,"message":"Module '\"../src/users.ts\"' has no exported member 'getUserById'."},{"file":"test/services.test.mjs","line":7,"code":2531,"message":"Object is possibly 'null'."}]
customer-desk/return-shape [{"file":"src/users.ts","line":6,"code":2322,"message":"Type 'User | null' is not assignable to type '{ id: number; } | null'.   Type 'User' is not assignable to type '{ id: number; }'.     Types of property 'id' are incompatible.       Type 'string' is not assignable to type 'number'."},{"file":"test/services.test.mjs","line":1,"code":2307,"message":"Cannot find module 'node:test' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":2,"code":2307,"message":"Cannot find module 'node:assert/strict' or its corresponding type declarations."},{"file":"test/services.test.mjs","line":7,"code":2531,"message":"Object is possibly 'null'."}]
```

## Raw runtime outputs

```text
=== baseline ===
command: node --import tsx --test test/services.test.mjs
exit: 0
✔ customer lookup and ticket ownership (1.22653ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 174.539258

=== customer-desk/required-param ===
command: node --import tsx --test test/services.test.mjs
exit: 1
✖ customer lookup and ticket ownership (0.663117ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 168.951466

✖ failing tests:

test at test/services.test.mjs:5:1
✖ customer lookup and ticket ownership (0.663117ms)
  TypeError [Error]: users.find is not a function
      at getUserById (/home/ubuntu/work/gw-impact-gate-n67uKU/customer-desk-target/src/users.ts:6:16)
      at TestContext.<anonymous> (file:///home/ubuntu/work/gw-impact-gate-n67uKU/customer-desk-target/test/services.test.mjs:8:16)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17)

=== customer-desk/rename ===
command: node --import tsx --test test/services.test.mjs
exit: 1
file:///home/ubuntu/work/gw-impact-gate-n67uKU/customer-desk-target/test/services.test.mjs:3
import { getUserByEmail, getUserById } from '../src/users.ts';
                         ^^^^^^^^^^^
SyntaxError: The requested module '../src/users.ts' does not provide an export named 'getUserById'
    at #asyncInstantiate (node:internal/modules/esm/module_job:455:21)
    at async ModuleJob.run (node:internal/modules/esm/module_job:553:5)
    at async node:internal/modules/esm/loader:647:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.22.2
✖ test/services.test.mjs (136.589372ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 143.224

✖ failing tests:

test at test/services.test.mjs:1:1
✖ test/services.test.mjs (136.589372ms)
  'test failed'

=== customer-desk/delete ===
command: node --import tsx --test test/services.test.mjs
exit: 1
file:///home/ubuntu/work/gw-impact-gate-n67uKU/customer-desk-target/test/services.test.mjs:3
import { getUserByEmail, getUserById } from '../src/users.ts';
                         ^^^^^^^^^^^
SyntaxError: The requested module '../src/users.ts' does not provide an export named 'getUserById'
    at #asyncInstantiate (node:internal/modules/esm/module_job:455:21)
    at async ModuleJob.run (node:internal/modules/esm/module_job:553:5)
    at async node:internal/modules/esm/loader:647:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.22.2
✖ test/services.test.mjs (119.8128ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 126.240678

✖ failing tests:

test at test/services.test.mjs:1:1
✖ test/services.test.mjs (119.8128ms)
  'test failed'

=== customer-desk/return-shape ===
command: node --import tsx --test test/services.test.mjs
exit: 0
✔ customer lookup and ticket ownership (0.943967ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 138.834429
```

## Decision

The evidence supports the omitted-JS explanation for **three**, not four, tasks.
Per the conditional instruction, stop before v3 and report this counterexample.
No new seed, preregistration, oracle policy change, checker tuning or v3 run has
been performed. A future v3 needs an explicit decision on the oracle/scoring rule;
this evidence must not be presented as a v2 pass.
