import { z } from 'zod';
import { findCode, navigationSymbols, symbolCalls, type NavigationSymbol } from '../../index/navigation.js';
import { repoRelative } from '../../util/repo-file.js';
import { estimateTokens } from '../../util/tokens.js';
import { defineTool, type ToolContext } from '../registry.js';
import { indexedSource } from '../symbol-source.js';

const MAX_SYMBOLS = 5;
const MAX_CALLERS = 3;
const MAX_HELPERS = 3;
const ignored = new Set('a an and as at be by code definition definitions do does find for from function functions helper how identify in into is it its method of on or return task that the their this to use what when where which who with'.split(' '));
const functions = new Set(['function', 'method', 'component']);

const oneLine = (s: string, limit = 140) => {
  const chars = [...s.replace(/[\u0000-\u001f\u007f\s]+/gu, ' ').trim()];
  return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : chars.join('');
};

function rank(task: string, hints: string[], files: string[], { db }: ToolContext) {
  const exact = new Map<string, NavigationSymbol>();
  const quoted = [...task.matchAll(/`([^`\s]+)`/gu)].map((match) => match[1]!);
  const words = task.match(/[\p{L}\p{N}_$]+(?:\.[\p{L}\p{N}_$]+)*/gu) ?? [];
  const names = [...new Set(words.filter((w) => !ignored.has(w.toLowerCase())).slice(0, 24))];
  const selections = [...new Set([...hints, ...quoted])].map((ref) => {
    const found = navigationSymbols(db, ref);
    return { found, specific: found.length === 1 || ref.includes(':') };
  });
  for (const { found } of [...selections.filter((s) => s.specific), ...selections.filter((s) => !s.specific)]) {
    for (const s of [...found.filter((s) => files.includes(s.file)), ...found]) exact.set(s.id, s);
  }
  for (const ref of names) {
    const found = navigationSymbols(db, ref);
    for (const s of [...found.filter((s) => files.includes(s.file)), ...found]) {
      if (functions.has(s.kind)) exact.set(s.id, s);
    }
  }
  if (!names.length) return [...exact.values()];
  const query = names.join(' ').slice(0, 512);
  const ranked = new Map<string, NavigationSymbol>();
  for (const s of [...exact.values(), ...files.flatMap((file) => findCode(db, query, undefined, file)), ...findCode(db, query)]) {
    if (!ranked.has(s.id)) ranked.set(s.id, s);
  }
  return [...ranked.values()];
}

export const taskContextTool = defineTool({
  name: 'task_context',
  description: 'Gather ranked symbol signatures, function bodies, indexed callers, and reusable helpers for a task in one budgeted reply.',
  inputSchema: {
    task: z.string().trim().min(1).max(2000),
    symbols: z.array(z.string().trim().min(1).max(256)).max(5).optional().describe('Names, file:qualifiedName, or IDs.'),
    files: z.array(z.string().trim().min(1).max(256)).max(5).optional().describe('Repo-relative file hints.'),
    budget_tokens: z.number().int().min(128).max(4000).default(1200).describe('Output budget, estimated as UTF-8 bytes/4.'),
  },
  async handler({ task, symbols = [], files = [], budget_tokens }, ctx) {
    const { db, root, config } = ctx;
    const paths = [...new Set(files.map((file) => repoRelative(root, file)).filter((file): file is string => file !== null))];
    const ranked = rank(task, symbols, paths, ctx);
    const targets = ranked.slice(0, MAX_SYMBOLS);
    const rows: string[] = [];
    const note = '… context shortened.';
    let bytes = Buffer.byteLength(note);
    let shortened = ranked.length > targets.length;
    const add = (row: string) => {
      const cost = Buffer.byteLength(row) + 1;
      if (estimateTokens(bytes + cost) > budget_tokens) {
        shortened = true;
        return false;
      }
      rows.push(row);
      bytes += cost;
      return true;
    };

    const shown: NavigationSymbol[] = [];
    const show = (s: NavigationSymbol) => {
      const name = `[${s.id}] ${oneLine(s.name, 60)} ${oneLine(s.file, 100)}:${s.line}-${s.endLine}`;
      if (add(`${name} — ${oneLine(s.signature || s.kind)}`) || add(name)) shown.push(s);
    };
    if (targets[0]) show(targets[0]);
    else add('No indexed symbols match the task.');

    const callers = (s: NavigationSymbol) => {
      const sites = symbolCalls(db, s.id, 'callers');
      const unique = [...new Map(sites.map((c) => [`${c.file}:${c.line}:${c.name}`, c])).values()];
      if (add(`Callers [${s.id}] (${unique.length} indexed):`)) {
        for (const c of unique.slice(0, MAX_CALLERS)) add(`  ${oneLine(c.name, 48)} ${oneLine(c.file, 80)}:${c.line} (${c.confidence})`);
      }
      if (unique.length > MAX_CALLERS) shortened = true;
    };
    if (shown[0]) callers(shown[0]);

    const { cachedCandidates } = await import('../../reuse/candidate-cache.js');
    const { findSimilar } = await import('../../reuse/similar.js');
    const index = await cachedCandidates(db, root, config);
    await index.prepareMeaning(root, config);
    const { matches } = await findSimilar(index, { description: task });
    const helpers = new Map<string, string>();
    for (const m of matches) {
      helpers.set(`${m.file}:${m.line}`, `${oneLine(m.symbol, 70)} ${oneLine(m.file, 100)}:${m.line} (${m.verdict})`);
    }
    for (const s of targets) {
      for (const edge of symbolCalls(db, s.id, 'callees')) {
        if (!edge.target || edge.target.id === s.id || !['exact', 'import-resolved'].includes(edge.confidence)) continue;
        const key = `${edge.target.file}:${edge.target.line}`;
        if (!helpers.has(key)) helpers.set(key, `${oneLine(edge.name, 70)} ${oneLine(edge.target.file, 100)}:${edge.target.line} (used by ${oneLine(s.name, 48)})`);
      }
    }
    if (helpers.size > MAX_HELPERS) shortened = true;
    if (!helpers.size) add('Reusable helpers: no matches.');
    for (const helper of [...helpers.values()].slice(0, MAX_HELPERS)) add(`Helper: ${helper}`);

    const body = (s: NavigationSymbol) => {
      if (!functions.has(s.kind)) return;
      const indexed = indexedSource(ctx, s);
      if (indexed) add(`Body [${s.id}]:\n${indexed.source.slice(indexed.start, indexed.end)}`);
      else add(`Body [${s.id}]: unavailable or changed after indexing.`);
    };
    if (shown[0]) body(shown[0]);
    for (const s of targets.slice(1)) {
      const before = shown.length;
      show(s);
      if (shown.length > before) {
        callers(s);
        body(s);
      }
    }
    if (shortened) rows.push(note);
    return rows.join('\n');
  },
});
