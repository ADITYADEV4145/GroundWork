import type { Language } from '../types.js';
import type { LanguageAdapter } from './adapter.js';
import { pythonAdapter } from './python.js';
import { typescriptAdapter } from './typescript.js';

const ADAPTERS: LanguageAdapter[] = [typescriptAdapter, pythonAdapter];

export function adapterFor(lang: Language): LanguageAdapter {
  const a = ADAPTERS.find((x) => x.languages.includes(lang));
  if (!a) throw new Error(`no adapter for ${lang}`);
  return a;
}

export { initParsers, languageForPath, INDEXED_EXTENSIONS } from './parser.js';
