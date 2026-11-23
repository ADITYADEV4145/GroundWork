import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as z from 'zod';
import { Grounder } from '../../grounding/verify.js';
import { changedFromGit } from '../../grounding/ranges.js';
import { refreshIndex } from '../../index/refresh.js';
import { indexDbPath } from '../../index/store.js';
import { languageForPath } from '../../lang/parser.js';
import { initSqlBackend, openDb } from '../../store/db.js';

const sha = z.string().regex(/^[0-9a-f]{40}$/);
export const prListSchema = z.object({
  version: z.literal(1),
  /** How the list was sampled, stated before any PR was scanned. */
  sampling: z.string().min(20),
  prs: z.array(z.object({
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), number: z.number().int().positive(), base: sha, head: sha,
    /** Why the PR counts as AI-written. */
    signal: z.enum(['trailer', 'bot-author', 'label']),
  })).min(1),
});

export interface PrStudy {
  format: 1; sampling: string; prs: number; scanned: number; failed: number;
  prsWithFinding: number; findings: Record<string, number>; filesChecked: number; byLanguage: Record<string, { files: number; findings: number }>;
}

/**
 * Scans public AI-written PRs from local mirrors (`<cache>/<owner>__<repo>`, already holding both commits) and reports aggregates only:
 * no repository names, PR numbers, authors or code appear in the output. Blocking index findings on changed lines are counted;
 * they are tool findings, not human-confirmed defects, and the output says so.
 */
export async function prStudy(listFile: string, cache: string): Promise<PrStudy> {
  const list = prListSchema.parse(JSON.parse(readFileSync(listFile, 'utf8')));
  const out: PrStudy = { format: 1, sampling: list.sampling, prs: list.prs.length, scanned: 0, failed: 0, prsWithFinding: 0, findings: {}, filesChecked: 0, byLanguage: {} };
  await initSqlBackend();
  for (const pr of list.prs) {
    const mirror = path.join(cache, pr.repo.replace('/', '__')), work = mkdtempSync(path.join(os.tmpdir(), 'gw-pr-study-'));
    try {
      if (!existsSync(mirror)) throw new Error('no mirror');
      const archive = execFileSync('git', ['archive', pr.head], { cwd: mirror, maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      execFileSync('tar', ['-xf', '-'], { cwd: work, input: archive });
      const patch = execFileSync('git', ['diff', '--binary', pr.head, pr.base], { cwd: mirror, maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=study', '-c', 'user.email=study@localhost', ...args], { cwd: work, stdio: ['pipe', 'pipe', 'pipe'] });
      // Rebuild base -> head as one local commit pair so only the PR's own lines are checked.
      git('init', '-q', '--template=');
      git('add', '-A'); git('commit', '-qm', 'head');
      execFileSync('git', ['apply', '--index', '-'], { cwd: work, input: patch, stdio: ['pipe', 'pipe', 'pipe'] });
      git('commit', '-qm', 'base', '--allow-empty');
      // --no-overlay also removes files the PR deleted.
      git('checkout', '-q', '--no-overlay', 'HEAD~1', '--', '.');
      await refreshIndex(work);
      const db = openDb(indexDbPath(work), { readonly: true });
      let found = 0;
      try {
        const grounder = new Grounder(db, work);
        for (const changed of changedFromGit(work, 'HEAD')) {
          const language = languageForPath(changed.file);
          if (!language) continue;
          const findings = grounder.verify(changed.file, { ranges: changed.ranges }).findings.filter((f) => f.blocking);
          out.filesChecked++;
          const row = out.byLanguage[language] ??= { files: 0, findings: 0 };
          row.files++; row.findings += findings.length; found += findings.length;
          for (const f of findings) out.findings[f.kind] = (out.findings[f.kind] ?? 0) + 1;
        }
      } finally { db.close(); }
      out.scanned++;
      if (found) out.prsWithFinding++;
    } catch { out.failed++; } finally { rmSync(work, { recursive: true, force: true }); }
  }
  return out;
}
