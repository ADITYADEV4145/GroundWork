import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { GroundworkConfig } from '../config/schema.js';
import { changedFromGit, type ChangedFile } from '../grounding/ranges.js';
import { DYNAMIC_TEXT } from '../grounding/verify.js';
import { discoverFiles } from '../index/discover.js';
import { readImpactState } from '../index/query.js';
import { adapterFor, languageForPath } from '../lang/index.js';
import { initParsers, parse } from '../lang/parser.js';
import type { ExtractedSymbol } from '../lang/adapter.js';
import type { Db } from '../store/db.js';
import { ImportResolver } from '../resolve/imports.js';
import { sha1 } from '../util/hash.js';
import { fitToBudget, estimateTokens } from '../util/tokens.js';
import { sessionEvidence } from './evidence.js';

export interface ImpactCaller { file: string; line: number; symbol: string; depth: number; confidence: string; changedFile: boolean; lookedAt: boolean }
export interface ImpactTest { file: string; command: string | null; ran: boolean }
export interface ImpactSymbol {
  id: string; name: string; file: string; line: number; deleted: boolean; signatureChanged: boolean;
  risk: 'high' | 'medium' | 'low'; callers: ImpactCaller[]; tests: ImpactTest[];
}
export interface ImpactReport { symbols: ImpactSymbol[]; complete: boolean; incompleteBecause: string[]; evidenceKnown: boolean; commandsObserved: number; ms: number }
export const isTestPath = (file: string) => /(^|\/)(__tests__|tests?)(\/|$)|\.(test|spec)\.[^.]+$|(^|\/)test_[^/]*\.py$|_test\.py$/.test(file);
const key = (s: { qualifiedName: string; kind: string }) => `${s.qualifiedName}:${s.kind}`;
const signature = (s: { signature: string; params: unknown; minArity: number; maxArity: number | null; exported: boolean }) => JSON.stringify([s.signature.replace(/\s+/g, ' ').trim(), s.params, s.minArity, s.maxArity, s.exported]);

