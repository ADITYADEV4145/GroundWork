import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adapterFor, languageForPath } from '../src/lang/index.js';
import { initParsers, parse } from '../src/lang/parser.js';
import type { ExtractedSymbol, ExtractResult } from '../src/lang/adapter.js';
import { pairSignals } from '../src/reuse/signals.js';
import { relatedSymbols } from '../src/reuse/policy.js';
import manifest from '../bench/real-history/dev/repos.json' with { type: 'json' };

export const evidenceDir = path.resolve(fileURLToPath(new URL('../bench/real-history/dev/', import.meta.url)));
export const cacheDir = path.resolve(process.env.GW_REAL_HISTORY_CACHE ?? path.join(os.homedir(), 'work/gw-real-history'));
const project = path.resolve(evidenceDir, '../../..');
export function assertExternalCache(cache: string, root = project) {
  const canonical = (candidate: string) => {
    let parent = path.resolve(candidate);
    const missing: string[] = [];
    while (!existsSync(parent)) { missing.unshift(path.basename(parent)); parent = path.dirname(parent); }
    return path.join(realpathSync(parent), ...missing);
  };
  const resolved = canonical(cache), repository = canonical(root);
  if (resolved === repository || resolved.startsWith(repository + path.sep)) throw new Error('GW_REAL_HISTORY_CACHE must be outside the GroundWork repository.');
}
assertExternalCache(cacheDir);
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const git = (repo: string, ...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
export type Ref = { revision: string; file: string; symbol: string; line: number; endLine: number; kind: string; sha256: string };
type Site = { ref: Ref; symbol: ExtractedSymbol; body: string; calls: string[]; statements: number; file: string };
export type Proposal = { id: string; repo: string; commit: string; subject: string; method: string; a: Ref; b: Ref; after: Ref[]; structure: number; exact: number };
const production = (f: string) => /\.(?:py|tsx?)$/.test(f) && !/(?:^|\/)(?:tests?|__tests__|docs?|examples?|benchmarks?|fixtures|__snapshots__)(?:\/|$)|(?:\.test|\.spec|\.d)\.tsx?$/.test(f);
const testFile = (f: string) => /\.(?:py|tsx?)$/.test(f) && /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|(?:\.test|\.spec)\.tsx?$/.test(f);

function setup() {
  mkdirSync(cacheDir, { recursive: true });
  for (const pin of manifest.repos) {
    const repo = path.join(cacheDir, pin.id);
    if (!existsSync(repo)) execFileSync('git', ['clone', pin.url, repo], { stdio: 'inherit' });
    for (const revision of [pin.start, pin.end]) git(repo, 'cat-file', '-e', `${revision}^{commit}`);
    if (git(repo, 'rev-parse', '--is-shallow-repository').trim() !== 'false') throw new Error(`Unshallow ${repo} before mining.`);
    git(repo, 'show', `${pin.end}:${pin.licenseFile}`);
    git(repo, 'switch', '--detach', pin.end);
  }
  const legacy = path.join(cacheDir, 'permissive-detector');
  if (!existsSync(legacy)) git(project, 'worktree', 'add', '--detach', legacy, manifest.permissiveDetector);
  if (git(legacy, 'rev-parse', 'HEAD').trim() !== git(project, 'rev-parse', manifest.permissiveDetector).trim()) throw new Error('Unexpected permissive detector revision.');
  console.log(`Pinned external clones ready. Before replay, install dependencies and build ${legacy}. No source is copied into GroundWork.`);
}

function repairLocations() {
  const cache = new Map<string, ExtractResult>();
  let total = 0;
  for (const filename of readdirSync(evidenceDir).filter((f) => /-mining\.json$/.test(f))) {
    const input = JSON.parse(readFileSync(path.join(evidenceDir, filename), 'utf8')) as { repo: string; proposals: Proposal[] };
    for (const proposal of input.proposals) for (const ref of [proposal.a, proposal.b, ...proposal.after]) {
      const key = `${ref.revision}:${ref.file}`;
      const source = git(path.join(cacheDir, input.repo), 'show', key), language = languageForPath(ref.file)!;
      if (!cache.has(key)) cache.set(key, adapterFor(language).extract(source, language));
      const symbols = cache.get(key)!.symbols.filter((s) => s.qualifiedName === ref.symbol && s.endLine === ref.endLine && digest(source.slice(s.startByte, s.endByte)) === ref.sha256);
      if (symbols.length !== 1) throw new Error(`Ambiguous mining reference: ${JSON.stringify(ref)}`);
      ref.line = symbols[0]!.startLine; ref.endLine = symbols[0]!.endLine; total++;
    }
    writeFileSync(path.join(evidenceDir, filename), JSON.stringify(input, null, 2) + '\n'); cache.clear();
  }
  console.log(`Mining metadata: ${total} source locations and hashes verified`);
}

function sites(repo: string, revision: string, file: string): Site[] {
  const lang = languageForPath(file);
  if (!lang) return [];
  let source: string;
  try { source = git(repo, 'show', `${revision}:${file}`); } catch { return []; }
  const limit = manifest.repos.find((r) => r.id === path.basename(repo))?.maxMiningSourceBytes;
  if (limit && Buffer.byteLength(source) > limit) { skippedOversize.add(`${revision}:${file}`); return []; }
  const extracted = adapterFor(lang).extract(source, lang);
  if (extracted.hasErrors) return [];
  const tree = parse(lang, source);
  try {
    return extracted.symbols.filter((s) => ['function', 'method'].includes(s.kind)).flatMap((s) => {
      const node = tree.rootNode.descendantsOfType(['function_definition', 'function_declaration', 'method_definition', 'arrow_function', 'function_expression', 'generator_function_declaration'])
        .filter((n) => n.startIndex >= s.startByte && n.endIndex <= s.endByte).sort((a, b) => (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex))[0];
      const body = node?.childForFieldName('body');
      if (!body) return [];
      const statements = body.namedChildren.filter((n) => n && n.type !== 'comment' && !(n.type === 'expression_statement' && n.firstNamedChild?.type === 'string')).length;
      const calls = body.descendantsOfType(['call', 'call_expression']).flatMap((n) => {
        const callee = n.childForFieldName('function'); return callee ? [callee.text.split('.').at(-1)!] : [];
      });
      return [{ ref: { revision, file, symbol: s.qualifiedName, line: s.startLine, endLine: s.endLine, kind: s.kind, sha256: digest(source.slice(s.startByte, s.endByte)) },
        symbol: s, body: body.text.replace(/(?:"""[\s\S]*?"""|'''[\s\S]*?''')/g, ''), calls, statements, file }];
    });
  } finally { tree.delete(); }
}

const skippedOversize = new Set<string>();

export function commits(repo: string, start: string, end: string, since = manifest.startUtc, until = manifest.endUtcExclusive) {
  if (git(repo, 'rev-parse', '--is-shallow-repository').trim() !== 'false') throw new Error('Unshallow the development clone before mining.');
  return git(repo, 'log', '--reverse', '--no-merges', '--format=%H%x09%P%x09%cI%x09%s', `${start}..${end}`).trim().split('\n').filter(Boolean)
    .map((s) => { const [hash, parents, date, subject] = s.split('\t'); return { hash: hash!, parent: parents!.split(' ')[0]!, date: date!, subject: subject! }; })
    .filter((c) => Date.parse(c.date) >= Date.parse(since) && Date.parse(c.date) < Date.parse(until));
}

export async function mine(id: string, tests = false) {
  await initParsers();
  const pin = manifest.repos.find((r) => r.id === id)!;
  const repo = path.join(cacheDir, id);
  const history = commits(repo, pin.start, pin.end, pin.startUtc ?? manifest.startUtc, pin.endUtcExclusive ?? manifest.endUtcExclusive).filter((c) => !tests || /parametr|reuse|duplic|simplif|clean|consolid|refactor|helper|merge|reduc/i.test(c.subject));
  const proposals: Proposal[] = [], audit = [];
  const start = performance.now();
  for (const [i, c] of history.entries()) {
    const changes = git(repo, 'diff-tree', '--no-commit-id', '--name-status', '-r', '--no-renames', c.hash).trim().split('\n')
      .map((s) => s.split('\t')).filter(([, f]) => f && (tests ? testFile(f) : production(f)));
    const old = changes.filter(([status]) => status !== 'A').flatMap(([, f]) => sites(repo, c.parent, f!));
    const next = changes.filter(([status]) => status !== 'D').flatMap(([, f]) => sites(repo, c.hash, f!));
    const key = (s: Site) => `${s.file}\0${s.ref.symbol}`;
    const oldKeys = new Set(old.map(key));
    const nextKeys = new Map(next.map((s) => [key(s), s]));
    const added = (method: string, a: Site, b: Site, after: Ref[]) => {
      if (key(a) === key(b) || relatedSymbols({ ...a.symbol, file: a.file }, { ...b.symbol, file: b.file })) return;
      const signals = pairSignals(a.symbol, b.symbol, new Map());
      const id = `${pin.id}-${digest([c.hash, key(a), key(b)].join('\0')).slice(0, 12)}`;
      if (proposals.some((p) => p.id === id)) return;
      proposals.push({ id, repo: pin.id, commit: c.hash, subject: c.subject, method, a: a.ref, b: b.ref, after, structure: signals.structure, exact: signals.exact });
    };
    const shortened = old.flatMap((a) => {
      const n = nextKeys.get(key(a));
      return n && old.filter((s) => key(s) === key(a)).length === 1 && a.body.length >= 80 && n.body.length < a.body.length * 0.7 && n.body.length < 1000 && n.statements <= 5 && n.calls.length ? [{ a, n }] : [];
    });
    const diff = git(repo, 'diff', '--unified=0', c.parent, c.hash, '--', ...changes.map(([, f]) => f!));
    const additions = diff.split('\n').filter((s) => s.startsWith('+') && !s.startsWith('+++')).join('\n');
    const removed = old.filter((a) => !nextKeys.has(key(a)) && a.body.length >= 80 && !next.some((n) => n.file === a.file && n.symbol.name === a.symbol.name && n.symbol.fingerprint?.normHash === a.symbol.fingerprint?.normHash));
    const names = new Set(shortened.flatMap(({ n }) => n.calls));
    if (removed.length) for (const match of additions.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) names.add(match[1]!);
    for (const name of ['list', 'dict', 'tuple', 'set', 'len', 'str', 'int', 'bool', 'float', 'range', 'super', 'type', 'isinstance', 'getattr', 'setattr', 'get', 'append', 'update', 'pop', 'items', 'join', 'map', 'filter']) names.delete(name);
    const extra: Site[] = [];
    if (names.size) {
      const pattern = `(^|[[:space:]])(def |function |const |let )(${[...names].filter((s) => /^\w+$/.test(s)).join('|')})[[:space:]]*[(<:=]`;
      const matches = spawnSync('git', ['-C', repo, 'grep', '-l', '-E', pattern, c.parent, '--', '*.py', '*.ts', '*.tsx'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      if (matches.status !== 0 && matches.status !== 1) throw new Error(matches.stderr);
      const known = new Set(changes.map(([, f]) => f!));
      for (const line of matches.stdout.trim().split('\n').filter(Boolean)) {
        const file = line.slice(c.parent.length + 1);
        if (!known.has(file) && (production(file) || tests && testFile(file))) extra.push(...sites(repo, c.parent, file));
      }
    }
    const bank = [...old, ...extra];
    for (const { a, n } of shortened) for (const b of bank.filter((b) => !/^__.*__$/.test(b.symbol.name) && n.calls.includes(b.symbol.name))) added('shortened-to-existing-call', a, b, [n.ref]);
    for (const a of removed) {
      const choices = bank.filter((b) => !/^__.*__$/.test(b.symbol.name) && (nextKeys.has(key(b)) || extra.includes(b)) && additions.includes(b.symbol.name + '('))
        .map((b) => ({ b, score: pairSignals(a.symbol, b.symbol, new Map()).structure })).filter((p) => p.score >= 0.35).sort((a, b) => b.score - a.score).slice(0, 2);
      for (const { b } of choices) added('removed-with-existing-call-added', a, b, [nextKeys.get(key(b))?.ref ?? { ...b.ref, revision: c.hash }]);
    }
    for (const helper of next.filter((s) => !oldKeys.has(key(s)))) {
      const callers = shortened.filter(({ n }) => n.calls.includes(helper.symbol.name));
      for (let x = 0; x < callers.length; x++) for (let y = x + 1; y < callers.length; y++) {
        const a = callers[x]!, b = callers[y]!;
        if (pairSignals(a.a.symbol, b.a.symbol, new Map()).structure >= 0.25) added('two-bodies-to-new-helper', a.a, b.a, [a.n.ref, b.n.ref, helper.ref]);
      }
      if (!/^__.*__$/.test(helper.symbol.name) && next.some((n) => n !== helper && n.calls.includes(helper.symbol.name))) {
        const donors = removed.map((a) => ({ a, similarity: pairSignals(a.symbol, helper.symbol, new Map()).structure }))
          .filter((p) => p.similarity >= 0.6).sort((a, b) => b.similarity - a.similarity).slice(0, 6);
        for (let x = 0; x < donors.length; x++) for (let y = x + 1; y < donors.length; y++) {
          const a = donors[x]!.a, b = donors[y]!.a;
          if (pairSignals(a.symbol, b.symbol, new Map()).structure >= 0.35) added('removed-bodies-merged-to-new-helper', a, b, [helper.ref]);
        }
      }
    }
    audit.push({ ...c, productionFiles: changes.map(([, f]) => f!), keyword: /dedup|consolidat|reuse|extract|refactor|duplicat|simplif/i.test(c.subject), proposals: proposals.filter((p) => p.commit === c.hash).length });
    if (i % 50 === 0) console.log(`${id}: ${i}/${history.length}, ${proposals.length} proposals`);
  }
  writeFileSync(path.join(evidenceDir, `${id}-${tests ? 'test-' : ''}mining.json`), JSON.stringify({ repo: id, start: pin.start, end: pin.end, sampling: tests ? 'Test paths only, commits selected by refactor/parameterize/cleanup/helper/reduce keywords; supplementary, not production detector recall.' : 'All eligible non-merge commits, production TS/Python paths; configured oversize source exclusions recorded separately.', maxMiningSourceBytes: pin.maxMiningSourceBytes ?? null, skippedOversize: [...skippedOversize], ms: performance.now() - start, commits: audit, proposals }, null, 2) + '\n');
  console.log(`${id}: ${history.length} commits, ${proposals.length} proposals`);
}

async function replay(id: string) {
  const pin = manifest.repos.find((r) => r.id === id)!;
  const repo = path.join(cacheDir, id), worktree = path.join(cacheDir, `${id}-normal`);
  if (!existsSync(worktree)) git(repo, 'worktree', 'add', '--detach', worktree, pin.end);
  const miningFile = path.join(evidenceDir, `${id}-mining.json`);
  const mining = existsSync(miningFile) ? JSON.parse(readFileSync(miningFile, 'utf8')) : { commits: commits(repo, pin.start, pin.end, pin.startUtc ?? manifest.startUtc, pin.endUtcExclusive ?? manifest.endUtcExclusive).map((c) => ({ ...c,
    keyword: /dedup|consolidat|reuse|extract|refactor|duplicat|simplif/i.test(c.subject),
    productionFiles: git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', c.hash).trim().split('\n').filter(production) })) };
  const limit = Number(process.env.GW_REAL_HISTORY_NORMAL_LIMIT ?? (['django', 'scikit-learn'].includes(id) ? 4 : 12));
  if (!Number.isInteger(limit) || limit < 1) throw new Error('GW_REAL_HISTORY_NORMAL_LIMIT must be a positive integer');
  const selected = (mining.commits as { hash: string; parent: string; subject: string; keyword: boolean; productionFiles: string[] }[])
    .filter((c) => !c.keyword && c.productionFiles.length).sort((a, b) => digest(`normal-v1:${a.hash}`).localeCompare(digest(`normal-v1:${b.hash}`))).slice(0, limit);
  const results = [];
  for (const c of selected) {
    git(worktree, 'switch', '--detach', c.hash);
    const start = performance.now();
    const driver = `const { checkRepository } = await import(${JSON.stringify(pathToFileURL(path.join(cacheDir, 'permissive-detector/dist/reuse/check.js')).href)});\ntry { const report = await checkRepository(${JSON.stringify(worktree)}, { base: ${JSON.stringify(c.parent)}, timeoutMs: 120000 }); console.log(JSON.stringify(report)); process.exitCode = report.blocked ? 1 : 0; } catch(e) { console.log(JSON.stringify({status:'UNAVAILABLE', findings:[], error:e.message})); }`;
    const run = spawnSync(process.execPath, ['--input-type=module', '--eval', driver], { encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
    let report;
    try { report = JSON.parse(run.stdout); } catch {
      if (!run.error && !run.signal) throw new Error(`${id} ${c.hash}: invalid checker JSON: ${run.stderr}`);
      report = { status: 'UNAVAILABLE', findings: [], error: String(run.error ?? run.signal) };
    }
    if (!Array.isArray(report.findings) || report.status !== 'UNAVAILABLE' && (run.error || ![0, 1].includes(run.status!))) throw new Error(`${id}: invalid check run`);
    results.push({ ...c, driver: 'built checkRepository API, timeoutMs=120000 (decision logic unchanged)', ms: performance.now() - start, exitCode: run.status, report });
    writeFileSync(path.join(evidenceDir, `${id}-normal.json`), JSON.stringify({ repo: id, detector: git(path.join(cacheDir, 'permissive-detector'), 'rev-parse', 'HEAD').trim(), sampling: `Up to ${limit} non-keyword commits with production changes; smallest SHA256(normal-v1:<commit>) from all eligible commits, independent of findings.`, runs: results }, null, 2) + '\n');
    console.log(`${id}: ${results.length}/${selected.length}, ${report.findings.length} findings, ${Math.round(performance.now() - start)} ms`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , command, id] = process.argv;
  mkdirSync(evidenceDir, { recursive: true });
  if (command === 'setup') setup();
  else if (command === 'repair-locations') { await initParsers(); repairLocations(); }
  else if (!manifest.repos.some((r) => r.id === id)) throw new Error('Choose a pinned development repo.');
  else if (command === 'mine') await mine(id!);
  else if (command === 'mine-tests') await mine(id!, true);
  else if (command === 'replay') await replay(id!);
  else throw new Error('Usage: node --import tsx scripts/real-history-dev.ts setup|repair-locations|mine|mine-tests|replay [repo]');
}
