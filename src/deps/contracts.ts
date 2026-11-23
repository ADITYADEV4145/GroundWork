import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Finding } from '../grounding/verify.js';
import { nameSimilarity } from '../grounding/suggest.js';

// Calls to other services, checked against contract files that live in the repo: OpenAPI, GraphQL schemas and
// protobuf services. Contracts say what a service offers, not which service a given call reaches, so every
// finding here is a warning and never blocks.

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.groundwork', 'dist', 'build', 'target', 'vendor', '.venv', 'venv', '__pycache__', '.next', 'coverage']);
const MAX_FILES = 200;
const MAX_BYTES = 4 * 1024 * 1024;

export interface Contracts {
  /** OpenAPI path template -> lowercase methods. */
  http: Map<string, { methods: Set<string>; file: string }>;
  graphql: { query: Set<string>; mutation: Set<string>; subscription: Set<string>; files: string[] };
  /** protobuf service name -> rpc names. */
  services: Map<string, { rpcs: Set<string>; file: string }>;
}

const cache = new Map<string, { at: number; contracts: Contracts }>();

function contractFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), depth + 1);
      } else if (/\.(proto|graphql|graphqls|gql)$|(^|[.\-_])(openapi|swagger)[^/]*\.(json|ya?ml)$/i.test(e.name)) out.push(path.join(dir, e.name));
    }
  };
  walk(root, 0);
  return out;
}

