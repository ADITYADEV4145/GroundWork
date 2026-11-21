import { createRequire } from 'node:module';
import { Language as TsLanguage, Parser, type Tree } from 'web-tree-sitter';
import type { Language } from '../types.js';

const require = createRequire(import.meta.url);

const GRAMMARS: Record<Language, string> = {
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-typescript/tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript/tree-sitter-javascript.wasm',
  python: 'tree-sitter-python/tree-sitter-python.wasm',
};

let initPromise: Promise<void> | null = null;
const languages = new Map<Language, TsLanguage>();
const parsers = new Map<Language, Parser>();

export function grammarPath(lang: Language): string {
  return require.resolve(GRAMMARS[lang]);
}

/** Load the WASM runtime and every v1 grammar once per process. */
export async function initParsers(): Promise<void> {
  initPromise ??= (async () => {
    await Parser.init();
    for (const lang of Object.keys(GRAMMARS) as Language[]) {
      languages.set(lang, await TsLanguage.load(grammarPath(lang)));
    }
  })();
  return initPromise;
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
