import type { GwTool } from '../registry.js';
import { indexStatusTool } from './index_status.js';
import { NAVIGATION_TOOLS } from './navigation.js';
import { verifyCallsTool } from './verify_calls.js';
import { findSimilarTool } from './find_similar.js';
import { searchCodeTool } from './search_code.js';
import { checkTypesTool } from './check_types.js';
import { changeImpactTool } from './change_impact.js';
import { refactorSymbolTool } from './refactor_symbol.js';
import { beforeWriteTool } from './before_write.js';
import { architectureTool } from './architecture.js';

// Register new MCP tools here (one import + one entry).
export const TOOLS: GwTool[] = [indexStatusTool as unknown as GwTool, ...NAVIGATION_TOOLS, verifyCallsTool as unknown as GwTool, findSimilarTool as unknown as GwTool, searchCodeTool as unknown as GwTool, checkTypesTool as unknown as GwTool, changeImpactTool as unknown as GwTool, refactorSymbolTool as unknown as GwTool, beforeWriteTool as unknown as GwTool, architectureTool as unknown as GwTool];
