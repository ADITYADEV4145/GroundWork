// Phase 5 gate harness: times `gw scan` and `gw receipt` on pinned open source checkouts and draws the review sample.
// Developer-only; fetches the pinned commits into an external cache. See bench/scan-oss/PROTOCOL.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const suite = path.join(here, '..', 'bench', 'scan-oss');
const gw = path.join(here, '..', 'dist', 'cli', 'main.js');
const cache = process.env.GW_REAL_REPOS_CACHE ?? path.join(os.homedir(), 'work', 'gw-real-repos', 'scan-oss');
const RUNS = 3, SEED = 20261123, SAMPLE = 100, TIMEOUT_MS = 120_000;
const SOURCE = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts|py|go|java|rs|cs|rb)$/;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function checkout(repo) {
  const dir = path.join(cache, repo.id);
  if (!existsSync(path.join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q');
    git(dir, 'remote', 'add', 'origin', repo.url);
    git(dir, 'fetch', '-q', '--depth', '1', 'origin', repo.commit);
    git(dir, 'checkout', '-q', 'FETCH_HEAD');
  }
  if (git(dir, 'rev-parse', 'HEAD') !== repo.commit) throw new Error(`${repo.id}: checkout is not at ${repo.commit}`);
  git(dir, 'reset', '-q', '--hard');
  git(dir, 'clean', '-qfdx');
  return dir;
}

function size(dir) {
  let files = 0, lines = 0;
  for (const file of git(dir, 'ls-files').split('\n')) {
    if (!SOURCE.test(file)) continue;
    const full = path.join(dir, file);
    if (!statSync(full, { throwIfNoEntry: false })?.isFile()) continue;
    files++; lines += readFileSync(full, 'utf8').split('\n').length;
  }
  return { sourceFiles: files, sourceLines: lines };
}

function timed(args, cwd) {
  const start = performance.now();
  const r = spawnSync(process.execPath, [gw, ...args], { cwd, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 1 << 30 });
  return { ms: Math.round(performance.now() - start), status: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: (r.stderr ?? '').slice(-2000) };
}

/** mulberry32: a small seeded generator so the sample can be redrawn exactly. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const repos = JSON.parse(readFileSync(path.join(suite, 'repos.json'), 'utf8')).repositories;
const out = {
  measuredAt: new Date().toISOString(),
  groundworkCommit: git(path.join(here, '..'), 'rev-parse', 'HEAD'),
  machine: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGb: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}`, node: process.version },
  limits: { scanMs: 30_000, receiptMs: 1_000, precision: 0.9 },
  repositories: [],
};
const pool = [];
for (const repo of repos) {
  const entry = { ...repo, scans: [], receipts: [] };
  out.repositories.push(entry);
  let dir;
  try { dir = checkout(repo); } catch (error) { entry.error = `checkout failed: ${error.message}`; continue; }
  Object.assign(entry, size(dir));
  let first = null;
  for (let run = 1; run <= RUNS; run++) {
    rmSync(path.join(dir, '.groundwork'), { recursive: true, force: true });
    const r = timed(['scan', dir, '--json'], dir);
    let report = null;
    try { report = JSON.parse(r.stdout); } catch { /* recorded as a failed run below */ }
    const ok = report !== null && (r.status === 0 || r.status === 1);
    entry.scans.push({ run, ms: r.ms, exit: r.status, signal: r.signal, ok, ...(ok ? { reportedMs: report.ms, files: report.files, filesUnchecked: report.filesUnchecked, counts: report.counts, check: report.check.length, skipped: report.skipped } : { stderr: r.stderr }) });
    if (ok && !first) first = report;
    console.error(`${repo.id} scan ${run}: ${r.ms} ms exit ${r.status}${ok ? '' : ' FAILED'}`);
  }
  if (first) {
    writeFileSync(path.join(cache, `${repo.id}.scan.json`), JSON.stringify(first, null, 2));
    for (const f of first.findings) pool.push({ repo: repo.id, ...f });
  }
  // Receipt: one reported edit gives the checkout a session; the index from the last scan is still there.
  try {
    const file = git(dir, 'ls-files').split('\n').find((f) => SOURCE.test(f) && !/test|spec/i.test(f));
    appendFileSync(path.join(dir, file), '\n');
    const session = `scan-oss-${repo.id}`;
    const hook = spawnSync(process.execPath, [gw, 'hook', 'claude', 'post_tool'], { cwd: dir, encoding: 'utf8', timeout: TIMEOUT_MS,
      input: JSON.stringify({ session_id: session, cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(dir, file) }, tool_response: {} }) });
    entry.receiptSetup = { editedFile: file, hookExit: hook.status };
    for (let run = 1; run <= RUNS; run++) {
      const png = path.join(cache, `${repo.id}.receipt.png`);
      rmSync(png, { force: true });
      const r = timed(['receipt', '--session', session, '--png', png], dir);
      const wrote = existsSync(png) && readFileSync(png).subarray(1, 4).toString() === 'PNG';
      entry.receipts.push({ run, ms: r.ms, exit: r.status, png: wrote, ...(r.status === 0 && wrote ? { text: r.stdout.trim().split('\n') } : { stderr: r.stderr }) });
      console.error(`${repo.id} receipt ${run}: ${r.ms} ms exit ${r.status}`);
    }
  } catch (error) { entry.receiptError = error.message; }
}

pool.sort((a, b) => a.repo.localeCompare(b.repo) || a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind) || a.message.localeCompare(b.message));
const next = rng(SEED), order = pool.map((_, i) => i);
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
const sample = order.slice(0, SAMPLE).sort((a, b) => a - b).map((i, n) => ({ id: n + 1, ...pool[i] }));
out.pool = { findings: pool.length, seed: SEED, sampled: sample.length };
writeFileSync(path.join(suite, 'results.json'), JSON.stringify(out, null, 2) + '\n');
writeFileSync(path.join(suite, 'sample.json'), JSON.stringify(sample, null, 2) + '\n');
console.error(`pool ${pool.length}, sampled ${sample.length}`);
