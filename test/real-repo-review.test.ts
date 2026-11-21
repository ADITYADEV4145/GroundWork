import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateReviewEvidence as evaluateRealRepoReview, evaluateRealRepoReview as evaluateFinalReview, reviewModelHash } from '../src/selftest/real-repo-review.js';
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
