import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb, resetBackendForTests } from '../src/store/db.js';
import { canonicalDump } from '../src/selftest/dump.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { synthRepo } from '../src/selftest/synth.js';
import { searchSymbols } from '../src/index/query.js';

async function indexWith(forceSqlJs: boolean): Promise<string> {
  if (forceSqlJs) process.env.GW_FORCE_SQLJS = '1';
  else delete process.env.GW_FORCE_SQLJS;
  resetBackendForTests();
  await initSqlBackend();
  const dir = tempDir('gw-store-');
  try {
    synthRepo(dir, 600, 11);
    await refreshIndex(dir);
    const db = openDb(indexDbPath(dir), { readonly: true });
    try {
      expect(db.backend).toBe(forceSqlJs ? 'sql.js' : 'node:sqlite');
      expect(searchSymbols(db, 'Service0')[0]?.name).toBe('Service0');
      return canonicalDump(db).replace(new RegExp(path.basename(dir), 'g'), '');
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('storage backends', () => {
  afterEach(() => {
    delete process.env.GW_FORCE_SQLJS;
    resetBackendForTests();
  });

  it('sql.js fallback produces the same index as node:sqlite', async () => {
    expect(await indexWith(true)).toBe(await indexWith(false));
  });
});
