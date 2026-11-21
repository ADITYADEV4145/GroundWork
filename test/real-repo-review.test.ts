import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateRealRepoReview } from '../src/selftest/real-repo-review.js';
import { PHASE3_CHECKS } from '../src/selftest/checks/phase3.js';
import { monthBounds, project, sampleCommits } from '../scripts/real-repos.js';

describe('deferred real-history gate', () => {
  it('reports a skip, without metrics or an acceptance claim, even with only summary/manifests', async () => {
    const expected = { ok: true, skipped: true, detail: 'skipped: evidence not stored; gate deferred to Benchmark v2' };
    expect(evaluateRealRepoReview(path.join(project, 'bench/real-repos'))).toEqual(expected);
    expect(evaluateRealRepoReview(path.join(project, 'missing-evidence'))).toEqual(expected);
    const check = PHASE3_CHECKS.find((c) => c.name.startsWith('real-repo BLOCK agreement'))!;
    expect(check.slow).toBe(true);
    expect(await check.run({ quick: false, sequences: 1 })).toEqual(expected);
  });
  it('keeps UTC calendar bounds and deterministic endpoint-inclusive sampling reproducible', () => {
    expect(monthBounds('2025-02').map((n) => new Date(n).toISOString())).toEqual(['2025-02-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z']);
    const commits = Array.from({ length: 10 }, (_, i) => String(i));
    expect(sampleCommits(commits)).toEqual(commits);
    expect(sampleCommits(commits, 3)).toEqual(['0', '4', '9']);
    expect(sampleCommits([])).toEqual([]);
    expect(() => sampleCommits(commits, 1)).toThrow('integer >= 2');
  });
  it('refuses an in-repo replay cache before setup or networking', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', "import './scripts/real-repos.ts'"], {
      cwd: project, env: { ...process.env, GW_REAL_REPOS_CACHE: path.join(project, 'bench/real-repos/cache') }, encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must be outside the GroundWork repository');
  });
});
