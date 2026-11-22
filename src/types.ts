// Shared record shapes for everything stored in the index. Later phases read these; change them only
// together with the store schema version.

export type Language = 'typescript' | 'tsx' | 'javascript' | 'python';

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'constant'
  | 'variable'
  | 'component'
  | 'dataclass';

export type FileStatus = 'ok' | 'partial' | 'skipped';

export interface FileRecord {
  id: number;
  path: string; // repo-relative, forward slashes
  language: Language | null;
  hash: string; // sha1 of content
  size: number;
  mtimeMs: number;
  lines: number;
  indexedAt: number; // ms epoch
  isTest: boolean;
  isGenerated: boolean;
  status: FileStatus;
  skipReason: string | null;
}

export interface Param {
  name: string;
  type?: string | undefined;
  default?: string | undefined;
  optional?: boolean | undefined;
  /** `...rest` in JS/TS, `*args` in Python. */
  rest?: boolean | undefined;
  /** Python `**kwargs`. */
  kwrest?: boolean | undefined;
  /** Python keyword-only (after `*`). */
  keywordOnly?: boolean | undefined;
  /** Python positional-only (before `/`). */
  positionalOnly?: boolean | undefined;
}

export interface BodyFingerprint {
  bodyHash?: string;
  /** Normalized token count of the body. */
  tokenCount: number;
  /** 128 MinHash values over k=4 shingles of the normalized token stream. */
  minhash: Uint32Array;
  /** sha1 of the normalized token stream (exact Type-1/2 clone key). */
  normHash: string;
  /** Identifier words (camelCase/snake_case split, lowercased, stemmed) with counts. */
  vocab: Record<string, number>;
}

export interface SymbolRecord {
  id: string; // stable: hash(file + qualified name + kind [+ ordinal])
  fileId: number;
  file: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  startLine: number; // 1-based, inclusive
  endLine: number;
  startByte: number;
  endByte: number;
  signature: string;
  params: Param[];
  returnType: string | null;
  minArity: number;
  maxArity: number | null; // null = unbounded
  docstring: string | null;
  decorators: string[];
  exported: boolean;
  isDefaultExport: boolean;
  isAsync: boolean;
  parentId: string | null;
  fingerprint: BodyFingerprint | null;
}

export type ImportKind = 'named' | 'default' | 'namespace' | 'side-effect' | 'reexport' | 'reexport-all' | 'module';

export interface ImportRecord {
  id: number;
  fileId: number;
  module: string; // as written: './x', '@/lib/y', 'react', '..pkg.mod'
  name: string; // imported name ('default', '*', or the exported name)
  alias: string | null; // local name if different
  kind: ImportKind;
  line: number;
  isTypeOnly: boolean;
  resolvedFileId: number | null;
  /** Why resolution failed: 'external', 'not-found', 'dynamic'. Null when resolved. */
  unresolvedReason: string | null;
}

export type CallConfidence = 'exact' | 'import-resolved' | 'name-only';

export interface CallRecord {
  id: number;
  fileId: number;
  callerId: string | null; // null = module-level
  calleeText: string; // as written: 'foo', 'this.bar', 'utils.fmt', 'self.save'
  calleeName: string; // last segment: 'foo', 'bar', 'fmt', 'save'
  line: number;
  column: number;
  argCount: number;
  keywordArgs: string[];
  hasSpread: boolean;
  calleeId: string | null;
  confidence: CallConfidence | null; // null when unresolved
}

export type LiteralKind = 'path' | 'url' | 'env' | 'config_key' | 'number' | 'string';

export interface LiteralRecord {
  id: number;
  fileId: number;
  symbolId: string | null;
  value: string;
  kind: LiteralKind;
  line: number;
  /** Name of the constant this literal is the value of (e.g. API_URL), if any. */
  constName: string | null;
}
