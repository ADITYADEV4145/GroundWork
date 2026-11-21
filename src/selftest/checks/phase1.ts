import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runDoctor } from '../../cli/commands/doctor.js';
import { refreshIndex } from '../../index/refresh.js';
import { indexStats } from '../../index/query.js';
import { initSqlBackend } from '../../store/db.js';
import { diffSnapshots, expectedSnapshot, FIXTURES, goldenSnapshot, tempDir, withIndexedFixture } from '../fixtures.js';
import { incrementalMatchesFull } from '../incremental.js';
import type { Check } from '../registry.js';
import { prng, synthRepo } from '../synth.js';


const golden: Check[] = FIXTURES.map((name) => ({
  phase: 1,
  name: `extraction golden: ${name}`,
  async run() {
    const diff = await withIndexedFixture(name, (db) => diffSnapshots(expectedSnapshot(name), goldenSnapshot(db)));
    return { ok: diff.length === 0, detail: diff.length ? `${diff.length} differences:\n${diff.slice(0, 15).join('\n')}` : 'matches expected.json' };
  },
}));

const resolution: Check = {
  phase: 1,
  name: 'import resolution >= 95% on fixtures',
  async run() {
    let internal = 0;
    let resolved = 0;
    for (const name of FIXTURES)
      await withIndexedFixture(name, (db) => {
        const s = indexStats(db);
        internal += s.importsInternal;
        resolved += s.importsResolved;
      });
    const pct = internal ? (100 * resolved) / internal : 100;
    return { ok: pct >= 95, detail: `${resolved}/${internal} internal imports resolved (${pct.toFixed(1)}%)`, metrics: { pct } };
  },
};

const incremental: Check = {
  phase: 1,
  name: 'incremental refresh == full rebuild',
  async run({ sequences }) {
    const failures: string[] = [];
    for (let seed = 1; seed <= sequences; seed++) {
      const r = await incrementalMatchesFull(seed, Array.from({ length: 4 }, () => null), 300);
      if (r) failures.push(r);
    }
    return { ok: failures.length === 0, detail: failures.length ? failures.slice(0, 3).join('\n') : `${sequences} random edit sequences matched` };
  },
};

const refreshPerf: Check = {
  phase: 1,
  name: 'refresh after 1-5 changed files < 300 ms',
  async run() {
    await initSqlBackend();
    const dir = tempDir('gw-perf-');
    try {
      synthRepo(dir, 30_000, 3);
      await refreshIndex(dir);
      const rnd = prng(5);
      const files = readdirSync(path.join(dir, 'src')).map((f) => path.join(dir, 'src', f));
      const times: number[] = [];
      for (const n of [1, 5]) {
        for (let k = 0; k < n; k++) {
          const f = files[Math.floor(rnd() * files.length)]!;
          writeFileSync(f, readFileSync(f, 'utf8') + `\nexport const edit${k}_${n} = ${k};\n`);
        }
        const t0 = performance.now();
        await refreshIndex(dir);
        times.push(performance.now() - t0);
      }

      const worst = Math.max(...times);
      return { ok: worst < 300, detail: `1 file ${times[0]!.toFixed(0)} ms, 5 files ${times[1]!.toFixed(0)} ms (30k-line repo)`, metrics: { oneFileMs: times[0]!, fiveFileMs: times[1]! } };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

const coldIndex: Check = {
  phase: 1,
  name: 'cold index of a 100k-line repo < 60 s',
  slow: true,
  async run() {
    await initSqlBackend();
    const dir = tempDir('gw-cold-');
    try {
      synthRepo(dir, 100_000, 4);
      const t0 = performance.now();
      const r = await refreshIndex(dir);
      const s = (performance.now() - t0) / 1000;
      return { ok: s < 60, detail: `${r.files} files in ${s.toFixed(1)} s`, metrics: { seconds: s } };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

const doctor: Check = {
  phase: 1,
  name: 'gw doctor passes',
  async run() {
    const dir = tempDir('gw-doc-');
    try {
      const checks = await runDoctor(dir);
      const bad = checks.filter((c) => c.status === 'fail');
      return { ok: bad.length === 0, detail: bad.length ? bad.map((c) => `${c.name}: ${c.detail}`).join('; ') : `${checks.length} checks, no failures` };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const PHASE1_CHECKS: Check[] = [...golden, resolution, incremental, refreshPerf, coldIndex, doctor];
