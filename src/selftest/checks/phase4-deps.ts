import { rmSync } from 'node:fs';
import { defaultConfig } from '../../config/load.js';
import { verifyChangedDeep } from '../../grounding/index.js';
import { refreshIndex } from '../../index/refresh.js';
import { indexDbPath } from '../../index/store.js';
import { initSqlBackend, openDb } from '../../store/db.js';
import { DEPS_FIXTURE_FILES, depsFixtureExpected, writeDepsFixture } from '../deps-fixture.js';
import { tempDir } from '../fixtures.js';
import type { Check } from '../registry.js';

// Grounding beyond the repo: every planted dependency, workspace and contract mistake is flagged, nothing else
// is, and only definite mistakes block.
export const PHASE4_DEPS_CHECKS: Check[] = [
  {
    phase: 4,
    name: 'dependency, workspace and contract mistakes are flagged; valid and unknowable calls are not',
    async run() {
      const dir = tempDir('gw-deps-');
      try {
        writeDepsFixture(dir);
        await initSqlBackend();
        await refreshIndex(dir);
        const db = openDb(indexDbPath(dir), { readonly: true });
        try {
          const results = await verifyChangedDeep(db, dir, DEPS_FIXTURE_FILES.map((file) => ({ file, ranges: null })), defaultConfig());
          const findings = results.flatMap((r) => r.findings);
          const got = [...new Set(findings.map((f) => `${f.file}:${f.line}:${f.kind}`))].sort();
          const want = depsFixtureExpected();
          const missed = want.filter((w) => !got.includes(w));
          const extra = got.filter((g) => !want.includes(g));
          const softBlocks = findings.filter((f) => f.blocking && (f.kind === 'contract' || f.kind === 'deprecated')).length;
          const ok = !missed.length && !extra.length && !softBlocks;
          return {
            ok,
            detail: ok ? `${want.length} planted, ${got.length} flagged, 0 extra` : `missed ${missed.join(', ') || 'none'}; extra ${extra.join(', ') || 'none'}; ${softBlocks} warning-only findings block`,
            metrics: { planted: want.length, flagged: got.length, extra: extra.length },
          };
        } finally {
          db.close();
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];
