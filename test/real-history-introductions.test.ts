import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { historyManifestForSet } from '../scripts/mine-heldout-history.js';

const read = (file: string) => JSON.parse(readFileSync(new URL(`../bench/${file}`, import.meta.url), 'utf8'));
describe('stored introduction and independent discovery evidence', () => {
  it('selects the explicitly named frozen mining window and rejects empty/unknown sets', () => {
    expect(JSON.parse(readFileSync(historyManifestForSet('new-2'), 'utf8')).repositories.map((r: any) => r.month)).toEqual(['2024-09', '2025-10', '2025-10']);
    expect(historyManifestForSet('original')).toMatch(/real-repos\/repos.json$/);
    expect(() => historyManifestForSet('')).toThrow('Specify');
    expect(() => historyManifestForSet('training')).toThrow('Specify');
  });
  it('covers all positive families and verifies parent absence before using an introduction', () => {
    const data = read('real-history/introduction-recall.json'), labels = read('real-history/introduction-reviews.json');
    const expected = read('real-history/dev/families.json').filter((f: any) => f.actionClass === 'extract/extend').map((f: any) => f.id).sort();
    expect(data.rows.map((r: any) => r.family).sort()).toEqual(expected);
    expect(labels.reviews.map((r: any) => r.family).sort()).toEqual(expected);
    const freeze = read('real-repos/step3/freeze.json');
    for (const row of data.rows) {
      const label = labels.reviews.find((r: any) => r.family === row.family);
      if (label.verified) {
        expect(row.identityBirth).toBe(true);
        expect(row.parentPresence.some((p: any) => p.count === 0)).toBe(true);
        expect(row.parentPresence.every((p: any) => !p.hasErrors)).toBe(true);
      }
      if (row.replay) expect(row.replay.toolCommit).toBe(freeze.modelCommit);
    }
    const available = data.rows.filter((r: any) => labels.reviews.find((l: any) => l.family === r.family).verified && r.replay && r.replay.status !== 'UNAVAILABLE');
    expect(available).toHaveLength(2);
    expect(available.every((r: any) => r.replay.familyBlocked && r.replay.exitCode === 1)).toBe(true);
    expect(labels.summary).toContain('not independent');
  });
  it('labels every reserved mining proposal without treating unknown wrapper evidence as positive', () => {
    const labels = read('real-repos/step3/positive-reviews.json');
    const proposals = ['original', 'heldout', 'new-1', 'new-2'].flatMap((s) => ['got', 'click', 'pytest'].flatMap((r) => read(`real-repos/step3/mining/${s}-${r}.json`).proposals));
    expect(labels.reviews.map((r: any) => r.id).sort()).toEqual(proposals.map((r: any) => r.id).sort());
    expect(labels.withheld.every((r: any) => r.actionClass === 'unknown')).toBe(true);
    expect(labels.summary).toContain('recall is unknown');
  });
  it('reviews all unique supplemental introduction BLOCKs without counting repeated captures twice', () => {
    const rows = read('real-history/introduction-recall.json').rows;
    const keys = new Set(rows.flatMap((r: any) => (r.replay?.findings ?? []).filter((f: any) => f.severity === 'BLOCK').map((f: any) => `${r.repo}:${r.introduction}:${f.id}`)));
    const labels = read('real-repos/step3/intro-block-reviews.json').reviews;
    expect(labels.map((r: any) => `${r.repo}:${r.commit}:${r.findingId}`).sort()).toEqual([...keys].sort());
    expect(labels.every((r: any) => ['agree', 'disagree'].includes(r.reuseOrExtendLabel) && r.reuseOrExtendReason.length > 20)).toBe(true);
  });
});
