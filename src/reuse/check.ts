import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config/load.js';
import type { GroundworkConfig } from '../config/schema.js';
import { groundingGate, type Finding as GroundingFinding } from '../grounding/index.js';
import { looksGenerated } from '../index/discover.js';
import { readReuseState, type ReuseState } from '../index/query.js';
import { refreshIndex } from '../index/refresh.js';
import { indexDbPath } from '../index/store.js';
import { initParsers, languageForPath } from '../lang/index.js';
import { initSqlBackend, openDb } from '../store/db.js';
import { sha1 } from '../util/hash.js';
import { ensureGwDir } from '../util/paths.js';
import { estimateTokens, fitToBudget } from '../util/tokens.js';
import { git, readBase, symbolSource } from './base.js';
import { CandidateIndex } from './candidates.js';
import { allowReason, configName, inspectSource } from './inspection.js';
import { scoreSignals } from './model.js';
import { pairSignals, type Signals } from './signals.js';
import { canBlock } from './policy.js';
import type { EmbedderFactory } from './embeddings.js';
import { changedFromGit } from '../grounding/ranges.js';
import type { TypeCheckResult } from '../types/index.js';
import { log } from '../util/log.js';

type IndexedSymbol = ReuseState['symbols'][number];
type Literal = ReuseState['literals'][number] & { configish?: boolean };
export interface CheckLocation { file: string; symbol: string; line: number }
export interface CheckFinding {
  id: string;
  kind: 'duplicate' | 'dead-after-change' | 'duplicate-constant' | 'duplicate-file' | 'invalid-allow' | 'grounding';
  severity: 'BLOCK' | 'WARN';
  added: CheckLocation;
  existing: CheckLocation | null;
  signals: { name: string; value: number }[];
  probability?: number;
  fix: string;
  grounding?: GroundingFinding;
}
export interface CheckReport {
  status: 'BLOCK' | 'WARN' | 'PASS';
  blocked: boolean;
  base: string;
  findings: CheckFinding[];
  allows: { file: string; symbol: string; reason: string }[];
  ms: number;
  types?: TypeCheckResult;
}
export interface CheckOptions { base?: string; config?: GroundworkConfig; timeoutMs?: number; embeddingFactory?: EmbedderFactory; stopHook?: boolean }

const location = (s: IndexedSymbol): CheckLocation => ({ file: s.file, symbol: s.qualifiedName, line: s.line });
const order = (s: { file: string; line: number }) => `${s.file}\0${String(s.line).padStart(10, '0')}`;
const literalValue = (l: Pick<Literal, 'kind' | 'value'>) => {
  const number = Number(l.value.replace(/_/g, ''));
  return `${l.kind === 'number' ? 'number' : 'string'}:${l.kind === 'number' && Number.isFinite(number) ? number : l.value}`;
};

function topSignals(signals: Signals, score: ReturnType<typeof scoreSignals>): CheckFinding['signals'] {
  const keys: (keyof Signals)[] = ['bindingExact', 'vocabulary', 'structure', 'exact', 'paramCount', 'paramNames', 'returnType', 'name', 'contractCalls', 'contractReads', 'contractEarlyReturns', 'contractReturnShape', 'contractValidation'];
  return [...keys.sort((a, b) => (score.weights[b] ?? 0) * (signals[b] ?? 0) - (score.weights[a] ?? 0) * (signals[a] ?? 0)).slice(0, 2)
    .map((name) => ({ name, value: signals[name] ?? 0 })), ...(score.meaning ? [{ name: 'meaning', value: signals.meaning! }] : [])];
}

