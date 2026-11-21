import type { GwTool } from '../registry.js';
import { indexStatusTool } from './index_status.js';
import { NAVIGATION_TOOLS } from './navigation.js';
import { verifyCallsTool } from './verify_calls.js';

// Register new MCP tools here (one import + one entry).
export const TOOLS: GwTool[] = [indexStatusTool as unknown as GwTool, ...NAVIGATION_TOOLS, verifyCallsTool as unknown as GwTool];
