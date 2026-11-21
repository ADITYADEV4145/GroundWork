import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateExpandedReview, evaluateReviewEvidence as evaluateRealRepoReview, evaluateRealRepoReview as evaluateFinalReview, reviewModelHash, wilson } from '../src/selftest/real-repo-review.js';
import { monthBounds, project, sampleCommits } from '../scripts/real-repos.js';

const roots: string[] = [];
const write = (root: string, file: string, value: unknown) => writeFileSync(path.join(root, file), JSON.stringify(value));
const read = (root: string, file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
function fixture(agree = 9, count = 10) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-review-')); roots.push(root);
  mkdirSync(path.join(root, 'runs'));
  writeFileSync(path.join(root, 'review.md'), '# Synthetic review\n');
  const repos = ['got', 'click', 'pytest'].map((id) => ({ id, start: 'a'.repeat(40), end: 'b'.repeat(40) }));
  write(root, 'repos.json', { repositories: repos });
  const modelHash = createHash('sha256').update(readFileSync(new URL('../src/reuse/model.json', import.meta.url))).digest('hex');
  for (const [i, repository] of repos.entries()) {
    const commit = String(i + 1).repeat(40);
    write(root, `runs/${repository.id}.json`, { repository, modelHash, eligibleCommits: [commit], selectedCommits: [commit],
      runs: [{ commit, parent: 'a'.repeat(40), exitCode: i === 0 && count > 0 ? 1 : 0, status: i === 0 && count > 0 ? 'BLOCK' : 'PASS',
        findings: i === 0 ? Array.from({ length: count }, (_, n) => ({ id: (n + 10).toString(16).padStart(40, '0'), severity: 'BLOCK' })) : [] }] });
  }
  write(root, 'reviews.json', { reviewer: 'agent', method: 'Synthetic offline evidence for the review gate.',
    reviews: Array.from({ length: count }, (_, i) => ({ repo: 'got', commit: '1'.repeat(40), findingId: (i + 10).toString(16).padStart(40, '0'),
      label: i < agree ? 'agree' : 'disagree', reason: 'Synthetic reason that explains the review decision.' })) });
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function expandedFixture() {
  const root = fixture(); mkdirSync(path.join(root, 'step3'));
  const standardHash = createHash('sha256').update(readFileSync(path.join(project, 'bench/real-history/review-standard.md'))).digest('hex');
  write(root, 'step3/freeze.json', { modelCommit: 'f'.repeat(40), modelHash: reviewModelHash(readFileSync(path.join(project, 'src/reuse/model.json'), 'utf8')), standardHash });
  for (const [i, set] of ['original', 'heldout', 'new-1', 'new-2'].entries()) {
    mkdirSync(path.join(root, 'step3', set, 'runs'), { recursive: true });
    const manifest = read(root, 'repos.json');
    for (const [j, repo] of manifest.repositories.entries()) {
      repo.month = `2025-0${i + 1}`; repo.start = (i + 10).toString(16).repeat(40); repo.end = (i + 11).toString(16).repeat(40);
      const data = read(root, `runs/${repo.id}.json`), commit = (i * 3 + j + 1).toString(16).repeat(40);
      data.repository = repo; data.toolCommit = 'f'.repeat(40); data.sampling = 'none; all non-merge commits in the UTC calendar window';
      data.selectedCommits = data.eligibleCommits = [commit]; data.runs[0].commit = commit;
      write(root, `step3/${set}/runs/${repo.id}.json`, data);
    }
    write(root, i === 0 ? 'repos.json' : i === 1 ? 'heldout-repos.json' : `step3/${set}-repos.json`, manifest);
    const review = read(root, 'reviews.json'); review.standardHash = standardHash;
    for (const row of review.reviews) { row.commit = (i * 3 + 1).toString(16).repeat(40); row.reuseOrExtendLabel = row.label; row.reuseOrExtendReason = row.reason; row.label = 'disagree'; }
    write(root, `step3/${set}/reviews.json`, review);
  }
  return root;
}

describe('frozen expanded reuse-or-extend history gate', () => {
  it('computes two-sided Wilson intervals without a vacuous empty interval', () => {
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(0, 1)![1]).toBeCloseTo(0.7934506856);
    expect(wilson(1, 1)![0]).toBeCloseTo(0.2065493144);
    expect(() => wilson(2, 1)).toThrow('Invalid');
  });
  it('uses separate new-standard labels without changing strict labels', () => {
    const result = evaluateFinalReview(expandedFixture());
    expect(result.ok, result.detail).toBe(true);
    expect(result.metrics?.heldoutAgreement).toBe(0.9);
    expect(result.detail).toContain('Wilson 95%');
  });
  it('fails clearly rather than accepting empty expanded BLOCK support', () => {
    const root = expandedFixture();
    for (const set of ['original', 'heldout', 'new-1', 'new-2']) {
      const review = read(root, `step3/${set}/reviews.json`); review.reviews = []; write(root, `step3/${set}/reviews.json`, review);
      for (const repo of ['got', 'click', 'pytest']) {
        const r = read(root, `step3/${set}/runs/${repo}.json`); r.runs[0].findings = []; r.runs[0].status = 'PASS'; r.runs[0].exitCode = 0;
        write(root, `step3/${set}/runs/${repo}.json`, r);
      }
    }
    const result = evaluateFinalReview(root);
    expect(result.ok).toBe(false); expect(result.metrics?.heldoutBlocks).toBe(0);
    expect(result.detail).toContain('Wilson 95% undefined');
  });
  it('rejects unreviewed new months, stale freezes, sampling and reused commits', () => {
    for (const mutation of ['review', 'freeze', 'sampling', 'repeat']) {
      const root = expandedFixture();
      if (mutation === 'review') { const r = read(root, 'step3/new-2/reviews.json'); delete r.reviews[0].reuseOrExtendReason; write(root, 'step3/new-2/reviews.json', r); }
      if (mutation === 'freeze') { const r = read(root, 'step3/freeze.json'); r.modelCommit = 'e'.repeat(40); write(root, 'step3/freeze.json', r); }
      if (mutation === 'sampling') { const r = read(root, 'step3/new-2/runs/got.json'); r.eligibleCommits.push('e'.repeat(40)); write(root, 'step3/new-2/runs/got.json', r); }
      if (mutation === 'repeat') { const r = read(root, 'step3/new-2/runs/got.json'); r.selectedCommits = r.eligibleCommits = ['1'.repeat(40)]; r.runs[0].commit = '1'.repeat(40); write(root, 'step3/new-2/runs/got.json', r); }
      expect(evaluateFinalReview(root).ok, mutation).toBe(false);
    }
  });
});

