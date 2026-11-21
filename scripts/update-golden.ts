// Regenerate fixtures/*/expected.json from the current extractor. Review the diff before committing.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { FIXTURES, FIXTURES_DIR, goldenSnapshot, withIndexedFixture } from '../src/selftest/fixtures.js';

for (const name of FIXTURES) {
  const snap = await withIndexedFixture(name, (db) => goldenSnapshot(db));
  writeFileSync(path.join(FIXTURES_DIR, name, 'expected.json'), JSON.stringify(snap, null, 2) + '\n');
  console.log(`${name}: ${snap.symbols.length} symbols, ${snap.imports.length} imports, ${snap.calls.length} calls, ${snap.literals.length} literals`);
}
