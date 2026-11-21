import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { CheckResult } from './registry.js';

const hash = z.string().regex(/^[a-f0-9]{40}$/);
const pin = z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), start: hash, end: hash });
const manifestSchema = z.object({ repositories: z.array(pin).length(3) });
const findingSchema = z.object({ id: hash, severity: z.enum(['BLOCK', 'WARN']) });
const runSchema = z.object({
  repository: pin, modelHash: z.string(), eligibleCommits: z.array(hash), selectedCommits: z.array(hash),
  runs: z.array(z.object({ commit: hash, parent: hash, exitCode: z.number().nullable(),
    status: z.enum(['PASS', 'WARN', 'BLOCK', 'UNAVAILABLE']), findings: z.array(findingSchema) })),
});
const reviewSchema = z.object({ reviewer: z.literal('agent'), method: z.string().min(20), reviews: z.array(z.object({
  repo: z.string(), commit: hash, findingId: hash, label: z.enum(['agree', 'disagree']), reason: z.string().trim().min(20),
})) });
const json = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

export function evaluateRealRepoReview(directory: string): CheckResult {
  const reviewsPath = path.join(directory, 'reviews.json');
  if (!existsSync(reviewsPath) || !existsSync(path.join(directory, 'review.md')))
    return { ok: true, skipped: true, detail: 'Real-repo review file missing (review.md or reviews.json); run the dev-only replay and review first. No clones or network attempted.' };
  try {
    const manifest = manifestSchema.parse(json(path.join(directory, 'repos.json')));
    if (new Set(manifest.repositories.map((r) => r.id)).size !== 3) throw new Error('Repeated repository ids.');
    const review = reviewSchema.parse(json(reviewsPath));
    const expectedHash = createHash('sha256').update(readFileSync(new URL('../reuse/model.json', import.meta.url))).digest('hex');
    const blocks = new Set<string>();
    let unavailable = 0, commits = 0, warnings = 0;
    for (const repo of manifest.repositories) {
      const data = runSchema.parse(json(path.join(directory, 'runs', `${repo.id}.json`)));
      if (data.repository.id !== repo.id || data.repository.start !== repo.start || data.repository.end !== repo.end) throw new Error(`${repo.id}: pins differ from manifest.`);
      if (data.modelHash !== expectedHash) throw new Error(`${repo.id}: stale model hash; review is not evidence for this classifier.`);
      const selected = new Set(data.selectedCommits), eligible = new Set(data.eligibleCommits);
      if (!selected.size || selected.size !== data.selectedCommits.length || data.runs.length !== selected.size ||
        new Set(data.runs.map((r) => r.commit)).size !== selected.size || [...selected].some((c) => !eligible.has(c))) throw new Error(`${repo.id}: invalid replay coverage.`);
      for (const run of data.runs) {
        if (!selected.has(run.commit)) throw new Error(`${repo.id}: unexpected run.`);
        commits++;
        if (run.status === 'UNAVAILABLE' || run.exitCode !== (run.status === 'BLOCK' ? 1 : 0)) unavailable++;
        for (const finding of run.findings) {
          if (finding.severity === 'WARN') { warnings++; continue; }
          const key = `${repo.id}:${run.commit}:${finding.id}`;
          if (blocks.has(key)) throw new Error(`Repeated BLOCK ${key}.`);
          blocks.add(key);
        }
      }
    }
    const labeled = new Set<string>();
    let agree = 0;
    for (const row of review.reviews) {
      const key = `${row.repo}:${row.commit}:${row.findingId}`;
      if (!blocks.has(key) || labeled.has(key)) throw new Error(`Unknown or repeated review ${key}.`);
      labeled.add(key);
      if (row.label === 'agree') agree++;
    }
    if (labeled.size !== blocks.size) throw new Error(`${blocks.size - labeled.size} BLOCK findings are unreviewed.`);
    const rate = blocks.size ? agree / blocks.size : 0;
    return {
      ok: unavailable === 0 && blocks.size > 0 && rate >= 0.9,
      detail: `Agent-reviewed, not human-approved: ${agree}/${blocks.size} BLOCKs agree (${(rate * 100).toFixed(1)}%); ${warnings} WARNs, ${commits} commits, ${unavailable} unavailable runs. ${blocks.size ? 'Required agreement >= 90%.' : 'Zero BLOCKs cannot establish the acceptance rate.'} Stored evidence only; no clones or network.`,
      metrics: { agreement: rate, agree, disagree: blocks.size - agree, blocks: blocks.size, warnings, commits, unavailable },
    };
  } catch (error) { return { ok: false, detail: `Invalid real-repo review evidence: ${(error as Error).message}` }; }
}
