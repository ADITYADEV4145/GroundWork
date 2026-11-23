// Public library API. Feature streams import from these modules rather than reaching into internals.
export { searchCode, type CodeSearchOptions, type CodeSearchHit } from './search/index.js';
export { refreshIndex, type RefreshResult, type RefreshOptions } from './index/refresh.js';
export { openIndex, indexDbPath, symbolId } from './index/store.js';
export { searchSymbols, findSymbols, getSymbolDetail, indexStats, type SymbolHit, type SymbolDetail, type IndexStats } from './index/query.js';
export { fingerprint, minhashSimilarity, splitWords, stem, vocabulary, MINHASH_PERMS } from './extract/fingerprint.js';
export { loadConfig, defaultConfig } from './config/load.js';
export type { GroundworkConfig } from './config/schema.js';
export { openDb, initSqlBackend, type Db } from './store/db.js';
export { estimateTokens, fitToBudget } from './util/tokens.js';
export { findRepoRoot, gwPath } from './util/paths.js';
export { defineTool, type GwTool, type ToolContext } from './mcp/registry.js';
export type { HookHandler, HookEvent, HookResult } from './hooks/types.js';
export type { Check, CheckResult } from './selftest/registry.js';
export * from './types.js';
