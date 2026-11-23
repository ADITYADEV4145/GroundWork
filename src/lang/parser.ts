import { createRequire } from 'node:module';
import { Language as TsLanguage, Parser, type Tree } from 'web-tree-sitter';
import type { Language } from '../types.js';

const require = createRequire(import.meta.url);

const GRAMMARS: Record<Language, string> = {
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-typescript/tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript/tree-sitter-javascript.wasm',
  python: 'tree-sitter-python/tree-sitter-python.wasm',
  go: 'tree-sitter-go/tree-sitter-go.wasm',
  rust: 'tree-sitter-rust/tree-sitter-rust.wasm',
  java: 'tree-sitter-java/tree-sitter-java.wasm',
  csharp: 'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm',
  ruby: 'tree-sitter-ruby/tree-sitter-ruby.wasm',
};

let initPromise: Promise<void> | null = null;
const loading = new Map<Language, Promise<void>>();
const languages = new Map<Language, TsLanguage>();
const parsers = new Map<Language, Parser>();

export function grammarPath(lang: Language): string {
  return require.resolve(GRAMMARS[lang]);
}

/** Load the WASM runtime and every v1 grammar once per process. */
export async function initParsers(): Promise<void> {
  return initParsersFor(Object.keys(GRAMMARS) as Language[]);
}

export async function initParsersFor(needed: Language[]): Promise<void> {
  initPromise ??= Parser.init();
  await initPromise;
  await Promise.all(needed.map((lang) => {
    if (!loading.has(lang)) loading.set(lang, TsLanguage.load(grammarPath(lang)).then((grammar) => { languages.set(lang, grammar); }));
    return loading.get(lang)!;
  }));
}

export function parse(lang: Language, source: string): Tree {
  let parser = parsers.get(lang);
  if (!parser) {
    const l = languages.get(lang);
    if (!l) throw new Error(`grammar for ${lang} not loaded; call initParsers() first`);
    parser = new Parser();
    parser.setLanguage(l);
    parsers.set(lang, parser);
  }
  const tree = parser.parse(source);
  if (!tree) throw new Error(`tree-sitter failed to parse (${lang})`);
  return tree;
}

const EXT: Record<string, Language> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.py': 'python',
  '.pyi': 'python',
};

export function languageForPath(p: string): Language | null {
  const m = /\.[^./]+$/.exec(p);
  if (!m) return null;
  if (p.endsWith('.d.ts') || p.endsWith('.d.mts') || p.endsWith('.d.cts')) return 'typescript';
  return EXT[m[0].toLowerCase()] ?? null;
}

export const INDEXED_EXTENSIONS = Object.keys(EXT);
