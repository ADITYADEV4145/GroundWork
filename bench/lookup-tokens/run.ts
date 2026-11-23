import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from 'gpt-tokenizer/encoding/cl100k_base';
import { z } from 'zod';
import { defaultConfig } from '../../src/config/load.js';
import { indexStats } from '../../src/index/query.js';
import { refreshIndex } from '../../src/index/refresh.js';
import { indexDbPath } from '../../src/index/store.js';
import { TOOLS } from '../../src/mcp/tools/index.js';
import type { ToolContext } from '../../src/mcp/registry.js';
import { openDb } from '../../src/store/db.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

const manifestSchema = z.object({
  version: z.literal(1), tokenizer: z.literal('cl100k_base'), source: z.string(),
  repos: z.array(z.object({ id: z.string(), url: z.string().url().startsWith('https://github.com/'), sha: z.string().regex(/^[a-f0-9]{40}$/) })).min(1),
  queries: z.array(z.string().min(1)).min(1),
  searchLimit: z.number().int().positive(), symbolsFetched: z.number().int().positive(), grepFilesRead: z.number().int().positive(),
});
export type Manifest = z.infer<typeof manifestSchema>;
export const loadManifest = (): Manifest => manifestSchema.parse(JSON.parse(readFileSync(path.join(HERE, 'tasks.json'), 'utf8')));

export const countTokens = (text: string): number => encode(text).length;

export interface CorpusFile { path: string; text: string }

/** Baseline B: list every file with a line containing any query term (case-insensitive), then read the most-matching files whole. */
export function grepTopN(files: CorpusFile[], query: string, filesRead: number) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) throw new Error('Empty query');
  const matched = files.flatMap((file) => {
    const hits = file.text.split(/\r\n|\r|\n/).filter((line) => { const low = line.toLowerCase(); return terms.some((t) => low.includes(t)); }).length;
    return hits ? [{ file, hits }] : [];
  }).sort((a, b) => b.hits - a.hits || (a.file.path < b.file.path ? -1 : a.file.path > b.file.path ? 1 : 0));
  const read = matched.slice(0, filesRead);
  const listTokens = countTokens(matched.map((m) => m.file.path + '\n').join(''));
  const readTokens = read.reduce((sum, m) => sum + countTokens(m.file.text), 0);
  return { tokens: listTokens + readTokens, listTokens, readTokens, filesMatched: matched.length, filesRead: read.map((m) => m.file.path) };
}

type Call = (tool: string, args: Record<string, unknown>) => Promise<string>;

/** GroundWork side: one search_code call, then read_symbol on the top hits, following every Next page so whole bodies are counted. */
export async function groundworkLookup(call: Call, query: string, searchLimit: number, symbolsFetched: number) {
  const search = await call('search_code', { query, limit: searchLimit });
  const ids = [...search.matchAll(/^\[([^\]]+)\]/gm)].map((m) => m[1]!).slice(0, symbolsFetched);
  let firstPageTokens = 0, fullTokens = 0, calls = 1;
  const symbols: { id: string; title: string; file: string; lines: number; pages: number; complete: boolean }[] = [];
  for (const id of ids) {
    let offset = 0, pages = 0, complete = false, title = '';
    for (;;) {
      const text = await call('read_symbol', { symbol: id, offset });
      const tokens = countTokens(text);
      if (pages === 0) { firstPageTokens += tokens; title = text.split('\n')[0]!; }
      fullTokens += tokens; pages++; calls++;
      const next = /Next: read_symbol\((\{.*\})\)\s*$/.exec(text);
      if (!next) { complete = !/^Source is unavailable|^No exact symbol|^Ambiguous symbol/.test(text); break; }
      const nextOffset = Number((JSON.parse(next[1]!) as { offset?: number }).offset);
      if (!(nextOffset > offset)) throw new Error(`read_symbol paging did not advance for ${id}`);
      offset = nextOffset;
    }
    const at = / — (.+):\d+ \(definition lines (\d+)-(\d+);/.exec(title);
    symbols.push({ id, title, file: at?.[1] ?? '', lines: at ? Number(at[3]) - Number(at[2]) + 1 : 0, pages, complete });
  }
  const searchTokens = countTokens(search);
  return { tokens: searchTokens + fullTokens, searchTokens, fetchTokens: fullTokens, firstPageOnlyTokens: searchTokens + firstPageTokens, toolCalls: calls, hits: ids.length, symbols };
}

/** Disclosure only, not a relevance grade: a path with a test, example, docs or benchmark directory or a test file name. */
export const isSupportPath = (file: string): boolean =>
  /(^|\/)(tests?|__tests__|examples?|docs?|docs_src|benchmarks?|scripts)\//i.test(file) || /(^|\/)(test_[^/]*|[^/]*_test\.[a-z]+|[^/]*\.(test|spec)\.[a-z]+)$/i.test(file);