function read(file: string): string | null {
  try {
    if (statSync(file).size > MAX_BYTES) return null;
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** `paths:` of an OpenAPI YAML document, read by indentation (no YAML dependency at runtime). */
function yamlPaths(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const lines = text.split('\n');
  let i = lines.findIndex((l) => /^paths\s*:\s*(#.*)?$/.test(l));
  if (i < 0) return out;
  let pathIndent = -1;
  let current: Set<string> | null = null;
  for (i++; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break;
    if (pathIndent < 0) pathIndent = indent;
    const key = /^\s*(?:"([^"]+)"|'([^']+)'|([^\s:#]+))\s*:/.exec(line);
    if (!key) continue;
    const name = key[1] ?? key[2] ?? key[3]!;
    if (indent === pathIndent) {
      current = name.startsWith('/') ? new Set() : null;
      if (current) out.set(name, current);
    } else if (current && METHODS.includes(name.toLowerCase())) current.add(name.toLowerCase());
  }
  return out;
}

function jsonPaths(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const doc = JSON.parse(text) as { paths?: Record<string, Record<string, unknown>> };
  for (const [p, item] of Object.entries(doc.paths ?? {})) {
    if (p.startsWith('/') && item && typeof item === 'object') out.set(p, new Set(Object.keys(item).map((k) => k.toLowerCase()).filter((k) => METHODS.includes(k))));
  }
  return out;
}

function graphqlFields(text: string, type: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(`\\b(?:extend\\s+)?type\\s+${type}\\b[^{]*\\{`, 'g'))) {
    let depth = 1;
    let parens = 0;
    let i = m.index + m[0].length;
    let body = '';
    for (; i < text.length && depth > 0; i++) {
      const c = text[i]!;
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '(') parens++;
      else if (c === ')') parens--;
      if (depth === 1 && parens === 0 && c !== ')') body += c;
      else if (depth === 1 && c === ')') body += ' ';
    }
    for (const f of body.replace(/#.*$/gm, '').replace(/"""[\s\S]*?"""|"[^"\n]*"/g, '').matchAll(/(^|\n|\s)([A-Za-z_]\w*)\s*:/g)) out.push(f[2]!);
  }
  return out;
}

export function loadContracts(root: string): Contracts {
  const hit = cache.get(root);
  if (hit && Date.now() - hit.at < 2000) return hit.contracts;
  const contracts: Contracts = { http: new Map(), graphql: { query: new Set(), mutation: new Set(), subscription: new Set(), files: [] }, services: new Map() };
  for (const file of contractFiles(root)) {
    const text = read(file);
    if (text === null) continue;
    const rel = path.relative(root, file).split(path.sep).join('/');
    try {
      if (file.endsWith('.proto')) {
        for (const s of text.matchAll(/\bservice\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
          const entry = contracts.services.get(s[1]!) ?? { rpcs: new Set<string>(), file: rel };
          for (const r of s[2]!.matchAll(/\brpc\s+(\w+)\s*\(/g)) entry.rpcs.add(r[1]!);
          contracts.services.set(s[1]!, entry);
        }
      } else if (/\.(graphql|graphqls|gql)$/.test(file)) {
        const schema = /\bschema\s*\{([^}]*)\}/.exec(text)?.[1] ?? '';
        const rootType = (op: string, fallback: string): string => new RegExp(`\\b${op}\\s*:\\s*(\\w+)`).exec(schema)?.[1] ?? fallback;
        const before = contracts.graphql.query.size + contracts.graphql.mutation.size + contracts.graphql.subscription.size;
        for (const f of graphqlFields(text, rootType('query', 'Query'))) contracts.graphql.query.add(f);
        for (const f of graphqlFields(text, rootType('mutation', 'Mutation'))) contracts.graphql.mutation.add(f);
        for (const f of graphqlFields(text, rootType('subscription', 'Subscription'))) contracts.graphql.subscription.add(f);
        if (contracts.graphql.query.size + contracts.graphql.mutation.size + contracts.graphql.subscription.size > before) contracts.graphql.files.push(rel);
      } else {
        const paths = file.endsWith('.json') ? jsonPaths(text) : yamlPaths(text);
        for (const [p, methods] of paths) {
          const entry = contracts.http.get(p) ?? { methods: new Set<string>(), file: rel };
          for (const m of methods) entry.methods.add(m);
          contracts.http.set(p, entry);
        }
      }
    } catch {
      // an unreadable contract contributes nothing
    }
  }
  cache.set(root, { at: Date.now(), contracts });
  return contracts;
}

const segments = (p: string): string[] => p.split('?')[0]!.split('#')[0]!.split('/').filter(Boolean);
const isParam = (s: string): boolean => /^\{.*\}$|^:|^\$\{|^<.*>$|^%[sd]$|^\{\}$/.test(s) || s.includes('${') || s.includes('{');

function pathMatches(template: string, actual: string[]): boolean {
  const t = segments(template);
  if (t.length !== actual.length) return false;
  return t.every((seg, i) => isParam(seg) || isParam(actual[i]!) || seg === actual[i]);
}

function warn(file: string, line: number, name: string, message: string): Finding {
  return { file, line, kind: 'contract', name, message, blocking: false, suggestions: [] };
}

function closest(name: string, pool: Iterable<string>, floor = 0.5): string[] {
  return [...pool]
    .map((c) => ({ c, s: nameSimilarity(name, c) }))
    .filter((x) => x.s >= floor && x.c !== name)
    .sort((a, b) => b.s - a.s || a.c.localeCompare(b.c))
    .slice(0, 2)
    .map((x) => x.c);
}

/** The call starting at `lines[i][from]`, through its closing parenthesis (at most a few lines). */
function callText(lines: string[], i: number, from: number): string {
  let depth = 0;
  let out = '';
  for (let l = i; l < Math.min(lines.length, i + 8); l++) {
    const text = l === i ? lines[l]!.slice(from) : lines[l]!;
    for (const ch of text) {
      out += ch;
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) return out;
    }
    out += '\n';
  }
  return out;
}

function checkHttp(c: Contracts, rel: string, lines: string[], live: (line: number) => boolean, out: Finding[]): void {
  if (!c.http.size) return;
  // The contract's first path segments identify calls that plausibly target this API.
  const heads = new Set([...c.http.keys()].map((p) => segments(p)[0]).filter((s): s is string => !!s && !isParam(s)));
  const call = /\b(?:(fetch)|(?:\w+\.)*(get|post|put|patch|delete|head|options|request|Get|Post)|(?:http\.)?NewRequest(?:WithContext)?)\s*(?:<[^>]*>)?\(\s*(?:\w+\s*,\s*)?(?:"(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)"\s*,\s*)?(?:f|rf)?(["'`])((?:https?:\/\/[^/"'`\s]+|\$\{[^}]+\}|\{[^}]+\})?(\/[^"'`\s]*))\4/;
  lines.forEach((text, i) => {
    const line = i + 1;
    if (!live(line)) return;
    const m = call.exec(text);
    if (!m) return;
    const actual = segments(m[6]!);
    // Strip a base path the contract does not spell out (`/api/v1/users` against `/users`).
    let start = actual.findIndex((s) => heads.has(s));
    if (start < 0) return;
    if (c.http.has('/' + actual.join('/'))) start = 0;
    const tail = actual.slice(start);
    const shown = '/' + tail.join('/');
    let method = (m[3] ?? m[2] ?? '').toLowerCase();
    if (m[1] || method === 'request' || !method) {
      const explicit = /\bmethod\s*[:=]\s*["'](\w+)["']/.exec(callText(lines, i, m.index));
      method = explicit ? explicit[1]!.toLowerCase() : m[1] ? 'get' : '';
    }
    const matching = [...c.http.entries()].filter(([template]) => pathMatches(template, tail));
    if (!matching.length) {
      const near = closest(shown, [...c.http.keys()].filter((p) => segments(p)[0] === tail[0]), 0.6);
      out.push(warn(rel, line, shown, `no \`${shown}\` path in ${[...c.http.values()][0]!.file}${near.length ? `; it has ${near.map((n) => `\`${n}\``).join(', ')}` : ''}.`));
    } else if (method && METHODS.includes(method) && !matching.some(([, e]) => e.methods.has(method))) {
      const [template, entry] = matching[0]!;
      out.push(warn(rel, line, shown, `\`${template}\` has no ${method.toUpperCase()} in ${entry.file}; it allows ${[...entry.methods].map((x) => x.toUpperCase()).join(', ')}.`));
    }
  });
}

function checkGraphql(c: Contracts, rel: string, text: string, live: (line: number) => boolean, out: Finding[]): void {
  const g = c.graphql;
  if (!g.files.length) return;
  for (const m of text.matchAll(/(?:\bgql|\bgraphql)\s*(?:\(\s*)?`([^`]*)`|"""([\s\S]*?)"""/g)) {
    const doc = m[1] ?? m[2] ?? '';
    const base = text.slice(0, m.index).split('\n').length;
    for (const op of doc.matchAll(/(?:^|[\s}])(query|mutation|subscription)\b[^{]*\{|^\s*\{/g)) {
      const kind = (op[1] ?? 'query') as 'query' | 'mutation' | 'subscription';
      const known = g[kind];
      if (!known.size) continue;
      let depth = 1;
      let parens = 0;
      let top = '';
      const start = op.index + op[0].length;
      for (let i = start; i < doc.length && depth > 0; i++) {
        const ch = doc[i]!;
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === '(') parens++;
        else if (ch === ')') parens--;
        top += depth === 1 && parens === 0 && ch !== ')' && ch !== '}' ? ch : ch === '\n' ? '\n' : ' ';
      }
      for (const f of top.matchAll(/(?:([A-Za-z_]\w*)\s*:\s*)?([A-Za-z_]\w*)/g)) {
        const field = f[2]!;
        if (field.startsWith('__') || known.has(field) || /\$\{|\.\.\./.test(top.slice(Math.max(0, f.index - 4), f.index))) continue;
        const line = base + doc.slice(0, start + f.index).split('\n').length - 1;
        if (!live(line)) continue;
        const near = closest(field, known);
        out.push(warn(rel, line, field, `${kind} \`${field}\` is not in ${g.files[0]}${near.length ? `; it has ${near.map((n) => `\`${n}\``).join(', ')}` : ''}.`));
      }
    }
  }
}

