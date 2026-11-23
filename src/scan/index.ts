import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { GroundworkConfig } from '../config/schema.js';
import { verifyChanged, verifyFile, type ChangedFile, type Finding, type LineRange } from '../grounding/index.js';
import { readFingerprintedSymbols, readReuseState } from '../index/query.js';
import { configName } from '../reuse/inspection.js';
import type { Db } from '../store/db.js';
import { VERSION } from '../util/version.js';

export type ScanKind = 'invented-call' | 'wrong-arguments' | 'duplicate-logic' | 'duplicate-constant' | 'dead-code' | 'type-error';
export type Confidence = 'high' | 'medium' | 'low';
export interface ScanFinding {
  kind: ScanKind;
  confidence: Confidence;
  file: string;
  line: number;
  message: string;
  /** The real symbol to use instead, when one is known. */
  suggestion: string | null;
}
export interface ScanReport {
  mode: 'repository' | 'diff';
  files: number;
  filesUnchecked: number;
  counts: Record<ScanKind, number>;
  /** High and medium confidence, most certain first. */
  findings: ScanFinding[];
  /** Low confidence: worth a look, not asserted. */
  check: ScanFinding[];
  /** Checks that could not run, so their zero count is not a pass. */
  skipped: string[];
  ms: number;
}

export const SCAN_KINDS: ScanKind[] = ['invented-call', 'wrong-arguments', 'duplicate-logic', 'duplicate-constant', 'dead-code', 'type-error'];
const LABEL: Record<ScanKind, string> = {
  'invented-call': 'invented calls', 'wrong-arguments': 'wrong arguments', 'duplicate-logic': 'duplicated logic',
  'duplicate-constant': 'duplicate constants', 'dead-code': 'dead code', 'type-error': 'type errors',
};
const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
/** Bodies smaller than this repeat by coincidence (getters, one-line wrappers). */
const MIN_DUPLICATE_TOKENS = 40;

function fromGrounding(f: Finding): ScanFinding {
  const kind: ScanKind = f.kind === 'type' ? 'type-error' : f.kind === 'arity' || f.kind === 'unknown-keyword' ? 'wrong-arguments' : 'invented-call';
  const best = f.suggestions[0];
  return {
    kind, confidence: f.blocking || f.typeConfirmed ? 'high' : 'low', file: f.file, line: f.line, message: best ? f.message.replace(/\.? Did you mean .*$/s, '.') : f.message,
    suggestion: best ? `${best.qualifiedName} (${best.file}:${best.line})` : null,
  };
}

/** Unified diff to the added lines of each file it touches; context and removed lines are not part of the change. */
export function changedFromDiff(diff: string): ChangedFile[] {
  const files = new Map<string, LineRange[]>();
  // The hunk header's counts say where a hunk ends, so a following `--- a/file` header is not read as a removed line.
  let current: LineRange[] | null = null, next = 0, oldLeft = 0, newLeft = 0;
  for (const line of diff.split('\n')) {
    if (oldLeft > 0 || newLeft > 0) {
      if (line[0] === '\\') continue;
      if (line[0] === '-') { oldLeft--; continue; }
      if (line[0] === '+' && current) {
        const last = current.at(-1);
        if (last && last[1] === next - 1) last[1] = next; else current.push([next, next]);
      }
      if (line[0] !== '+') oldLeft--;
      newLeft--; next++;
      continue;
    }
    const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) { oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]); next = Number(hunk[2]); newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]); continue; }
    const file = /^\+\+\+ (?:b\/)?(.+?)(?:\t.*)?$/.exec(line);
    if (file) current = file[1] === '/dev/null' ? null : (files.get(file[1]!) ?? files.set(file[1]!, []).get(file[1]!)!);
  }
  return [...files].filter(([, ranges]) => ranges.length).map(([file, ranges]) => ({ file, ranges }));
}

export interface ScanOptions { config: GroundworkConfig; changed?: ChangedFile[]; base?: string }

/**
 * A function nothing in the repository calls by name but that a runtime or test harness runs: Go's `init`, `main` and
 * `Test…` functions, Rust's `main`, and any function declared under an attribute or decorator (`#[test]`, `#[bench]`, `@app.route`).
 */
function runByFramework(file: string, name: string, source: string, line: number): boolean {
  if (file.endsWith('.go') && /^(init|main|(Test|Benchmark|Fuzz|Example)(_.*|[A-Z0-9].*)?)$/.test(name)) return true;
  if (file.endsWith('.rs') && name === 'main') return true;
  const lines = source.split('\n');
  const marker = (text: string) => text.startsWith('#[') || text.startsWith('@');
  // Python's indexed span starts on the decorator, and an attribute can share the declaration's line.
  if (marker((lines[line - 1] ?? '').trim())) return true;
  for (let i = line - 2; i >= 0; i--) {
    const above = lines[i]!.trim();
    if (above === '' || above.startsWith('//')) continue;
    return marker(above);
  }
  return false;
}

