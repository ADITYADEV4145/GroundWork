import type { z } from 'zod';
import type { GroundworkConfig } from '../config/schema.js';
import type { Db } from '../store/db.js';

// MCP tools are plain objects so each feature stream adds a file under mcp/tools/ and one line in
// mcp/tools/index.ts. Handlers return compact text: agent-facing output is token-budgeted.

export interface ToolContext {
  root: string;
  config: GroundworkConfig;
  /** Fresh read-only handle; the index is refreshed incrementally before each call. */
  db: Db;
}

export interface GwTool<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: S;
  /** Skip the incremental refresh before this tool runs. */
  noRefresh?: boolean;
  handler(args: z.infer<z.ZodObject<S>>, ctx: ToolContext): string | Promise<string>;
}

export function defineTool<S extends z.ZodRawShape>(tool: GwTool<S>): GwTool<S> {
  return tool;
}