function isPublicMethod(file: string, source: string, symbol: { name: string; startByte: number; endByte: number }): boolean {
  if (/^[_#]/.test(symbol.name)) return false;
  const language = languageForPath(file);
  if (!language || language === 'python') return true;
  const tree = parse(language, source);
  try {
    const node = tree.rootNode.descendantForIndex(symbol.startByte, symbol.endByte);
    const visibility = node?.namedChildren.find((child) => child?.type === 'accessibility_modifier')?.text;
    return visibility !== 'private' && visibility !== 'protected';
  } finally { tree.delete(); }
}

export async function changeImpact(db: Db, root: string, options: { base?: string; changed?: ChangedFile[]; sessionId?: string; config: GroundworkConfig }): Promise<ImpactReport> {
  const start = performance.now(), deadline = Date.now() + options.config.impact.timeoutMs;
  const reasons = new Set<string>();
  const report: ImpactReport = { symbols: [], complete: false, incompleteBecause: [], evidenceKnown: false, commandsObserved: 0, ms: 0 };
  const check = () => { if (Date.now() >= deadline) throw new Error('impact timeout'); };
  const git = (...args: string[]) => { check(); return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: Math.max(1, deadline - Date.now()), maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); };
  try {
    if (!options.config.impact.enabled) throw new Error('impact disabled');
    const base = git('rev-parse', '--verify', '--end-of-options', `${options.base ?? 'HEAD'}^{commit}`).trim();
    const state = readImpactState(db);
    const changed = options.changed ?? changedFromGit(root, base);
    const paths = new Set(changed.map((c) => c.file));
    if (!options.changed) for (const file of git('diff', '--name-only', base, '--').trim().split('\n').filter(Boolean)) paths.add(file);
    const evidence = sessionEvidence(root, options.sessionId);
    report.evidenceKnown = evidence.known; report.commandsObserved = evidence.commandsObserved;
    const files = new Map(state.files.map((f) => [f.file, f]));
    const discovered = new Set(discoverFiles(root, options.config));
    const involved = new Set([...paths].filter((file) => languageForPath(file)));
    const names = new Set<string>();
    const unresolvedImports = state.imports.filter((i) => !i.target && i.unresolvedReason !== 'external');
    await initParsers(); check();
    const selected: { symbol: typeof state.symbols[number]; deleted: boolean; signatureChanged: boolean; exportNames: string[]; publicMethod: boolean }[] = [];
    for (const file of paths) {
      check();
      if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) { reasons.add('unsafe changed path'); continue; }
      const language = languageForPath(file); if (!language) continue;
      let prior: ExtractedSymbol[] = [];
      let priorText = '';
      let priorAliases: { local: string; exported: string }[] = [];
      try {
        const source = git('show', `${base}:${file}`);
        priorText = source;
        if (Buffer.byteLength(source) > options.config.index.maxFileBytes) { reasons.add(`base file too large: ${file}`); continue; }
        const parsed = adapterFor(language).extract(source, language);
        prior = parsed.symbols; priorAliases = parsed.exportAliases; if (parsed.hasErrors) reasons.add(`unparsed base file: ${file}`);
      } catch {
        if (git('ls-tree', '--name-only', base, '--', file).trim()) reasons.add(`base unavailable: ${file}`);
      }
      const now = state.symbols.filter((s) => s.file === file);
      const currentText = existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : '';
      const currentAliases = adapterFor(language).extract(currentText, language).exportAliases;
      const aliases = (entries: typeof priorAliases, name: string) => entries.filter((a) => a.local === name).map((a) => a.exported).sort();
      if (new Set(now.map(key)).size !== now.length || new Set(prior.map(key)).size !== prior.length) reasons.add(`ambiguous symbol declarations: ${file}`);
      const ranges = changed.find((c) => c.file === file)?.ranges ?? [];
      for (const s of now) {
        const old = prior.find((p) => key(p) === key(s));
        const exportNames = aliases(priorAliases, s.name);
        const signatureChanged = !!old && (signature(s) !== signature(old) || JSON.stringify(exportNames) !== JSON.stringify(aliases(currentAliases, s.name)));
        const bodyChanged = !options.changed && old && priorText.slice(old.startByte, old.endByte) !== currentText.slice(s.startByte, s.endByte);
        if (bodyChanged || signatureChanged || changed.some((c) => c.file === file && c.ranges === null) || ranges.some(([a, b]) => s.line <= b && s.endLine >= a)) selected.push({ symbol: { ...s, exported: s.exported || !!old?.exported }, deleted: false, signatureChanged, exportNames, publicMethod: s.kind === 'method' && isPublicMethod(file, currentText, s) });
      }
      for (const old of prior.filter((s) => !now.some((n) => key(n) === key(s)))) selected.push({
        symbol: { ...old, id: `base:${file}:${key(old)}`, file, fileId: -1, line: old.startLine, endLine: old.endLine, parentId: null }, deleted: true, signatureChanged: true, exportNames: aliases(priorAliases, old.name), publicMethod: old.kind === 'method' && isPublicMethod(file, priorText, old),
      });
      if (discovered.has(file) && !files.has(file)) reasons.add(`changed file unindexed: ${file}`);
    }
    const selectedIds = new Set(selected.map((s) => s.symbol.id));
    for (const { symbol, exportNames } of selected) { names.add(symbol.name.split('.').at(-1)!); exportNames.forEach((name) => names.add(name)); }
    const virtualFiles = state.files.map((f) => ({ id: f.id, path: f.file, language: languageForPath(f.file) }));
    for (const file of new Set(selected.filter((s) => s.deleted).map((s) => s.symbol.file))) {
      if (!files.has(file)) virtualFiles.push({ id: -(virtualFiles.length + 1), path: file, language: languageForPath(file) });
    }
    const resolver = new ImportResolver(root, virtualFiles);
    for (const i of state.imports.filter((i) => !i.target)) {
      const resolved = i.file.endsWith('.py') ? resolver.resolvePy(i.file, i.module, i.name) : resolver.resolveTs(i.file, i.module);
      i.target = virtualFiles.find((f) => f.id === resolved.fileId)?.path ?? null;
    }
    const byId = new Map(state.symbols.map((s) => [s.id, s]));
    const test = (file: string): ImpactTest => ({ file, ran: evidence.ran(file), command: testCommand(root, file) });
    for (const { symbol: s, deleted, signatureChanged, exportNames, publicMethod } of selected) {
      check();
      const callers = new Map<string, ImpactCaller>(), tests = new Set<string>();
      const seen = new Set([s.id]);
      let frontier = [s];
      const incoming = (target: typeof s) => state.calls.filter((c) => {
        if (c.calleeId === target.id) return true;
        const terminal = c.calleeText.split('.').at(-1);
        if ((!c.calleeId || c.confidence === 'name-only') && terminal === target.name) return true;
        return (deleted || signatureChanged) && target.id === s.id && state.imports.some((i) => i.file === c.file && i.target === s.file && (i.name === s.name || exportNames.includes(i.name) || (s.isDefaultExport && i.name === 'default')) && (i.alias ?? i.name) === c.calleeText);
      });
      for (let depth = 1; depth <= options.config.impact.depth && frontier.length; depth++) {
        const next: typeof frontier = [];
        for (const target of frontier) for (const c of incoming(target)) {
          const caller = c.callerId ? byId.get(c.callerId) : undefined;
          involved.add(c.file);
          if (caller) names.add(caller.name.split('.').at(-1)!);
          if (!c.callerId || !selectedIds.has(c.callerId)) callers.set(`${c.file}:${c.line}`, {
            file: c.file, line: c.line, symbol: caller?.qualifiedName ?? '<module>', depth,
            confidence: c.calleeId === target.id ? c.confidence ?? 'unknown' : 'name-only', changedFile: paths.has(c.file), lookedAt: evidence.opened.has(c.file) || paths.has(c.file),
          });
          if (files.get(c.file)?.isTest || isTestPath(c.file)) tests.add(c.file);
          if (caller && !seen.has(caller.id)) { seen.add(caller.id); next.push(caller); }
        }
        frontier = next;
      }
      if (frontier.some((f) => incoming(f).some((c) => !c.callerId || !seen.has(c.callerId)))) reasons.add(`caller depth truncated: ${s.file}:${s.name}`);
      const reached = new Set([s.file]); let importFrontier = [s.file];
      for (let depth = 1; depth <= options.config.impact.depth && importFrontier.length; depth++) {
        const next: string[] = [];
        for (const i of state.imports) if (i.target && importFrontier.includes(i.target) && !reached.has(i.file)) {
          reached.add(i.file); next.push(i.file);
          involved.add(i.file);
          if (files.get(i.file)?.isTest || isTestPath(i.file)) tests.add(i.file);
        }
        importFrontier = next;
      }
      if (state.imports.some((i) => i.target && importFrontier.includes(i.target) && !reached.has(i.file))) reasons.add(`import depth truncated: ${s.file}`);
      const list = [...callers.values()].sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file) || a.line - b.line);
      const publicSymbol = s.kind === 'method' ? publicMethod : s.exported;
      const high = publicSymbol && (signatureChanged || deleted) && list.some((c) => !c.changedFile);
      report.symbols.push({ id: s.id, name: s.qualifiedName, file: s.file, line: s.line, deleted, signatureChanged,
        risk: high ? 'high' : list.length ? 'medium' : 'low', callers: list, tests: [...tests].sort().map(test) });
    }
    for (const file of involved) {
      check(); const indexed = files.get(file);
      if (!indexed) { if (existsSync(path.join(root, file))) reasons.add(`unindexed file: ${file}`); continue; }
      if (!discovered.has(file)) { reasons.add(`stale or excluded index file: ${file}`); continue; }
      const text = readFileSync(path.join(root, file), 'utf8');
      if (sha1(text) !== indexed.hash) reasons.add(`stale index: ${file}`);
      if (indexed.status !== 'ok') reasons.add(`unparsed file: ${file}`);
      if (DYNAMIC_TEXT.test(text)) reasons.add(`dynamic references: ${file}`);
    }
    if (state.calls.some((c) => (!c.calleeId || c.confidence === 'name-only') && names.has(c.calleeText.split('.').at(-1)!))) reasons.add('unresolved or name-only calls exist');
    if (unresolvedImports.some((i) => involved.has(i.file))) reasons.add('unresolved local imports exist');
    check();
    report.symbols.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.risk] - { high: 0, medium: 1, low: 2 }[b.risk]) || a.file.localeCompare(b.file) || a.line - b.line);
  } catch (error) { reasons.add((error as Error).message); }
  report.incompleteBecause = [...reasons]; report.complete = !reasons.size; report.ms = Number((performance.now() - start).toFixed(3));
  return report;
}

