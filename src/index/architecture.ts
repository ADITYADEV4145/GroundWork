import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../store/db.js';
import { fitToBudget } from '../util/tokens.js';
import { architectureFacts, indexGeneration } from './query.js';

export interface Architecture {
  packages: { dir: string; files: number; lines: number; languages: string[] }[];
  entryPoints: { file: string; why: string }[];
  /** Import edges between packages: `from` depends on `to`. */
  layers: { from: string; to: string; imports: number }[];
  hotUtilities: { package: string; symbol: string; file: string; line: number; signature: string; callers: number }[];
  naming: { functions: Record<string, string>; files: string | null; tests: string | null };
}

const CONTAINERS = new Set(['src', 'lib', 'app', 'apps', 'packages', 'pkg', 'internal', 'cmd', 'services']);
/** A package is the first directory, or the second one under a container directory such as src/. */
export function packageOf(file: string): string {
  const parts = file.split('/');
  if (parts.length === 1) return '.';
  return CONTAINERS.has(parts[0]!) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0]!;
}

function style(name: string): string | null {
  const bare = name.replace(/^_+|_+$/g, '');
  if (bare.length < 4) return null;
  if (bare.includes('_')) return bare === bare.toUpperCase() ? null : 'snake_case';
  if (bare.includes('-')) return 'kebab-case';
  if (/^[a-z]+[A-Z]/.test(bare)) return 'camelCase';
  if (/^[A-Z][a-z]+[A-Z]/.test(bare)) return 'PascalCase';
  return null;
}
function majority(names: string[]): string | null {
  const counts = new Map<string, number>();
  for (const name of names) { const s = style(name); if (s) counts.set(s, (counts.get(s) ?? 0) + 1); }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]), total = ranked.reduce((sum, [, n]) => sum + n, 0);
  return ranked[0] && total >= 5 ? `${ranked[0][0]} (${Math.round(ranked[0][1] / total * 100)}%)` : null;
}

function manifestEntries(root: string): { file: string; why: string }[] {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { main?: unknown; bin?: unknown };
    const out: { file: string; why: string }[] = [];
    const add = (file: unknown, why: string) => { if (typeof file === 'string') out.push({ file: path.posix.normalize(file), why }); };
    add(pkg.main, 'package.json main');
    if (typeof pkg.bin === 'string') add(pkg.bin, 'package.json bin');
    else if (pkg.bin && typeof pkg.bin === 'object') for (const [name, file] of Object.entries(pkg.bin)) add(file, `package.json bin ${name}`);
    return out;
  } catch { return []; }
}

const cache = new Map<string, { generation: string; value: Architecture }>();

