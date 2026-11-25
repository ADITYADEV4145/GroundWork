import { z } from 'zod';
import { fileOutline, findCode, mapFiles, navigationSymbols, symbolCalls, whereUsed, type NavigationSymbol } from '../../index/navigation.js';
import { repoRelative } from '../../util/repo-file.js';
import { estimateTokens, fitToBudget } from '../../util/tokens.js';
import { defineTool, type GwTool, type ToolContext } from '../registry.js';
import { indexedSource } from '../symbol-source.js';

export const FIND_BATCH_BUDGET = 1800;
export const NAVIGATION_BUDGETS = { find_code: 600, outline: 400, read_symbol: 1200, explore: 1800, callers: 600, callees: 600, where_used: 600, repo_map: 1200 } as const;

const printable = (s: string) => !/[\u0000-\u001f\u007f]/u.test(s) && Buffer.from(s).toString('utf8') === s;
const text = z.string().trim().min(1).max(256).refine(printable, 'Control characters are not supported');
const pathInput = z.string().min(1).refine((s) => printable(s) && Buffer.byteLength(JSON.stringify(s)) <= 900, 'Use a short printable repository path');
const offset = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0);
const symbol = text.describe('Exact name, file:qualifiedName, or ID.');
const pageSize = z.number().int().min(1).max(100);
const limit = (n: number) => pageSize.default(n);
const kinds = z.enum(['function', 'method', 'class', 'interface', 'type', 'enum', 'constant', 'variable', 'component', 'dataclass']);
const locationsOnly = z.boolean().default(true);

const printableSource = (s: string) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s);

function compact(s: string, length = 180): string {
  const val = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...val];
  return chars.length <= length ? val : chars.slice(0, length - 1).join('') + '…';
}

function prefixBytes(s: string, bytes: number): string {
  const buf = Buffer.from(s);
  if (buf.length <= bytes) return s;
  let end = Math.max(0, bytes);
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString('utf8');
}

function page<T>({
  items, title, start, count = 100, budget, render, next,
}: {
  items: T[]; title: string; start: number; count?: number; budget: number;
  render: (item: T, prev: T | undefined) => string; next: (offset: number) => string;
}): string {
  const rows = items.slice(start, start + count).map((item, i) => render(item, i ? items[start + i - 1] : undefined));
  const tail = (n: number) => {
    const more = items.length - start - n;
    return more > 0 ? `\n… ${more} more. Next: ${next(start + n)}` : '';
  };
  if (!rows.length) return start && items.length ? title + '\nNo results at that offset. Omit offset to restart.' : title;
  const reserve = estimateTokens(title + tail(1)) + 2;
  const { items: kept } = fitToBudget(rows, (row) => row, budget, reserve);
  while (kept.length > 1 && estimateTokens(title + '\n' + kept.join('\n') + tail(kept.length)) > budget) kept.pop();
  if (kept.length === 1) {
    const available = budget * 4 - Buffer.byteLength(title + '\n' + tail(1));
    if (Buffer.byteLength(kept[0]!) > available) kept[0] = prefixBytes(kept[0]!, available - 3) + '…';
  }
  return title + '\n' + kept.join('\n') + tail(kept.length);
}

function call(tool: string, args: object): string {
  return `${tool}(${JSON.stringify(args)})`;
}

const location = (s: NavigationSymbol) => compact(s.file, 160) + ':' + s.line;
const choice = (s: NavigationSymbol) => `[${s.id}] ${compact(s.name, 70)} (${s.kind}) — ${location(s)}`;

function oneSymbol<T extends { symbol: string; offset: number }>(
  tool: keyof typeof NAVIGATION_BUDGETS, args: T, ctx: ToolContext, budget: number = NAVIGATION_BUDGETS[tool],
): NavigationSymbol | string {
  const matches = navigationSymbols(ctx.db, args.symbol);
  if (matches.length === 0) return 'No exact symbol match. Try find_code with the name or a description.';
  if (matches.length === 1) return matches[0]!;
  return page({
    items: matches, title: 'Ambiguous symbol. Retry with a candidate ID in brackets.',
    start: args.offset, budget, render: choice,
    next: (offset) => call(tool, { ...args, offset }),
  });
}

