import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { historyManifestForSet } from '../scripts/mine-heldout-history.js';

describe('pinned history mining manifests', () => {
  it('selects the named frozen window and rejects unknown sets without reading removed evidence', () => {
    expect(JSON.parse(readFileSync(historyManifestForSet('new-2'), 'utf8')).repositories.map((r: { month: string }) => r.month)).toEqual(['2024-09', '2025-10', '2025-10']);
    expect(historyManifestForSet('original')).toMatch(/real-repos\/repos.json$/);
    expect(() => historyManifestForSet('')).toThrow('Specify');
    expect(() => historyManifestForSet('training')).toThrow('Specify');
  });
});