/** The shape of the repository in one read: where code lives, what depends on what, and which helpers everything already calls. */
export function architecture(db: Db, root: string): Architecture {
  const generation = indexGeneration(db), hit = cache.get(root);
  // package.json is not indexed, so its entry points are read on every call rather than cached with the index generation.
  const withManifest = (value: Architecture): Architecture => {
    const manifest = manifestEntries(root);
    return { ...value, entryPoints: [...manifest, ...value.entryPoints.filter((r) => !manifest.some((m) => m.file === r.file))] };
  };
  if (generation && hit?.generation === generation) return withManifest(hit.value);

  const facts = architectureFacts(db), files = facts.files;
  const pkgOfFile = new Map(files.map((f) => [f.id, packageOf(f.path)]));
  const source = files.filter((f) => !f.test);

  const packages = new Map<string, { dir: string; files: number; lines: number; languages: Set<string> }>();
  for (const f of source) {
    const dir = packageOf(f.path), p = packages.get(dir) ?? { dir, files: 0, lines: 0, languages: new Set<string>() };
    p.files++; p.lines += f.lines; if (f.language) p.languages.add(f.language);
    packages.set(dir, p);
  }

  const edges = new Map<string, { from: string; to: string; imports: number }>();
  const imported = new Set<number>();
  const outgoing = new Map<number, number>();
  for (const link of facts.imports) {
    const from = pkgOfFile.get(link.from), to = pkgOfFile.get(link.to);
    imported.add(link.to); outgoing.set(link.from, (outgoing.get(link.from) ?? 0) + 1);
    if (!from || !to || from === to) continue;
    const key = `${from}\0${to}`, edge = edges.get(key) ?? { from, to, imports: 0 };
    edge.imports++; edges.set(key, edge);
  }
  const testPackages = new Set(files.filter((f) => f.test).map((f) => packageOf(f.path)).filter((dir) => !packages.has(dir)));

  const roots = source.filter((f) => !imported.has(f.id) && (outgoing.get(f.id) ?? 0) > 0)
    .sort((a, b) => outgoing.get(b.id)! - outgoing.get(a.id)! || a.path.localeCompare(b.path)).slice(0, 5)
    .map((f) => ({ file: f.path, why: `imported by nothing, imports ${outgoing.get(f.id)} files` }));

  // A helper is hot when other files call it through a resolved import; same-file and name-only calls say nothing about reuse.
  const perPackage = new Map<string, number>(), hotUtilities: Architecture['hotUtilities'] = [];
  for (const h of facts.hot) {
    const pkg = pkgOfFile.get(h.fileId);
    if (!pkg || (perPackage.get(pkg) ?? 0) >= 3) continue;
    perPackage.set(pkg, (perPackage.get(pkg) ?? 0) + 1);
    hotUtilities.push({ package: pkg, symbol: h.symbol, file: h.file, line: h.line, signature: h.signature, callers: h.callers });
  }

  const functions: Record<string, string> = {};
  const byLanguage = new Map<string, string[]>();
  for (const f of facts.functions) {
    const names = byLanguage.get(f.language);
    if (names) names.push(f.name); else byLanguage.set(f.language, [f.name]);
  }
  for (const [language, names] of [...byLanguage].sort()) { const m = majority(names); if (m) functions[language] = m; }
  const tests = files.filter((f) => f.test).map((f) => path.posix.basename(f.path));
  const testShapes = ([['*.test.*', /\.test\.[^.]+$/], ['*.spec.*', /\.spec\.[^.]+$/], ['test_*', /^test_/], ['*_test.*', /_test\.[^.]+$/]] as const)
    .map(([label, re]) => [label, tests.filter((t) => re.test(t)).length] as const).sort((a, b) => b[1] - a[1]);

  const value: Architecture = {
    packages: [...packages.values()].sort((a, b) => b.lines - a.lines || a.dir.localeCompare(b.dir)).map((p) => ({ ...p, languages: [...p.languages].sort() })),
    entryPoints: roots,
    layers: [...edges.values()].filter((e) => !testPackages.has(e.from)).sort((a, b) => b.imports - a.imports || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    hotUtilities,
    naming: { functions, files: majority(source.map((f) => path.posix.basename(f.path).replace(/\.[^.]+$/, ''))), tests: testShapes[0] && testShapes[0][1] > 0 ? testShapes[0][0] : null },
  };
  if (generation) cache.set(root, { generation, value });
  return withManifest(value);
}

export function renderArchitecture(a: Architecture, budgetTokens = 600): string {
  const one = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length <= 110 ? t : t.slice(0, 109) + '…'; };
  const dependsOn = new Map<string, string[]>();
  for (const e of a.layers) dependsOn.set(e.from, [...(dependsOn.get(e.from) ?? []), `${e.to} (${e.imports})`]);
  const naming = [...Object.entries(a.naming.functions).map(([language, s]) => `${language} functions ${s}`),
    ...(a.naming.files ? [`file names ${a.naming.files}`] : []), ...(a.naming.tests ? [`tests ${a.naming.tests}`] : [])];
  // Interleaved by rank so a tight budget drops the tail of every section, not whole sections.
  const sections: [string, string[]][] = [
    ['Packages', a.packages.map((p) => `${p.dir}: ${p.files} files, ${p.lines} lines${p.languages.length ? `, ${p.languages.join('/')}` : ''}`)],
    ['Entry points', a.entryPoints.map((e) => `${e.file} (${e.why})`)],
    ['Reuse these (most-called helpers)', a.hotUtilities.map((h) => `${one(h.signature || h.symbol)} — ${h.file}:${h.line}, called from ${h.callers} files`)],
    ['Depends on', [...dependsOn].map(([from, to]) => `${from} → ${to.slice(0, 6).join(', ')}${to.length > 6 ? `, +${to.length - 6}` : ''}`)],
    ['Conventions', naming],
  ];
  const ranked: { section: number; line: string }[] = [];
  for (let i = 0; sections.some(([, lines]) => i < lines.length); i++)
    sections.forEach(([, lines], section) => { if (i < lines.length) ranked.push({ section, line: lines[i]! }); });
  const { items, truncated } = fitToBudget(ranked, (r) => r.line, budgetTokens, sections.length * 6);
  const out = sections.flatMap(([title], section) => {
    const lines = items.filter((r) => r.section === section).map((r) => `  ${r.line}`);
    return lines.length ? [title, ...lines] : [];
  });
  if (!out.length) return 'Nothing indexed yet.';
  return out.join('\n') + (truncated ? `\n… ${truncated} more line(s); raise the budget or use map for one directory` : '');
}