export function readSource(args: { symbol: string; context_lines: number; offset: number }, ctx: ToolContext, budget: number = NAVIGATION_BUDGETS.read_symbol, brief = false): string {
  const s = oneSymbol('read_symbol', args, ctx, budget);
  if (typeof s === 'string') return s;
  const indexed = indexedSource(ctx, s);
  if (!indexed) return 'Source is unavailable or changed after indexing. Retry read_symbol or use a ranged Read.';
  const { source } = indexed;
  let { start, end } = indexed;
  if (args.context_lines) {
    let newline = start > 0 ? source.lastIndexOf('\n', start - 1) : -1;
    for (let i = 0; i < args.context_lines && newline >= 0; i++) newline = newline > 0 ? source.lastIndexOf('\n', newline - 1) : -1;
    start = newline + 1;
    for (let i = 0; i <= args.context_lines && end < source.length; i++) {
      const newline = source.indexOf('\n', i === 0 ? end : end + 1);
      end = newline < 0 ? source.length : newline;
    }
  }
  const snippet = source.slice(start, end);
  if (args.offset >= snippet.length) return 'No source remains at that offset. To restart, omit offset.';
  const remainder = snippet.slice(args.offset);
  const title = brief ? `[${s.id}] ${compact(s.name, 70)} — ${location(s)}-${s.endLine}\n` :
    `${choice(s)} (definition lines ${s.line}-${s.endLine}; source offset ${args.offset})\n`;
  const next = (n: number) => `\n… ${remainder.length - n} more characters. Next: ${call('read_symbol', { ...args, symbol: s.id, offset: args.offset + n })}`;
  const available = budget * 4 - Buffer.byteLength(title);
  if (Buffer.byteLength(remainder) <= available) return title + remainder;
  const chunk = prefixBytes(remainder, available - Buffer.byteLength(next(remainder.length)) - 24);
  const newline = chunk.lastIndexOf('\n');
  const part = newline > chunk.length / 2 ? chunk.slice(0, newline + 1) : chunk;
  return title + part + next(part.length);
}

const FIND_BODIES = 3;
const queryBatch = z.array(text).min(1).max(8).refine((items) => Buffer.byteLength(JSON.stringify(items)) <= 900, 'Use shorter or fewer queries.');

interface FindArgs { query: string; kind?: z.infer<typeof kinds>; limit?: number; locations_only: boolean; breadth: 'exact' | 'all'; include_body: boolean; offset: number }

function findOne(args: FindArgs, ctx: ToolContext, budget: number, heading = ''): string {
  const all = findCode(ctx.db, args.query, args.kind);
  const query = args.query.toLowerCase();
  const exact = all.filter((s) => s.name.toLowerCase() === query || s.name.split('.').at(-1)?.toLowerCase() === query);
  if (args.include_body && exact.length === 1 && args.breadth !== 'all' && args.offset === 0 && !heading)
    return readSource({ symbol: exact[0]!.id, context_lines: 0, offset: 0 }, ctx, budget);
  const narrowed = args.breadth !== 'all' && exact.length > 0;
  const items = narrowed ? exact : all;
  const count = args.limit ?? (args.locations_only ? 3 : 8);
  const withBody = args.include_body && args.offset === 0 ? Math.min(FIND_BODIES, count, items.length) : 0;
  // Bodies share the budget so one call can answer; each is cut at its share and keeps its own Next cursor.
  const share = withBody ? Math.max(80, Math.floor((budget - 40) / withBody)) : 0;
  const row = (s: (typeof items)[number]) => args.locations_only ? choice(s) :
    `${choice(s)} · ${s.score}\n  ${compact(s.signature)}${s.doc ? ` — ${compact(s.doc, 110)}` : ''}`;
  return page({
    items, title: heading + (narrowed ? `Exact (${items.length})${all.length > exact.length ? '; more: breadth="all"' : ''}` : items.length ? `Code matches (${items.length}):` : 'No indexed matches. Try a different name or search plain text with your normal tools.'),
    start: args.offset, count, budget,
    render: (s) => {
      if (items.indexOf(s) >= withBody) return row(s);
      const body = readSource({ symbol: s.id, context_lines: 0, offset: 0 }, ctx, share);
      return body.startsWith(`[${s.id}] `) ? body : row(s);
    },
    next: (offset) => call('find_code', { query: args.query, kind: args.kind, limit: args.limit, locations_only: args.locations_only ? undefined : false, breadth: args.breadth === 'all' ? 'all' : undefined, include_body: args.include_body ? undefined : false, offset }),
  });
}

