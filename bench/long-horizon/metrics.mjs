const { checkRepository } = await import(new URL('../../dist/reuse/check.js', import.meta.url));
const { defaultConfig } = await import(new URL('../../dist/config/load.js', import.meta.url));
const { changedFromGit, verifyChanged } = await import(new URL('../../dist/grounding/index.js', import.meta.url));
const { indexDbPath } = await import(new URL('../../dist/index/store.js', import.meta.url));
const { openDb } = await import(new URL('../../dist/store/db.js', import.meta.url));

const root = process.argv[2];
if (!root) throw new Error('Expected step worktree path');
// Fixed evaluator config: submitted patches cannot disable the measuring guards.
const config = defaultConfig();
const report = await checkRepository(root, { base: 'HEAD', config });
const duplicates = report.findings.filter((f) => ['duplicate', 'duplicate-constant', 'duplicate-file'].includes(f.kind));
const db = openDb(indexDbPath(root), { readonly: true });
let findings;
try {
  // This is the same verifyChanged/Grounder path used by MCP verify_calls,
  // restricted to lines in this step's patch, with previous steps in HEAD.
  const results = verifyChanged(db, root, changedFromGit(root, 'HEAD'), config);
  const unchecked = results.filter((r) => r.unchecked && /\.[cm]?[jt]sx?$/.test(r.file));
  if (unchecked.length) throw new Error(`Cannot measure grounding: ${JSON.stringify(unchecked)}`);
  findings = results.flatMap((r) => r.findings);
} finally { db.close(); }
const unresolved = findings.filter((f) => ['missing-module', 'unknown-export', 'unknown-member'].includes(f.kind));
const unique = (items, key) => new Set(items.map(key)).size;
process.stdout.write(JSON.stringify({
  duplicatesAdded: unique(duplicates, (f) => f.id),
  inventedCalls: unique(unresolved, (f) => `${f.file}:${f.line}:${f.kind}:${f.name}`),
}) + '\n');
