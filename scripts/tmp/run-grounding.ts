import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { refreshIndex } from '../../src/index/refresh.js';
import { indexDbPath } from '../../src/index/store.js';
import { initSqlBackend, openDb } from '../../src/store/db.js';
import { Grounder } from '../../src/grounding/verify.js';
import { tempDir } from '../../src/selftest/fixtures.js';
await initSqlBackend();
for (const src of process.argv.slice(2)) {
  const dir = tempDir('gwg-');
  cpSync(src, dir, { recursive: true, filter: (p) => !/node_modules|\.git$|\.groundwork|dist/.test(p) });
  await refreshIndex(dir);
  const db = openDb(indexDbPath(dir), { readonly: true });
  const files = db.prepare('SELECT path FROM files').all().map((r) => String(r.path));
  const g = new Grounder(db, dir);
  let n = 0;
  const t = Date.now();
  for (const f of files) for (const x of g.verify(f).findings) { n++; console.log(`${x.file}:${x.line} ${x.kind} ${x.blocking ? 'B' : 'w'} ${x.message}`); }
  console.log(`${src}: ${files.length} files, ${n} findings, ${Date.now() - t}ms`);
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
