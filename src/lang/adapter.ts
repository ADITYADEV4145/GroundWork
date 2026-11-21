import type { BodyFingerprint, ImportKind, Language, LiteralKind, Param, SymbolKind } from '../types.js';

// What a language adapter returns for one file. References between items use local indexes; the indexer
// turns them into stable ids. Adding Go/Rust/Java means writing one more adapter.

export interface ExtractedSymbol {
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  startByte: number;
  endByte: number;
  signature: string;
  params: Param[];
  returnType: string | null;
  minArity: number;
  maxArity: number | null;
  docstring: string | null;
  decorators: string[];
  exported: boolean;
  isDefaultExport: boolean;
  isAsync: boolean;
  parent: number | null; // index into symbols
  fingerprint: BodyFingerprint | null;
}

export interface ExtractedImport {
  module: string;
  name: string;
  alias: string | null;
  kind: ImportKind;
  line: number;
  isTypeOnly: boolean;
}

export interface ExtractedCall {
  caller: number | null; // index into symbols, null = module level
  calleeText: string;
  calleeName: string;
  line: number;
  column: number;
  argCount: number;
  keywordArgs: string[];
  hasSpread: boolean;
  isNew: boolean;
}

export interface ExtractedLiteral {
  symbol: number | null;
  value: string;
  kind: LiteralKind;
  line: number;
  constName: string | null;
}

export interface ExtractResult {
  symbols: ExtractedSymbol[];
  imports: ExtractedImport[];
  calls: ExtractedCall[];
  literals: ExtractedLiteral[];
  /** Names a file exports under a different name than the local binding. */
  exportAliases: { local: string; exported: string }[];
  hasErrors: boolean;
}

export interface LanguageAdapter {
  readonly languages: readonly Language[];
  extract(source: string, lang: Language): ExtractResult;
}

export function classifyStringLiteral(value: string): LiteralKind | null {
  if (value.length < 3 || value.length > 300 || /\s/.test(value)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return 'url';
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(value)) return 'env';
  if (/^(\.{1,2}\/|\/|~\/)[\w.@/-]+$/.test(value) || /^[\w.-]+(\/[\w.@-]+)+\.[a-z0-9]{1,6}$/i.test(value)) return 'path';
  if (/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9_]*){1,5}$/.test(value) && !/\.(js|ts|py|json|md|css|html)$/.test(value)) return 'config_key';
  return null;
}
