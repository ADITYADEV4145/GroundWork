import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { affectedTests, registeredTasks, summarize } from '../scripts/bench-impact.js';

describe('impact preregistered harness', () => {
  it('accepts the frozen manifest and refuses any changed bytes before evaluation', () => {
    expect(registeredTasks().manifest.tasks).toHaveLength(16);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gw-impact-registration-'));
    try {
      writeFileSync(path.join(dir, 'PREREGISTRATION.md'), readFileSync('bench/impact/PREREGISTRATION.md'));
      const manifest = readFileSync('bench/impact/tasks.json');
      writeFileSync(path.join(dir, 'tasks.json'), manifest);
      expect(registeredTasks(dir).sha256).toBe(registeredTasks().sha256);
      writeFileSync(path.join(dir, 'tasks.json'), Buffer.concat([manifest, Buffer.from('\n')]));
      expect(() => registeredTasks(dir)).toThrow('SHA256 differs');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('computes static test import reachability independently and retains empty/error cases', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gw-impact-oracle-'));
    try {
      writeFileSync(path.join(root, 'api.ts'), 'export function api() {}');
      writeFileSync(path.join(root, 'caller.ts'), 'export { api } from "./api.js";');
      writeFileSync(path.join(root, 'api.test.ts'), 'import { api } from "./caller.js";');
      const files = ['api.ts', 'caller.ts', 'api.test.ts'];
      expect(affectedTests(root, files, 'api.ts', ts)).toEqual(['api.test.ts']);
      expect(affectedTests(root, files, 'missing.ts', ts)).toEqual([]);
      expect(() => affectedTests(root, ['absent.ts'], 'api.ts', ts)).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('never counts zero complete answers as perfect completeness or a gate pass', () => {
    const empty = summarize([]);
    expect(empty.completeAccuracy).toBeNull();
    expect(empty.rules.completeAccuracy).toBe(false);
    expect(empty.status).toBe('INCOMPLETE');
    type Row = Parameters<typeof summarize>[0][number];
    const row: Row = { task: registeredTasks().manifest.tasks[0]!, expectedCallers: ['caller.ts'], expectedTests: ['api.test.ts'], listedCallers: ['caller.ts'], listedTests: [], missingCallers: [], missingTests: ['api.test.ts'], falsePositiveCallers: [], baseline: [], diagnostics: [], newErrors: [], impact: { symbols: [], complete: true, incompleteBecause: [], evidenceKnown: false, commandsObserved: 0, ms: 1 }, highRisk: true, errors: [], ms: 1, oracleMs: 1 };
    const summary = summarize(Array.from({ length: 16 }, () => row));
    expect(summary.callerRecall).toBe(1);
    expect(summary.testRecall).toBe(0);
    expect(summary.completeAccuracy).toBe(0);
    expect(summary.status).toBe('FAIL');
  });
});