export function formatFinding(f: CheckFinding): string {
  const clean = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, ' ');
  if (f.grounding) return [
    `${f.severity} grounding (${f.grounding.kind}): ${clean(f.added.file)}:${f.added.line}`,
    `Why: ${clean(f.grounding.message)}${f.grounding.typeConfirmed ? ' (type-confirmed)' : ''}`,
    `Fix: ${clean(f.fix)}`,
  ].join('\n');
  const ref = (s: CheckLocation) => f.kind === 'duplicate-file' ? `${clean(s.file)}:${s.line}` : `${clean(s.symbol)} (${clean(s.file)}:${s.line})`;
  return [
    `${f.severity} ${f.kind}: ${ref(f.added)}`,
    `Existing: ${f.existing ? ref(f.existing) : 'no valid duplicate exemption'}`,
    `Why: ${f.signals.slice(0, 3).map((s) => `${s.name}=${Number(s.value.toFixed(3))}`).join(', ')}${f.probability === undefined ? '' : `; p=${f.probability.toFixed(3)}`}`,
    `Fix: ${clean(f.fix)}`,
  ].join('\n');
}

export function formatCheck(report: CheckReport): string {
  if (!report.findings.length) return 'PASS: no reuse findings.';
  const ranked = [...report.findings].sort((a, b) => Number(b.severity === 'BLOCK') - Number(a.severity === 'BLOCK'));
  const render = (finding: CheckFinding): string => {
    const full = formatFinding(finding);
    return estimateTokens(full) <= 460 ? full : `${finding.severity} ${finding.kind}: details exceed output budget; run gw check --json for the full finding.`;
  };
  const { items, truncated } = fitToBudget(ranked, render, 500);
  const output = items.map(render).join('\n\n');
  return truncated ? `${output}\n\n${truncated} more findings; run gw check --json for all findings.` : output;
}