describe('stored real-repository review gate', () => {
  it('matches the captured source model hash even when tsc reformats its copied JSON', () => {
    const raw = readFileSync(path.join(project, 'src/reuse/model.json'), 'utf8');
    const expected = createHash('sha256').update(raw).digest('hex');
    expect(reviewModelHash(raw)).toBe(expected);
    expect(reviewModelHash(JSON.stringify(JSON.parse(raw), null, 4))).toBe(expected);
  });
  it('accepts exactly 90% and rejects lower agreement without changing labels', () => {
    expect(evaluateRealRepoReview(fixture()).ok).toBe(true);
    const result = evaluateRealRepoReview(fixture(8));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('8/10 BLOCKs agree (80.0%)');
  });
  it('does not call zero BLOCKs a successful acceptance rate', () => {
    const result = evaluateRealRepoReview(fixture(0, 0));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('Zero BLOCKs cannot establish');
  });
  it('skips with an explicit reason if the review is absent', () => {
    const root = fixture(); rmSync(path.join(root, 'reviews.json'));
    expect(evaluateRealRepoReview(root)).toMatchObject({ ok: true, skipped: true, detail: expect.stringContaining('review file missing') });
  });
  it('rejects malformed, incomplete and duplicate labels', () => {
    const root = fixture(); const rows = read(root, 'reviews.json');
    rows.reviews.pop(); write(root, 'reviews.json', rows);
    expect(evaluateRealRepoReview(root).detail).toContain('1 BLOCK findings are unreviewed');
    rows.reviews.push(rows.reviews[0]); write(root, 'reviews.json', rows);
    expect(evaluateRealRepoReview(root).detail).toContain('Unknown or repeated review');
    writeFileSync(path.join(root, 'reviews.json'), '{');
    expect(evaluateRealRepoReview(root).ok).toBe(false);
  });
  it('rejects stale pins, classifiers, missing coverage and unavailable checks', () => {
    const root = fixture(); const original = read(root, 'runs/got.json');
    for (const [edit, reason] of [
      [(d: typeof original) => { d.repository.end = 'c'.repeat(40); }, 'pins differ'],
      [(d: typeof original) => { d.modelHash = 'stale'; }, 'stale model hash'],
      [(d: typeof original) => { d.runs = []; }, 'invalid replay coverage'],
      [(d: typeof original) => { d.runs[0].status = 'UNAVAILABLE'; }, '1 unavailable runs'],
    ] as const) {
      const data = structuredClone(original); edit(data); write(root, 'runs/got.json', data);
      const result = evaluateRealRepoReview(root);
      expect(result.ok).toBe(false); expect(result.detail).toContain(reason);
    }
  });
  it('uses held-out alone when stricter than the combined rate and rejects reused windows', () => {
    const root = fixture(20, 20), held = fixture(8, 10);
    mkdirSync(path.join(root, 'heldout', 'runs'), { recursive: true });
    const manifest = read(held, 'repos.json');
    for (const repo of manifest.repositories) {
      repo.end = 'c'.repeat(40);
      const data = read(held, `runs/${repo.id}.json`); data.repository.end = repo.end;
      write(root, `heldout/runs/${repo.id}.json`, data);
    }
    write(root, 'heldout-repos.json', manifest);
    write(root, 'heldout/reviews.json', read(held, 'reviews.json'));
    const result = evaluateFinalReview(root);
    expect(result.ok).toBe(false);
    expect(result.metrics?.combinedAgreement).toBeCloseTo(28 / 30);
    expect(result.metrics?.agreement).toBe(0.8);
    const reviews = read(root, 'heldout/reviews.json'); reviews.reviews[8].label = 'agree';
    write(root, 'heldout/reviews.json', reviews);
    expect(evaluateFinalReview(root).ok).toBe(true);
    write(root, 'heldout-repos.json', read(root, 'repos.json'));
    expect(evaluateFinalReview(root).detail).toContain('not a different window');
    rmSync(path.join(root, 'heldout-repos.json'));
    expect(evaluateFinalReview(root).detail).toContain('Held-out manifest missing');
  });
});