function checkProto(c: Contracts, rel: string, text: string, lines: string[], live: (line: number) => boolean, out: Finding[]): void {
  if (!c.services.size) return;
  for (const [service, entry] of c.services) {
    // Generated clients: `new GreeterClient(…)`, `pb.NewGreeterClient(conn)`, `GreeterStub(channel)`, `GreeterGrpc.newBlockingStub(…)`.
    const made = new RegExp(`\\b(\\w+)\\s*(?::=|=)\\s*(?:await\\s+)?(?:new\\s+)?(?:[\\w.]+\\.)?(?:New${service}Client|${service}(?:Service)?Client|${service}Stub|${service}Grpc\\.new\\w*Stub)\\s*\\(`, 'g');
    const lower = new Set([...entry.rpcs].map((r) => r.toLowerCase()));
    for (const m of text.matchAll(made)) {
      const client = m[1]!;
      const use = new RegExp(`\\b${client}\\.([A-Za-z_]\\w*)\\s*\\(`, 'g');
      lines.forEach((l, i) => {
        if (!live(i + 1)) return;
        for (const u of l.matchAll(use)) {
          const method = u[1]!;
          // snake_case and camelCase spellings of an rpc are the same method in generated code.
          if (lower.has(method.replaceAll('_', '').toLowerCase()) || /^(close|with\w*|wait\w*|get\w*Channel|future|then|catch)$/.test(method)) continue;
          const near = closest(method, entry.rpcs);
          out.push(warn(rel, i + 1, method, `service \`${service}\` has no rpc \`${method}\` in ${entry.file}${near.length ? `; it has ${near.map((n) => `\`${n}\``).join(', ')}` : ''}.`));
        }
      });
    }
  }
}

export function checkContracts(root: string, rel: string, ranges?: [number, number][] | null): Finding[] {
  try {
    if (!/\.(m?[jt]sx?|cjs|py|go|java|kt|rs)$/.test(rel)) return [];
    const contracts = loadContracts(root);
    if (!contracts.http.size && !contracts.graphql.files.length && !contracts.services.size) return [];
    const text = read(path.join(root, rel));
    if (text === null) return [];
    const lines = text.split('\n');
    const live = (line: number): boolean => (!ranges || ranges.some(([a, b]) => line >= a && line <= b)) && !/gw:\s*ignore/.test(lines[line - 1] ?? '');
    const out: Finding[] = [];
    checkHttp(contracts, rel, lines, live, out);
    checkGraphql(contracts, rel, text, live, out);
    checkProto(contracts, rel, text, lines, live, out);
    return out.sort((a, b) => a.line - b.line);
  } catch {
    return [];
  }
}