function testCommand(root: string, file: string): string | null {
  const quoted = `'${file.replaceAll("'", "'\\''")}'`;
  if (file.endsWith('.py')) return `pytest ${quoted}`;
  try {
    const p = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const deps = { ...p.dependencies, ...p.devDependencies };
    if (deps.vitest || /\bvitest\b/.test(p.scripts?.test ?? '')) return `npx vitest run ${quoted}`;
    if (deps.jest || /\bjest\b/.test(p.scripts?.test ?? '')) return `npx jest ${quoted}`;
  } catch { /* No inferred JavaScript runner. */ }
  return null;
}

export function impactLine(s: ImpactSymbol): string {
  const unseen = s.callers.filter((c) => !c.changedFile && !c.lookedAt);
  const tests = s.tests.filter((t) => !t.ran);
  return `${s.name}${s.deleted ? ' deleted' : s.signatureChanged ? ' signature changed' : ' changed'}; ${unseen.length} callers not updated or opened: ${unseen.map((c) => `${c.file}:${c.line}`).join(', ') || 'none'}; tests not run: ${tests.map((t) => t.file).join(', ') || 'none'}`;
}

export function renderImpact(report: ImpactReport, budget: number, stop = false): string {
  const symbols = stop ? report.symbols.filter((s) => s.risk !== 'low' && (s.callers.some((c) => !c.changedFile && !c.lookedAt) || s.tests.some((t) => !t.ran))) : report.symbols;
  if (stop && !symbols.length) return '';
  const render = (s: ImpactSymbol) => stop ? impactLine(s) : `${s.risk}: ${s.file}:${s.line} ${s.name}${s.deleted ? ' deleted' : s.signatureChanged ? ' signature changed' : ' changed'}; callers: ${s.callers.map((c) => `${c.file}:${c.line} (${c.confidence}, depth ${c.depth}, ${c.changedFile ? 'updated' : c.lookedAt ? 'opened' : 'not opened'})`).join(', ') || 'none'}; tests: ${s.tests.map((t) => `${t.file} (${t.ran ? 'run' : 'not run'}${t.command ? '; ' + t.command : ''})`).join(', ') || 'none'}`;
  const fit = fitToBudget(symbols, render, budget);
  const body = fit.items.map(render).join(stop ? ' | ' : '\n') || 'no changed symbols';
  let header = stop ? 'Groundwork impact: ' : `complete: ${report.complete}${report.complete ? ' (no further lookup changes this answer for this snapshot)' : '; ' + report.incompleteBecause.slice(0, 3).join('; ') + (report.incompleteBecause.length > 3 ? '; more reasons in --json' : '')}\n`;
  if (!stop && (fit.truncated || estimateTokens(header + body) > budget)) header = 'complete: false (output truncated; use gw impact --json)\n';
  let output = header + body;
  if (estimateTokens(output) > budget) output = Buffer.from(output).subarray(0, Math.max(0, (budget - 8) * 4)).toString('utf8') + '… [truncated]';
  return output;
}