const findCodeTool = defineTool({
  name: 'find_code',
  description: 'Find symbols with budgeted source. Pass query or queries, not both. breadth: all expands exact matches; include_body: false returns locations; locations_only: false adds signatures/docs. Use rg for literals.',
  inputSchema: { query: text.optional(), queries: queryBatch.optional(), kind: kinds.optional(), limit: pageSize.optional(), locations_only: locationsOnly, breadth: z.enum(['exact', 'all']).default('exact'), include_body: z.boolean().default(true), offset },
  handler(args, ctx) {
    if (Boolean(args.query) === Boolean(args.queries)) return 'Provide exactly one of query or queries.';
    if (args.query) return findOne({ ...args, query: args.query }, ctx, NAVIGATION_BUDGETS.find_code);
    if (args.offset) return 'Follow the Next call of one query to page it; a batch has no offset.';
    const queries = [...new Set(args.queries!)];
    const budget = Math.floor(Math.min(NAVIGATION_BUDGETS.find_code * queries.length, FIND_BATCH_BUDGET) / queries.length);
    return queries.map((query) => findOne({ ...args, query }, ctx, budget, `## ${compact(query, 80)}\n`)).join('\n');
  },
});

const outlineTool = defineTool({
  name: 'outline',
  description: 'Outline file or files. A small single file includes source; include_body: false lists ranges only. locations_only: false adds signatures. Use read_symbol for known symbols; at most once per orientation.',
  inputSchema: { file: pathInput.optional(), files: z.array(pathInput).min(1).max(20).refine((items) => Buffer.byteLength(JSON.stringify(items)) <= 900, 'Use shorter paths or fewer files.').optional(), locations_only: locationsOnly, include_body: z.boolean().default(true), offset },
  handler(args, { root, db, config }) {
    if (Boolean(args.file) === Boolean(args.files)) return 'Provide exactly one of file or files.';
    if (args.files) {
      const items = args.files.flatMap((input) => {
        const file = repoRelative(root, input);
        const entry = file ? fileOutline(db, file) : null;
        const label = compact(file ?? input, 160);
        if (!entry) return [`${label}: not indexed; use a ranged Read.`];
        if (!entry.symbols.length) return [`${label}: no indexed symbols (${entry.status}).`];
        return entry.symbols.map((s) => `[${s.id}] ${label}:${s.line}-${s.endLine} ${compact(s.name, 70)} (${s.kind}; ${entry.status})${args.locations_only ? '' : ': ' + compact(s.signature)}`);
      });
      return page({
        items, title: `Files (${args.files.length}; symbol locations):`, start: args.offset, budget: NAVIGATION_BUDGETS.outline,
        render: (item) => item,
        next: (offset) => call('outline', { ...args, include_body: undefined, offset }),
      });
    }
    const file = repoRelative(root, args.file!);
    const entry = file ? fileOutline(db, file) : null;
    if (!entry) return 'File is not indexed. For non-code or unsupported files, use a ranged Read.';
    const title = `${prefixBytes(compact(file!, 100), 250)} (${entry.lines} lines; ${entry.symbols.length} symbols${entry.status === 'ok' ? '' : `; ${entry.status}${entry.reason ? `: ${entry.reason}` : ''}`})`;
    if (args.include_body && !args.offset && entry.symbols.length) {
      const indexed = indexedSource({ root, db, config }, entry.symbols[0]!);
      const whole = indexed ? `${title}; whole file:\n${indexed.source.trimEnd()}` : '';
      if (whole && printableSource(whole) && estimateTokens(whole) <= NAVIGATION_BUDGETS.outline) return whole;
    }
    return page({
      items: entry.symbols, title, start: args.offset, budget: NAVIGATION_BUDGETS.outline,
      render: (s) => `[${s.id}] ${s.line}-${s.endLine} ${compact(s.name, 70)} (${s.kind})${args.locations_only ? '' : ': ' + compact(s.signature)}`,
      next: (offset) => call('outline', { ...args, locations_only: args.locations_only ? undefined : false, include_body: args.include_body ? undefined : false, offset }),
    });
  },
});

