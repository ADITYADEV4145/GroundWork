import type { Language } from '../types.js';
import type { LanguageAdapter } from './adapter.js';
import { csharpAdapter } from './csharp.js';
import { rubyAdapter } from './ruby.js';
import { rustAdapter } from './rust.js';
import { javaAdapter } from './java.js';
import { goAdapter } from './go.js';
import { pythonAdapter } from './python.js';
import { typescriptAdapter } from './typescript.js';

const ADAPTERS: LanguageAdapter[] = [typescriptAdapter, pythonAdapter, goAdapter, rustAdapter, javaAdapter, csharpAdapter, rubyAdapter];

export function adapterFor(lang: Language): LanguageAdapter {
  const a = ADAPTERS.find((x) => x.languages.includes(lang));
  if (!a) throw new Error(`no adapter for ${lang}`);
  return a;
}

export { initParsers, languageForPath, INDEXED_EXTENSIONS } from './parser.js';