export const reduction = (tool: number, baseline: number): number => 1 - tool / baseline;
export const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();

function checkout(repo: Manifest['repos'][number], cache: string, setup: boolean): string {
  const dir = path.join(cache, repo.id.replace('/', '__'), repo.sha);
  if (!existsSync(path.join(dir, '.git'))) {
    if (!setup) throw new Error(`${repo.id}: missing pinned checkout at ${dir}. Rerun with --setup to clone it.`);
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q');
    git(dir, 'remote', 'add', 'origin', repo.url);
    git(dir, 'config', 'core.autocrlf', 'false');
    git(dir, 'fetch', '-q', '--depth=1', 'origin', repo.sha);
    git(dir, 'checkout', '-q', '--detach', repo.sha);
  }
  if (git(dir, 'rev-parse', 'HEAD') !== repo.sha) throw new Error(`${dir}: HEAD is not ${repo.sha}`);
  // The index lives in .groundwork/, which discovery never reads; anything else untracked would enter both corpora.
  if (git(dir, 'status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude).groundwork')) throw new Error(`${dir}: files differ from ${repo.sha}`);
  return dir;
}

async function run() {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const out = path.resolve(outAt < 0 ? path.join(HERE, 'results') : args[outAt + 1] ?? '');
  if (outAt >= 0 && !args[outAt + 1]) throw new Error('--out requires a directory');
  if (existsSync(out)) throw new Error(`Refusing to overwrite benchmark results: ${out}. Use --out <new directory>.`);
  const cache = path.resolve(process.env.GW_LOOKUP_REPOS_CACHE ?? path.join(os.homedir(), 'work/gw-lookup-repos'));
  if (cache === REPO || cache.startsWith(REPO + path.sep)) throw new Error('GW_LOOKUP_REPOS_CACHE must be outside the GroundWork repository.');
  const manifest = loadManifest();
  const tools = new Map(TOOLS.map((t) => [t.name, t]));
  const repos = [];
  for (const repo of manifest.repos) {
    const root = checkout(repo, cache, args.includes('--setup'));
    const config = defaultConfig();
    const started = performance.now();
    await refreshIndex(root, { config, full: true });
    const indexMs = Math.round(performance.now() - started);
    const db = openDb(indexDbPath(root), { readonly: true });
    try {
      const ctx: ToolContext = { root, config, db };
      const call: Call = async (name, input) => {
        const tool = tools.get(name);
        if (!tool) throw new Error(`Unknown tool ${name}`);
        return tool.handler(z.object(tool.inputSchema).parse(input), ctx);
      };
      const paths = db.prepare('SELECT path FROM files ORDER BY path').all().map((r) => String(r.path));
      const files = paths.map((p) => ({ path: p, text: readFileSync(path.join(root, p), 'utf8') }));
      const readAllTokens = files.reduce((sum, f) => sum + countTokens(f.text), 0);
      const stats = indexStats(db);
      const lookups = [];
      for (const query of manifest.queries) {
        const grep = grepTopN(files, query, manifest.grepFilesRead);
        const groundwork = await groundworkLookup(call, query, manifest.searchLimit, manifest.symbolsFetched);
        lookups.push({ query, readAllTokens, grep, groundwork, reductionVsGrep: reduction(groundwork.tokens, grep.tokens), reductionVsReadAll: reduction(groundwork.tokens, readAllTokens) });
      }
      repos.push({ id: repo.id, sha: repo.sha, indexMs, files: files.length, filesByLanguage: stats.filesByLanguage, filesSkipped: stats.filesSkipped, symbols: stats.symbols, readAllTokens, lookups });
    } finally { db.close(); }
  }
  const all = repos.flatMap((r) => r.lookups);
  const sum = (pick: (l: (typeof all)[number]) => number) => all.reduce((s, l) => s + pick(l), 0);
  const fetched = all.flatMap((l) => l.groundwork.symbols);
  const summary = {
    lookups: all.length,
    lookupsWithFullHits: all.filter((l) => l.groundwork.hits === manifest.symbolsFetched).length,
    meanReductionVsGrep: mean(all.map((l) => l.reductionVsGrep)),
    pooledReductionVsGrep: reduction(sum((l) => l.groundwork.tokens), sum((l) => l.grep.tokens)),
    pooledReductionVsReadAll: reduction(sum((l) => l.groundwork.tokens), sum((l) => l.readAllTokens)),
    meanReductionVsGrepFirstPageOnly: mean(all.map((l) => reduction(l.groundwork.firstPageOnlyTokens, l.grep.tokens))),
    groundworkTokens: sum((l) => l.groundwork.tokens), grepTokens: sum((l) => l.grep.tokens), readAllTokens: sum((l) => l.readAllTokens),
    meanToolCalls: mean(all.map((l) => l.groundwork.toolCalls)),
    symbolsFetched: fetched.length,
    symbolsInSupportPaths: fetched.filter((s) => isSupportPath(s.file)).length,
    symbolsOfThreeLinesOrFewer: fetched.filter((s) => s.lines <= 3).length,
    symbolsIncomplete: fetched.filter((s) => !s.complete).length,
  };
  const result = {
    groundworkCommit: git(REPO, 'rev-parse', 'HEAD'), groundworkDirty: Boolean(git(REPO, 'status', '--porcelain', '--untracked-files=no')),
    node: process.version, platform: `${os.platform()} ${os.arch()}`, tokenizer: manifest.tokenizer, embeddings: 'not installed (lexical search only)',
    manifest, summary, repos,
  };
  const pct = (n: number) => (100 * n).toFixed(1) + '%';
  const num = (n: number) => n.toLocaleString('en-US');
  const md = [
    '# Tokens per lookup: GroundWork vs grep-and-read', '',
    'Retrieval token cost only. This does not measure whether the returned symbols answer the query, task success, or speed. See README.md for the method and limits.', '',
    `GroundWork commit \`${result.groundworkCommit}\`${result.groundworkDirty ? ' (with uncommitted changes)' : ''}; ${result.node}; ${result.platform}; tokenizer \`${manifest.tokenizer}\`; embeddings not installed.`, '',
    '| | Value |', '| --- | ---: |',
    `| Lookups | ${summary.lookups} |`,
    `| Lookups that returned ${manifest.symbolsFetched} symbols | ${summary.lookupsWithFullHits} |`,
    `| **Mean reduction per lookup vs grep-top-${manifest.grepFilesRead}** | **${pct(summary.meanReductionVsGrep)}** |`,
    `| Reduction vs grep-top-${manifest.grepFilesRead}, pooled totals | ${pct(summary.pooledReductionVsGrep)} |`,
    `| Reduction vs read-all, pooled totals | ${pct(summary.pooledReductionVsReadAll)} |`,
    `| Mean reduction vs grep if only the first read_symbol page is counted | ${pct(summary.meanReductionVsGrepFirstPageOnly)} |`,
    `| GroundWork tokens, total | ${num(summary.groundworkTokens)} |`,
    `| Grep-top-${manifest.grepFilesRead} tokens, total | ${num(summary.grepTokens)} |`,
    `| Mean GroundWork tool calls per lookup | ${summary.meanToolCalls.toFixed(1)} |`,
    `| Symbols fetched | ${summary.symbolsFetched} |`,
    `| Fetched symbols in test, example, docs, benchmark or script paths | ${summary.symbolsInSupportPaths} |`,
    `| Fetched symbols of three lines or fewer | ${summary.symbolsOfThreeLinesOrFewer} |`,
    `| Fetched symbols whose source could not be read in full | ${summary.symbolsIncomplete} |`, '',
    ...repos.flatMap((r) => [
      `## ${r.id}`, '',
      `Commit \`${r.sha}\`; ${num(r.files)} files indexed (${Object.entries(r.filesByLanguage).map(([k, v]) => `${k} ${v}`).join(', ')}), ${num(r.filesSkipped)} skipped; ${num(r.symbols)} symbols; read-all ${num(r.readAllTokens)} tokens; index built in ${num(r.indexMs)} ms.`, '',
      `| Query | Grep-top-${manifest.grepFilesRead} tokens | GroundWork tokens | Search | Fetch | Symbols | Tool calls | Reduction vs grep |`, '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...r.lookups.map((l) => `| \`${l.query}\` | ${num(l.grep.tokens)} | ${num(l.groundwork.tokens)} | ${num(l.groundwork.searchTokens)} | ${num(l.groundwork.fetchTokens)} | ${l.groundwork.hits} | ${l.groundwork.toolCalls} | ${pct(l.reductionVsGrep)} |`), '',
      '<details><summary>Symbols fetched per query</summary>', '',
      ...r.lookups.flatMap((l) => [`- \`${l.query}\`: ${l.groundwork.symbols.map((s) => `\`${s.title.split(' — ')[0]!.replace(/^\[[^\]]+\] /, '')}\` ${s.file} (${s.lines} lines)`).join('; ')}`]), '',
      '</details>', '',
    ]),
  ].join('\n');
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(path.join(out, 'RESULTS.md'), md);
  console.log(md);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
