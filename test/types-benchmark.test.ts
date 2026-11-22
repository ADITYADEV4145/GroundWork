import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { percentile, registeredManifest, unionBlocks } from '../scripts/bench-types.js';

describe('preregistered type-checking benchmark', () => {
  it('accepts only the frozen mutation bytes and rejects altered or unregistered lists', () => {
    const frozen = registeredManifest();
    expect(frozen.manifest.mutations).toHaveLength(94);
    expect(frozen.manifest.cleanCommits).toHaveLength(32);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gw-types-registration-'));
    try {
      const bytes = readFileSync(path.resolve('bench/types/mutations.json'));
      const hash = createHash('sha256').update(bytes).digest('hex');
      writeFileSync(path.join(dir, 'mutations.json'), bytes);
      writeFileSync(path.join(dir, 'PREREGISTRATION.md'), `Manifest SHA256: \`${hash}\``);
      expect(registeredManifest(dir).hash).toBe(frozen.hash);
      writeFileSync(path.join(dir, 'mutations.json'), Buffer.concat([bytes, Buffer.from('\n')]));
      expect(() => registeredManifest(dir)).toThrow('SHA256 differs');
      writeFileSync(path.join(dir, 'PREREGISTRATION.md'), 'Not registered');
      expect(() => registeredManifest(dir)).toThrow('SHA256 differs');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('deduplicates same-line/name evidence, preferring grounding without dropping distinct diagnostics', () => {
    const grounding = { file: 'a.ts', line: 2, name: 'service.run', message: 'grounding wording', code: 'arity', source: 'grounding' as const };
    const type = { ...grounding, name: 'run', message: 'compiler wording', code: 2554, source: 'types' as const };
    expect(unionBlocks([grounding], [type, type])).toEqual([{ ...grounding, typeConfirmed: true }]);
    const another = { ...type, name: 'other', code: 2339 };
    const different = { ...another, message: 'different diagnostic', code: 2345 };
    expect(unionBlocks([], [another, another, different])).toEqual([another, different]);
    expect(unionBlocks([], [])).toEqual([]);
  });

  it('keeps v2 separately registered, mutation-disjoint and balanced across additional history', () => {
    const v1 = registeredManifest().manifest;
    const { manifest } = registeredManifest(undefined, 2);
    const key = (m: { repo: string; file: string; before: string; after: string }) => JSON.stringify([m.repo, m.file, m.before, m.after]);
    const old = new Set(v1.mutations.map(key));
    expect(manifest.seed).not.toBe(v1.seed);
    expect(manifest.mutations).toHaveLength(93);
    expect(manifest.mutations.some((m) => old.has(key(m)))).toBe(false);
    expect(manifest.cleanCommits).toHaveLength(35);
    expect(manifest.cleanCommits.filter((c) => !v1.cleanCommits.some((old) => old.commit === c.commit))).toHaveLength(3);
    for (const c of manifest.cleanCommits) {
      expect(c.files!.length).toBeGreaterThan(0);
      expect(c.files!.length).toBeLessThanOrEqual(4);
      expect(c.files!.some((f) => f.split('/').some((part) => /^bad/i.test(part)))).toBe(false);
      expect(c.files!.some((f) => c.excluded!.some((excluded) => excluded.file === f))).toBe(false);
    }
  });

  it('uses preregistered nearest-rank percentiles without discarding outliers', () => {
    expect(percentile([], 0.95)).toBeNull();
    expect(percentile([7], 0.95)).toBe(7);
    const values = Array.from({ length: 40 }, (_, i) => i + 1).reverse();
    expect(percentile(values, 0.5)).toBe(20);
    expect(percentile(values, 0.95)).toBe(38);
    expect(values[0]).toBe(40);
  });
});