const readSymbolTool = defineTool({
  name: 'read_symbol',
  description: 'Read source for symbol or batched symbols. Pick an ID if ambiguous; follow Next only as needed.',
  inputSchema: {
    symbol: symbol.optional(),
    symbols: z.array(symbol).min(1).max(20).refine((items) => Buffer.byteLength(JSON.stringify(items)) <= 900, 'Use shorter selectors or IDs for a batch.').optional(),
    context_lines: z.number().int().min(0).max(20).default(0), offset, symbol_offset: offset,
    callee_depth: z.number().int().min(0).max(2).default(0).describe('For a single symbol, include exact/import-resolved outgoing definitions up to this depth. Not a runtime call graph.'),
  },
  handler(args, ctx) {
    if (Boolean(args.symbol) === Boolean(args.symbols)) return 'Provide exactly one of symbol or symbols.';
    if (args.callee_depth) {
      if (args.symbols || args.offset) return 'Use callee_depth with one symbol and no source offset; follow individual source Next calls for longer bodies.';
      const first = oneSymbol('read_symbol', { symbol: args.symbol!, offset: 0 }, ctx);
      if (typeof first === 'string') return first;
      const nodes = [{ id: first.id, depth: 0 }], seen = new Set([first.id]);
      let omitted = false;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        if (node.depth >= args.callee_depth) continue;
        for (const edge of symbolCalls(ctx.db, node.id, 'callees')) {
          if (!edge.target || !['exact', 'import-resolved'].includes(edge.confidence) || seen.has(edge.target.id)) continue;
          seen.add(edge.target.id);
          if (nodes.length === 20) { omitted = true; continue; }
          nodes.push({ id: edge.target.id, depth: node.depth + 1 });
        }
      }
      return page({
        items: nodes, title: `Trace definitions (${nodes.length}; exact/import-resolved only, not runtime dispatch${omitted ? '; more targets: use callees' : ''}):`,
        start: args.symbol_offset, budget: NAVIGATION_BUDGETS.read_symbol,
        render: (node) => readSource({ symbol: node.id, context_lines: args.context_lines, offset: 0 }, ctx, 300, true),
        next: (symbol_offset) => call('read_symbol', { symbol: first.id, callee_depth: args.callee_depth, context_lines: args.context_lines, symbol_offset }),
      });
    }
    if (args.symbols) {
      if (args.offset) return 'Use symbol_offset to page a batch; use the individual Next calls for source offsets.';
      return page({
        items: args.symbols, title: `Symbols (${args.symbols.length}):`, start: args.symbol_offset, budget: NAVIGATION_BUDGETS.read_symbol,
        render: (symbol) => readSource({ symbol, context_lines: args.context_lines, offset: 0 }, ctx, 400, true),
        next: (symbol_offset) => call('read_symbol', { symbols: args.symbols, context_lines: args.context_lines, symbol_offset }),
      });
    }
    return readSource({ symbol: args.symbol!, context_lines: args.context_lines, offset: args.offset }, ctx);
  },
});

const exploreTool = defineTool({
  name: 'explore',
  description: 'Optional trace context: definitions, indexed edges with confidence, and files. Pass query or symbol. Answer directly when sufficient.',
  inputSchema: { query: text.optional(), symbol: symbol.optional(), limit: z.number().int().min(1).max(5).default(2), offset },
  handler(args, ctx) {
    if (Boolean(args.query) === Boolean(args.symbol)) return 'Provide exactly one of query or symbol.';
    let matches: NavigationSymbol[];
    if (args.symbol) matches = navigationSymbols(ctx.db, args.symbol);
    else {
      const all = findCode(ctx.db, args.query!);
      const query = args.query!.toLowerCase();
      const exact = all.filter((s) => s.name.toLowerCase() === query || s.name.split('.').at(-1)?.toLowerCase() === query);
      matches = exact.length ? exact : all;
    }
    if (!matches.length) return 'No indexed definitions. Try another query or a ranged Read.';
    return page({
      items: matches, title: `Explore (${matches.length} ranked definitions; indexed direct edges, not a runtime graph):`,
      start: args.offset, count: args.limit, budget: NAVIGATION_BUDGETS.explore,
      render: (s) => {
        const files = new Set([s.file]);
        const edges = (direction: 'callers' | 'callees') => {
          const rows = symbolCalls(ctx.db, s.id, direction);
          return page({
            items: rows, title: `${direction} (${rows.length}):`, start: 0, count: 4, budget: 120,
            render: (edge) => {
              files.add(edge.file);
              if (edge.target) files.add(edge.target.file);
              return `${edge.confidence}: ${compact(edge.name, 45)} — ${edge.target ? compact(edge.target.file, 90) + ':' + edge.target.line : 'definition unresolved'}; call ${compact(edge.file, 90)}:${edge.line}`;
            },
            next: (offset) => call(direction, { symbol: s.id, offset }),
          });
        };
        const callers = edges('callers'), callees = edges('callees');
        const paths = [...files].sort();
        const { items: shown } = fitToBudget(paths, (file) => compact(file, 100), 90, 20);
        return `${readSource({ symbol: s.id, context_lines: 0, offset: 0 }, ctx, 450, true)}\n${callers}\n${callees}\nFiles (selected direct edges${paths.length > shown.length ? '; +' + (paths.length - shown.length) + ' omitted' : ''}): ${prefixBytes(shown.map((file) => compact(file, 100)).join(', '), 300)}`;
      },
      next: (offset) => call('explore', { ...args, offset }),
    });
  },
});