describe('dev replay selection and cache safety', () => {
  it('fails stored expanded evidence on reviewed agreement, not missing provenance', () => {
    const result = evaluateExpandedReview(path.join(project, 'bench/real-repos'));
    expect(result.ok).toBe(false);
    expect(result.detail).not.toContain('Invalid expanded history evidence');
    expect(result.metrics?.commits).toBe(250);
    expect(result.metrics?.heldoutBlocks).toBe(3);
    expect(result.metrics?.heldoutAgree).toBe(0);
    expect(result.metrics?.unavailable).toBe(0);
  });
  it('uses UTC calendar bounds and deterministic endpoint-inclusive sampling', () => {
    expect(monthBounds('2025-02').map((n) => new Date(n).toISOString())).toEqual(['2025-02-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z']);
    const commits = Array.from({ length: 10 }, (_, i) => String(i));
    expect(sampleCommits(commits)).toEqual(commits);
    expect(sampleCommits(commits, 3)).toEqual(['0', '4', '9']);
    expect(sampleCommits([])).toEqual([]);
    expect(() => sampleCommits(commits, 1)).toThrow('integer >= 2');
  });
  it('refuses a cache nested inside the project before setup or networking', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', "import './scripts/real-repos.ts'"], {
      cwd: project, env: { ...process.env, GW_REAL_REPOS_CACHE: path.join(project, 'bench/real-repos/cache') }, encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must be outside the GroundWork repository');
  });
});
