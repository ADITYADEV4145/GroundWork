import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runBenchmark } from '../src/bench/runner.js';
import { tempDir } from '../src/selftest/fixtures.js';

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, existsSync: vi.fn(fs.existsSync) };
});

async function recordedSuites(names: string[]) {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  vi.mocked(existsSync).mockImplementation((file) => {
    const location = String(file);
    if (path.basename(location) === 'evidence.json' && !names.includes(path.basename(path.dirname(location)))) return false;
    return fs.existsSync(file);
  });
}

describe('offline all-suite replay', () => {
  it('writes available reports without requiring evidence for every installed suite', async () => {
    await recordedSuites(['nav']);
    const root = tempDir('gw-bench-replay-');
    try {
      const output = await runBenchmark({ suite: 'all', runs: 3, outputDir: root });
      expect(output.summaries.map((summary) => summary.suite)).toEqual(['nav']);
      expect(JSON.parse(readFileSync(output.json, 'utf8')).map((record: { summary: { suite: string } }) => record.summary.suite)).toEqual(['nav']);
      expect(readFileSync(output.markdown, 'utf8')).toContain('# Groundwork benchmark: nav');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('fails without writing output when no installed suite has evidence', async () => {
    await recordedSuites([]);
    const root = tempDir('gw-bench-no-evidence-');
    try {
      const outputDir = path.join(root, 'output');
      await expect(runBenchmark({ suite: 'all', runs: 3, outputDir })).rejects.toThrow('No recorded benchmark suites found');
      expect(existsSync(outputDir)).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('still rejects an explicitly requested suite without evidence', async () => {
    await recordedSuites(['nav']);
    await expect(runBenchmark({ suite: 'long-horizon', runs: 3 })).rejects.toThrow('No recorded long-horizon evidence');
  });

  it('still validates existing evidence rather than swallowing replay errors', async () => {
    await recordedSuites(['nav']);
    await expect(runBenchmark({ suite: 'all', runs: 2 })).rejects.toThrow('Unexpected or duplicate replicate');
  });

  it('does not skip unrecorded suites when grading observations', async () => {
    await recordedSuites(['nav']);
    const root = tempDir('gw-bench-empty-captures-');
    try {
      await expect(runBenchmark({ suite: 'all', runs: 3, observations: root })).rejects.toThrow('No captures for long-horizon');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
