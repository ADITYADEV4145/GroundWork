import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { grade, type Grade } from './grade.js';
import { dataRoot, loadManifest } from './tasks.js';
import { applyReference, materialize } from './workspaces.js';

export interface ValidationRow { task: string; unmodifiedFails: boolean; referencePasses: boolean; referenceDefects: number; reference: Grade }

/** Every task must fail untouched and pass, with zero defects, on its reference solution. */
export async function validate(root = dataRoot): Promise<{ ok: boolean; rows: ValidationRow[] }> {
  const manifest = loadManifest(root), work = mkdtempSync(path.join(os.tmpdir(), 'gw-dad-validate-'));
  try {
    const rows: ValidationRow[] = [];
    for (const task of manifest.tasks) {
      const repo = manifest.repos.find((r) => r.id === task.repo)!;
      if (repo.source.kind !== 'fixture') continue;
      const dir = path.join(work, task.id), base = materialize(repo, dir, { root });
      const before = await grade(task, repo, dir, base, root);
      applyReference(task, dir, root);
      const after = await grade(task, repo, dir, base, root);
      rows.push({ task: task.id, unmodifiedFails: !before.hiddenPassed, referencePasses: after.success && !after.invalid.length,
        referenceDefects: after.totalDefects, reference: after });
    }
    return { ok: rows.every((r) => r.unmodifiedFails && r.referencePasses && r.referenceDefects === 0), rows };
  } finally { rmSync(work, { recursive: true, force: true }); }
}
