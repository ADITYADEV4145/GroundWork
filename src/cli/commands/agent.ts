import type { Command } from 'commander';
import type { AgentName, HookEventName } from '../../hooks/types.js';
import { globalOpts, repoRoot } from '../context.js';

const AGENTS = ['claude', 'codex', 'cursor'];
const EVENTS = ['pre_tool', 'post_tool', 'session_start', 'prompt', 'stop', 'pre_compact'];

export function register(program: Command): void {
  program
    .command('mcp')
    .description('run the Groundwork MCP server on stdio')
    .action(async (_o, cmd: Command) => {
      const { runMcp } = await import('../../mcp/relay.js');
      await runMcp(repoRoot(globalOpts(cmd)));
    });

  program
    .command('hook')
    .description('agent hook entry point (reads the hook payload on stdin; always exits 0)')
    .argument('<agent>', AGENTS.join('|'))
    .argument('<event>', EVENTS.join('|'))
    .action(async (agent: string, event: string) => {
      if (!AGENTS.includes(agent) || !EVENTS.includes(event)) return;
      const { runHook } = await import('../../hooks/run.js');
      await runHook(agent as AgentName, event as HookEventName);
      process.exitCode = 0;
    });
}