function callsTool(direction: 'callers' | 'callees') {
  return defineTool({
    name: direction,
    description: direction === 'callers' ? 'List incoming calls by resolution confidence.' : 'List outgoing calls by resolution confidence, including unresolved calls.',
    inputSchema: { symbol, limit: limit(8), offset },
    handler(args, ctx) {
      const s = oneSymbol(direction, args, ctx);
      if (typeof s === 'string') return s;
      const items = symbolCalls(ctx.db, s.id, direction);
      return page({
        items, title: `${compact(s.name, 70)}: ${items.length} indexed ${direction}`, start: args.offset,
        count: args.limit, budget: NAVIGATION_BUDGETS[direction],
        render: (c) => `${compact(c.file, 170)}:${c.line} ${compact(c.name, 80)} [${c.confidence}]`,
        next: (offset) => call(direction, { ...args, symbol: s.id, offset }),
      });
    },
  });
}

const whereUsedTool = defineTool({
  name: 'where_used',
  description: 'Find indexed calls, imports, and mentions by file; not full-text search.',
  inputSchema: { name: text, offset },
  handler(args, { db }) {
    const items = whereUsed(db, args.name);
    return page({
      items, title: `${items.length} indexed references:`, start: args.offset, budget: NAVIGATION_BUDGETS.where_used,
      render: (r, prev) =>
        `${prev?.file !== r.file ? compact(r.file, 170) + '\n' : ''}  :${r.line} ${r.kind} ${compact(r.detail, 120)}${r.confidence ? ` [${r.confidence}]` : ''}`,
      next: (offset) => call('where_used', { ...args, offset }),
    });
  },
});

interface MapEntry {
  path: string;
  score: number;
  children: Map<string, MapEntry>;
  symbols?: string[];
}

const repoMapTool = defineTool({
  name: 'repo_map',
  description: 'Ranked file tree and top symbols. Use depth 1 for an overview or narrow by path.',
  inputSchema: { path: pathInput.optional(), depth: z.number().int().min(1).max(8).default(2), limit: limit(12), offset },
  handler(args, { root, db }) {
    const scope = repoRelative(root, args.path ?? '.');
    if (scope === null) return 'Use a path inside the repository.';
    const files = mapFiles(db, scope);
    const top: MapEntry = { path: scope, score: 0, children: new Map() };
    for (const file of files) {
      const pieces = (scope && file.path.startsWith(scope + '/') ? file.path.slice(scope.length + 1) : file.path).split('/');
      if (file.path === scope) pieces.splice(0, pieces.length, scope);
      let parent = top;
      for (let i = 0; i < Math.min(pieces.length, args.depth); i++) {
        const name = pieces[i]!;
        let node = parent.children.get(name);
        if (!node) {
          node = { path: file.path === scope ? scope : [scope, ...pieces.slice(0, i + 1)].filter(Boolean).join('/'), score: 0, children: new Map() };
          parent.children.set(name, node);
        }
        node.score += file.score;
        if (i === pieces.length - 1) node.symbols = file.symbols;
        parent = node;
      }
    }
    const items: { node: MapEntry; depth: number }[] = [];
    function visit(parent: MapEntry, depth: number): void {
      for (const node of [...parent.children.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))) {
        items.push({ node, depth });
        visit(node, depth + 1);
      }
    }
    visit(top, 0);
    const title = `Map: ${compact(scope || '.', 90)} (${files.length} indexed files, depth ${args.depth}). Narrow by path.`;
    return page({
      items, title, start: args.offset, count: args.limit, budget: NAVIGATION_BUDGETS.repo_map,
      render: ({ node, depth }) => `${'  '.repeat(depth)}${compact(node.path, 160)}${node.symbols ? (node.symbols.length ? ` — ${node.symbols.map((s) => compact(s, 60)).join(', ')}` : '') : '/'}`,
      next: (offset) => call('repo_map', { ...args, offset }),
    });
  },
});

export const NAVIGATION_TOOLS = [
  findCodeTool, outlineTool, readSymbolTool, exploreTool, callsTool('callers'), callsTool('callees'), whereUsedTool, repoMapTool,
] as unknown as GwTool[];