export async function scanRepository(db: Db, root: string, options: ScanOptions): Promise<ScanReport> {
  const start = performance.now();
  const { config, changed } = options;
  const all: ScanFinding[] = [];
  const skipped: string[] = [];
  const state = readReuseState(db);
  const usable = (f: { isTest: boolean; isGenerated: boolean; status: string }) => !f.isTest && !f.isGenerated && f.status === 'ok';
  const ranges = changed ? new Map(changed.map((c) => [c.file, c.ranges])) : null;
  /** In a diff scan only what the change itself touches is reported; the rest of the repository was like that before. */
  const touched = (file: string, from: number, to = from) => !ranges || (ranges.has(file) && (ranges.get(file) ?? [[0, Infinity]]).some(([a, b]) => from <= b && to >= a));
  const results = changed ? verifyChanged(db, root, changed, config) : state.files.filter(usable).map((f) => verifyFile(db, root, f.file, { config }));
  for (const result of results) all.push(...result.findings.map(fromGrounding));

  if (changed) {
    if (!config.types.enabled) skipped.push('type errors: types.enabled is off');
    else {
      try {
        const { typeCheck } = await import('../types/index.js');
        const types = await typeCheck(root, changed, config, { base: options.base, timeoutMs: config.types.timeoutMs });
        if (types.timedOut) skipped.push('type errors: the type checker timed out');
        for (const f of types.findings) {
          if (!f.preExisting && !all.some((g) => g.file === f.file && g.line === f.line)) all.push({ kind: 'type-error', confidence: f.blocking ? 'high' : 'medium', file: f.file, line: f.line, message: f.message, suggestion: null });
        }
      } catch (error) { skipped.push(`type errors: ${(error as Error).message}`); }
    }
  } else skipped.push('type errors: only checked on the changed lines of a diff');

  const symbols = readFingerprintedSymbols(db).filter((s) => !s.isTest && !s.isGenerated && ['function', 'method', 'component'].includes(s.kind));
  const groups = new Map<string, typeof symbols>();
  for (const s of symbols) {
    if (s.fingerprint.tokenCount < MIN_DUPLICATE_TOKENS) continue;
    const group = groups.get(s.fingerprint.normHash) ?? [];
    group.push(s); groups.set(s.fingerprint.normHash, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // The copy is whichever one the change wrote; an untouched symbol is the original to point at.
    const original = group.find((s) => !touched(s.file, s.line, s.endLine)) ?? group[0]!;
    for (const copy of group) {
      if (copy === original || !touched(copy.file, copy.line, copy.endLine)) continue;
      all.push({ kind: 'duplicate-logic', confidence: 'high', file: copy.file, line: copy.line,
        message: `${copy.qualifiedName} has the same body as ${original.qualifiedName}.`, suggestion: `${original.qualifiedName} (${original.file}:${original.line})` });
    }
  }

  const owners = new Map(state.symbols.map((s) => [s.id, s]));
  const fileOk = new Map(state.files.map((f) => [f.file, usable(f)]));
  const constants = new Map<string, typeof state.literals>();
  for (const l of state.literals) {
    const owner = l.symbolId ? owners.get(l.symbolId) : null;
    if (!l.constName || owner?.kind !== 'constant' || owner.parentId !== null || !fileOk.get(l.file)) continue;
    if (l.kind === 'number' ? !configName(l.constName) : l.value.length < 4) continue;
    const key = `${l.kind}\0${l.value}`;
    constants.set(key, [...(constants.get(key) ?? []), l]);
  }
  for (const group of constants.values()) {
    for (const copy of group) {
      if (!touched(copy.file, copy.line)) continue;
      // Point at a constant in another file that the change did not write; failing that, at the first of the group.
      const first = group.find((l) => l.file !== copy.file && !touched(l.file, l.line)) ?? group[0]!;
      if (copy === first || copy.file === first.file) continue;
      // The same name in same-named files of sibling directories (one settings file per locale or platform) is a layout, not a copy.
      const parallel = path.posix.basename(copy.file) === path.posix.basename(first.file);
      all.push({ kind: 'duplicate-constant', confidence: copy.constName === first.constName && !parallel ? 'high' : 'low', file: copy.file, line: copy.line,
        message: `${copy.constName} repeats the value of ${first.constName}.`, suggestion: `${first.constName} (${first.file}:${first.line})` });
    }
  }

  // Dead code: a private function nothing calls and whose name appears nowhere else in its file.
  const called = new Set<string>(), calledNames = new Set<string>();
  for (const c of state.calls) { if (c.calleeId) called.add(c.calleeId); calledNames.add(c.calleeText.split(/[.:]/).at(-1)!); }
  const texts = new Map<string, string | null>();
  const text = (file: string) => {
    if (!texts.has(file)) { try { texts.set(file, readFileSync(path.join(root, file), 'utf8')); } catch { texts.set(file, null); } }
    return texts.get(file)!;
  };
  for (const s of state.symbols) {
    if (s.kind !== 'function' || s.exported || s.parentId !== null || !fileOk.get(s.file) || called.has(s.id) || calledNames.has(s.name)) continue;
    if (!touched(s.file, s.line, s.endLine)) continue;
    // Python has no export keyword: only a leading underscore marks a function private.
    if (s.file.endsWith('.py') && (!s.name.startsWith('_') || s.name.endsWith('__'))) continue;
    const source = text(s.file);
    if (source === null || !/^[A-Za-z_$][\w$]*$/.test(s.name)) continue;
    if (runByFramework(s.file, s.name, source, s.line)) continue;
    if ((source.match(new RegExp(`(?<![\\w$])${s.name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) ?? []).length !== 1) continue;
    all.push({ kind: 'dead-code', confidence: 'medium', file: s.file, line: s.line, message: `${s.qualifiedName} is private and never referenced.`, suggestion: null });
  }

  all.sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || SCAN_KINDS.indexOf(a.kind) - SCAN_KINDS.indexOf(b.kind) || a.file.localeCompare(b.file) || a.line - b.line);
  const findings = all.filter((f) => f.confidence !== 'low');
  const counts = Object.fromEntries(SCAN_KINDS.map((k) => [k, findings.filter((f) => f.kind === k).length])) as Record<ScanKind, number>;
  return { mode: changed ? 'diff' : 'repository', files: results.length, filesUnchecked: results.filter((r) => r.unchecked).length,
    counts, findings, check: all.filter((f) => f.confidence === 'low'), skipped, ms: Math.round(performance.now() - start) };
}

const clean = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, ' ');
const line = (f: ScanFinding) => {
  const text = `  ${clean(f.file)}:${f.line}  ${LABEL[f.kind]} [${f.confidence}]  ${clean(f.message)}${f.suggestion ? `  -> ${clean(f.suggestion)}` : ''}`;
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
};

/** One screen: counts, the five most certain findings, then what was only worth a look and what did not run. */
export function renderScan(report: ScanReport, top = 5): string {
  const out = [
    `GroundWork scan: ${report.files} file${report.files === 1 ? '' : 's'} checked${report.filesUnchecked ? ` (${report.filesUnchecked} could not be checked)` : ''} in ${(report.ms / 1000).toFixed(1)}s`,
    SCAN_KINDS.map((k) => `${report.counts[k]} ${LABEL[k]}`).join(' · '),
  ];
  if (report.findings.length) {
    out.push('', `Top ${Math.min(top, report.findings.length)} of ${report.findings.length}:`, ...report.findings.slice(0, top).map(line));
  }
  if (report.check.length) {
    out.push('', `Check (low confidence, not counted above): ${report.check.length}`, ...report.check.slice(0, 3).map(line));
  }
  if (report.skipped.length) out.push('', 'Not checked:', ...report.skipped.map((s) => `  ${s}`));
  if (report.findings.length > top || report.check.length > 3) out.push('', 'Run with --json or --sarif for every finding.');
  return out.join('\n');
}

export function toSarif(report: ScanReport): unknown {
  const level: Record<Confidence, string> = { high: 'error', medium: 'warning', low: 'note' };
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'GroundWork', version: VERSION, informationUri: 'https://github.com/ADITYADEV4145/GroundWork',
        rules: SCAN_KINDS.map((id) => ({ id, shortDescription: { text: LABEL[id] } })) } },
      results: [...report.findings, ...report.check].map((f) => ({
        ruleId: f.kind, level: level[f.confidence],
        message: { text: f.suggestion ? `${f.message} Use ${f.suggestion}.` : f.message },
        properties: { confidence: f.confidence },
        locations: [{ physicalLocation: { artifactLocation: { uri: f.file, uriBaseId: '%SRCROOT%' }, region: { startLine: Math.max(1, f.line) } } }],
      })),
    }],
  };
}