/** Worktree (including staged and untracked files) versus a Git commit, never index versus index. */
export async function checkRepository(root: string, options: CheckOptions = {}): Promise<CheckReport> {
  const start = performance.now();
  let deadline = Date.now() + (options.timeoutMs ?? 30_000);
  const checkDeadline = () => { if (Date.now() >= deadline) throw new Error('reuse check timed out'); };
  const config = options.config ?? loadConfig(root);
  const commit = git(root, ['rev-parse', '--verify', '--end-of-options', `${options.base ?? 'HEAD'}^{commit}`], deadline).trim();
  await initSqlBackend();
  await refreshIndex(root, { config, lockTimeoutMs: Math.max(0, Math.min(100, deadline - Date.now())) });
  checkDeadline();
  await initParsers();
  const base = readBase(root, commit, config, deadline);
  const db = openDb(indexDbPath(root), { readonly: true });
  let state: ReuseState, candidates: CandidateIndex;
  let groundingFindings: GroundingFinding[] = [];
  try {
    state = readReuseState(db);
    candidates = new CandidateIndex(db, config.reuse.skipTests);
    if (config.grounding.enabled) groundingFindings = groundingGate(db, root, { base: commit, config }).findings;
  }
  finally { db.close(); }
  let types: TypeCheckResult | undefined;
  const collectTypes = async () => {
    if (!config.types.enabled || (options.stopHook && !config.types.stopGate)) return;
    const typeStart = Date.now();
    const { typeCheck } = await import('../types/index.js');
    types = await typeCheck(root, changedFromGit(root, commit), config, { base: commit, timeoutMs: options.stopHook ? config.types.timeoutMs : Math.max(1, Math.min(config.types.timeoutMs, deadline - Date.now())) });
    if (options.stopHook) deadline += Date.now() - typeStart;
    if (types.timedOut) log(root, 'warn', 'types_failed_open', { reason: 'timeout' });
    for (const f of types.findings) {
      const name = (value: string) => value.replace(/\(.*$/, '').split('.').at(-1);
      const existing = groundingFindings.find((g) => g.file === f.file && g.line === f.line && name(g.name) === name(f.name));
      if (existing) {
        existing.typeConfirmed = true;
        existing.typeBlocking ||= f.blocking;
        existing.blocking ||= f.blocking;
        const reported = findings.find((g) => g.grounding === existing);
        if (reported) reported.severity = existing.blocking ? 'BLOCK' : 'WARN';
      }
      else add({ kind: 'grounding', severity: f.blocking ? 'BLOCK' : 'WARN',
        added: { file: f.file, symbol: f.name, line: f.line }, existing: null,
        signals: [{ name: 'typeCheck', value: 1 }], fix: `Correct the type error: ${f.message}`,
        grounding: { ...f, kind: 'type', suggestions: [] } }, `${f.code}:${f.line}:${f.message}`);
    }
  };
  const oldFiles = new Map(base.state.files.map((f) => [f.file, f]));
  const changedFiles = new Set(state.files.filter((f) => f.hash !== oldFiles.get(f.file)?.hash).map((f) => f.file));
  const meaningStart = Date.now();
  try {
    await candidates.prepareMeaning(root, config, options.embeddingFactory, {
      deadline: meaningStart + (options.timeoutMs === undefined ? 30_000 : Math.max(0, Math.min(250, (deadline - meaningStart) / 10))),
      priorityFiles: changedFiles,
    });
  } catch {
    for (const symbol of candidates.symbols) delete symbol.embedding;
  } finally { if (options.timeoutMs === undefined) deadline += Math.max(0, Date.now() - meaningStart); }
  checkDeadline();
  const baseSymbols = new Map(base.state.symbols.map((s) => [s.id, s]));
  const symbols = new Map(state.symbols.map((s) => [s.id, s]));
  const texts = new Map<string, string>();
  const inspections = new Map<string, ReturnType<typeof inspectSource>>();
  const text = (file: string) => {
    if (!texts.has(file)) texts.set(file, readFileSync(path.join(root, file), 'utf8'));
    return texts.get(file)!;
  };
  const inspect = (file: string) => {
    if (!inspections.has(file)) inspections.set(file, inspectSource(text(file), languageForPath(file)!));
    return inspections.get(file)!;
  };
  const files = new Map(state.files.map((f) => [f.file, f]));
  const usableFile = (file: string) => {
    const f = files.get(file)!;
    return f.status === 'ok' && !(config.reuse.skipTests && f.isTest) && !f.isGenerated && !looksGenerated(file, text(file));
  };
  const candidateById = new Map(candidates.symbols.map((s) => [s.id, s]));
  const noise = (s: IndexedSymbol): boolean => {
    if (/^__.*__$/.test(s.name)) return true;
    if (s.parentId && /^__.*__$/.test(symbols.get(s.parentId)?.name ?? '')) return true;
    if (s.kind === 'constant' || s.kind === 'variable') return false;
    if (!candidateById.has(s.id)) return true;
    return s.kind === 'method' && inspect(s.file).trivialAccessors.some((span) => span.start >= s.startByte && span.end <= s.endByte);
  };
  const eligible = new Set(candidates.symbols.filter((s) => usableFile(s.file) && !noise(symbols.get(s.id)!)).map((s) => s.id));
  // A container made solely of excluded methods must not reintroduce that noise as a class clone.
  for (const s of state.symbols) if (['class', 'dataclass'].includes(s.kind)) {
    const members = state.symbols.filter((m) => m.parentId === s.id);
    if (members.length && members.every((m) => noise(m))) eligible.delete(s.id);
  }
  const changed = state.symbols.filter((s) => changedFiles.has(s.file) && usableFile(s.file) && !noise(s) &&
    (!['class', 'dataclass'].includes(s.kind) || eligible.has(s.id)) &&
    (!baseSymbols.has(s.id) || symbolSource(base.root, baseSymbols.get(s.id)!) !== text(s.file).slice(s.startByte, s.endByte)));
  const changedIds = new Set(changed.map((s) => s.id));
  const findings: CheckFinding[] = [];
  const allows: CheckReport['allows'] = [];
  const allowed = new Set<string>();
  const add = (finding: Omit<CheckFinding, 'id'>, detail = '') => {
    const id = sha1(JSON.stringify([finding.kind, finding.added.file, finding.added.symbol,
      finding.existing?.file, finding.existing?.symbol, detail]));
    if (!findings.some((f) => f.id === id)) findings.push({ id, ...finding });
  };
  for (const finding of groundingFindings) {
    const suggestion = finding.suggestions[0];
    add({ kind: 'grounding', severity: finding.blocking ? 'BLOCK' : 'WARN',
      added: { file: finding.file, symbol: finding.name, line: finding.line },
      existing: suggestion ? { file: suggestion.file, symbol: suggestion.name, line: suggestion.line } : null,
      signals: [{ name: 'groundingCheck', value: 1 }, { name: 'definiteError', value: Number(finding.blocking) }],
      fix: suggestion ? `Use ${suggestion.name} (${suggestion.file}:${suggestion.line}): ${suggestion.signature}.` :
        `Correct ${finding.name} to match the module exports and callable signature.`,
      grounding: finding }, `${finding.kind}:${finding.line}:${finding.message}`);
  }
  for (const s of changed) {
    const allow = allowReason(text(s.file), s, inspect(s.file));
    if (!allow) continue;
    if (allow.valid) {
      const entry = { file: s.file, symbol: s.qualifiedName, reason: allow.reason };
      appendFileSync(path.join(ensureGwDir(root, 'logs'), 'allows.jsonl'), JSON.stringify({ t: new Date().toISOString(), base: commit, ...entry }) + '\n');
      allows.push(entry); allowed.add(s.id);
    } else add({ kind: 'invalid-allow', severity: 'WARN', added: location(s), existing: null,
      signals: [{ name: 'specificReason', value: 0 }, { name: 'requiredMeaningfulWords', value: 3 }],
      fix: 'Remove the exemption and reuse the existing implementation, or give at least three meaningful words explaining the concrete constraint.' });
  }
  const exempt = (id: string | null): boolean => {
    if (!id) return false;
    if (allowed.has(id)) return true;
    return exempt(symbols.get(id)?.parentId ?? null);
  };
  const matches = new Map<string, { target: IndexedSymbol; p: number; signals: Signals; score: ReturnType<typeof scoreSignals> }>();
  const delegates = new Map<string, Set<string>>();
  for (const call of state.calls) {
    if (!call.callerId || !call.calleeId || !['exact', 'import-resolved'].includes(call.confidence ?? '')) continue;
    if (!delegates.has(call.callerId)) delegates.set(call.callerId, new Set());
    delegates.get(call.callerId)!.add(call.calleeId);
  }
  for (const s of changed) {
    checkDeadline();
    if (!eligible.has(s.id) || exempt(s.id)) continue;
    const query = candidateById.get(s.id)!;
    let best: { target: IndexedSymbol; p: number; signals: Signals; score: ReturnType<typeof scoreSignals> } | undefined;
    for (const candidate of candidates.find(query)) {
      if (!eligible.has(candidate.id) || (!baseSymbols.has(candidate.id) && order(candidate) >= order(s))) continue;
      if (delegates.get(s.id)?.has(candidate.id)) continue;
      const signals = pairSignals(query, candidate, candidates.idf);
      const score = scoreSignals(signals, query.embedding?.model);
      const p = score.probability;
      const blocking = p >= score.thresholds.block && canBlock(query, candidate, signals);
      const bestBlocking = best && best.p >= best.score.thresholds.block && canBlock(query, best.target, best.signals);
      if (!best || (blocking && !bestBlocking) || (blocking === !!bestBlocking && p > best.p)) best = { target: symbols.get(candidate.id)!, p, signals, score };
    }
    if (!best || best.p < best.score.thresholds.warn) continue;
    matches.set(s.id, best);
    add({ kind: 'duplicate', severity: best.p >= best.score.thresholds.block && canBlock(query, best.target, best.signals) ? 'BLOCK' : 'WARN', added: location(s), existing: location(best.target),
      probability: best.p, signals: topSignals(best.signals, best.score), fix: `Duplicate of ${best.target.qualifiedName}: REUSE it as-is or EXTEND/parameterize it instead of keeping both implementations.` });
  }
  const callKey = (c: ReuseState['calls'][number]) => `${c.file}\0${c.callerId ?? '<module>'}`;
  const currentCallers = new Map<string, ReuseState['calls']>();
  const priorCallers = new Map<string, ReuseState['calls']>();
  for (const [calls, groups] of [[state.calls, currentCallers], [base.state.calls, priorCallers]] as const)
    for (const c of calls) { const key = callKey(c); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(c); }
  for (const old of base.state.symbols) {
    if (!symbols.has(old.id) || !eligible.has(old.id) || state.calls.some((c) => c.calleeId === old.id)) continue;
    const prior = base.state.calls.filter((c) => c.calleeId === old.id && c.confidence !== 'name-only');
    const moved = new Map<string, number>();
    for (const call of prior) {
      const before = priorCallers.get(callKey(call))!;
      const after = currentCallers.get(callKey(call));
      if (!after || before.length !== after.length || !usableFile(call.file)) continue;
      const index = before.indexOf(call);
      const replacement = after[index]!;
      if (!replacement.calleeId || replacement.confidence === 'name-only' || !changedIds.has(replacement.calleeId) ||
        !eligible.has(replacement.calleeId) || exempt(replacement.calleeId) || replacement.argCount !== call.argCount) continue;
      if (!before.every((c, i) => c.calleeId === old.id ? after[i]?.calleeId === replacement.calleeId :
        c.calleeText === after[i]?.calleeText && c.calleeId === after[i]?.calleeId)) continue;
      moved.set(replacement.calleeId, (moved.get(replacement.calleeId) ?? 0) + 1);
    }
    const winner = [...moved].sort((a, b) => b[1] - a[1])[0];
    if (winner) add({ kind: 'dead-after-change', severity: 'BLOCK', added: location(symbols.get(winner[0])!), existing: location(symbols.get(old.id)!),
      signals: [{ name: 'baseCallersNowZero', value: prior.length }, { name: 'callersMoved', value: winner[1] }],
      fix: `Delete ${old.qualifiedName} and update its ${prior.length} callers to ${symbols.get(winner[0])!.qualifiedName}.` });
  }
  const literalsIn = (snapshot: ReuseState, directory: string): Literal[] => {
    const result: Literal[] = snapshot.literals.filter((l) => changedFiles.has(l.file)).map((l) => ({ ...l, configish: !!l.constName && configName(l.constName) }));
    for (const file of snapshot.files.filter((f) => changedFiles.has(f.file) && f.status === 'ok')) {
      const inspection = directory === root ? inspect(file.file) : inspectSource(readFileSync(path.join(directory, file.file), 'utf8'), languageForPath(file.file)!);
      for (const literal of inspection.literals) {
        const existing = result.find((l) => l.file === file.file && l.line === literal.line && literalValue(l) === literalValue(literal));
        if (existing) { existing.configish ||= literal.configish; continue; }
        const owner = snapshot.symbols.filter((s) => s.file === file.file && s.startByte <= literal.start && s.endByte >= literal.end)
          .sort((a, b) => (a.endByte - a.startByte) - (b.endByte - b.startByte))[0];
        result.push({ file: file.file, symbolId: owner?.id ?? null, value: literal.value, kind: literal.kind,
          line: literal.line, constName: null, configish: literal.configish });
      }
    }
    return result;
  };
  const beforeLiterals = new Map<string, number>();
  const literalKey = (l: Literal) => `${l.file}\0${l.symbolId ?? '<module>'}\0${literalValue(l)}`;
  for (const l of literalsIn(base.state, base.root)) { const key = literalKey(l); beforeLiterals.set(key, (beforeLiterals.get(key) ?? 0) + 1); }
  const isConstant = (l: Literal, owners: Map<string, IndexedSymbol>): boolean => {
    const owner = l.symbolId ? owners.get(l.symbolId) : null;
    const language = languageForPath(l.file);
    const containerKinds = language === 'java' ? ['class', 'interface'] : language === 'ruby' || language === 'csharp' ? ['class'] : [];
    const classConstant = owner?.parentId && containerKinds.includes(owners.get(owner.parentId)?.kind ?? '');
    return !!l.constName && owner?.kind === 'constant' && (owner.parentId === null || !!classConstant);
  };
  const baseConstants = new Set(base.state.literals.filter((l) => isConstant(l, baseSymbols)).map((l) => `${l.file}\0${l.constName}\0${literalValue(l)}`));
  const constants = state.literals.filter((l) => isConstant(l, symbols) && usableFile(l.file) && baseConstants.has(`${l.file}\0${l.constName}\0${literalValue(l)}`));
  for (const l of literalsIn(state, root)) {
    checkDeadline();
    const key = literalKey(l), previous = beforeLiterals.get(key) ?? 0;
    if (previous) { beforeLiterals.set(key, previous - 1); continue; }
    const owner = l.symbolId ? symbols.get(l.symbolId) : null;
    if (!usableFile(l.file) || exempt(l.symbolId) || (owner && (noise(owner) || (['class', 'dataclass'].includes(owner.kind) && !eligible.has(owner.id))))) continue;
    const target = constants.find((c) => literalValue(c) === literalValue(l) && !(c.file === l.file && c.line === l.line) &&
      (l.kind === 'number' ? configName(c.constName!) && l.configish : l.kind !== 'string' || configName(c.constName!) || l.configish));
    if (!target) continue;
    add({ kind: 'duplicate-constant', severity: 'BLOCK', added: { file: l.file, symbol: owner?.qualifiedName ?? '<module>', line: l.line },
      existing: { file: target.file, symbol: target.constName!, line: target.line },
      signals: [{ name: 'literalMatch', value: 1 }, { name: 'existingNamedConstant', value: 1 }],
      fix: `use ${target.constName} from ${target.file}` }, literalValue(l));
  }
  for (const file of state.files.filter((f) => !oldFiles.has(f.file) && usableFile(f.file))) {
    const members = changed.filter((s) => s.file === file.file && eligible.has(s.id) && !exempt(s.id));
    if (!members.length) continue;
    const targets = new Map<string, { count: number; blocks: number }>();
    for (const s of members) {
      const match = matches.get(s.id);
      if (!match || match.target.file === file.file || !oldFiles.has(match.target.file)) continue;
      const group = targets.get(match.target.file) ?? { count: 0, blocks: 0 };
      group.count++; if (match.p >= match.score.thresholds.block && canBlock(s, match.target, match.signals)) group.blocks++;
      targets.set(match.target.file, group);
    }
    for (const [existing, group] of [...targets].sort((a, b) => b[1].count - a[1].count).slice(0, 1)) {
      const filenameHint = /(?:\d+|_v\d+)\.[^.]+$/.test(file.file) || path.basename(existing) === path.basename(file.file);
      const overlap = group.count / members.length;
      if (overlap < (filenameHint ? 0.6 : 0.8)) continue;
      const callers = state.calls.filter((c) => c.calleeId && members.some((m) => m.id === c.calleeId)).length;
      add({ kind: 'duplicate-file', severity: group.blocks / members.length >= 0.8 ? 'BLOCK' : 'WARN',
        added: { file: file.file, symbol: file.file, line: 1 }, existing: { file: existing, symbol: existing, line: 1 },
        signals: [{ name: 'symbolOverlap', value: overlap }, { name: 'versionOrSameBasename', value: Number(filenameHint) }],
        fix: callers ? `Delete ${file.file} and update its ${callers} caller${callers === 1 ? '' : 's'} to use ${existing}.` : `Delete ${file.file}; use ${existing} instead.` });
    }
  }
  checkDeadline();
  await collectTypes();
  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'BLOCK' ? -1 : 1) || a.added.file.localeCompare(b.added.file) || a.added.line - b.added.line || a.kind.localeCompare(b.kind));
  const blocked = findings.some((f) => f.severity === 'BLOCK');
  checkDeadline();
  return { status: blocked ? 'BLOCK' : findings.length ? 'WARN' : 'PASS', blocked, base: commit, findings, allows, ms: performance.now() - start, types };
}
