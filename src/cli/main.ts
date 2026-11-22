#!/usr/bin/env node
import * as nodeModule from 'node:module';
import type { AgentName, HookEventName } from '../hooks/types.js';

try { nodeModule.enableCompileCache?.(); } catch { /* Optional startup optimization. */ }

const [, , command, agent, event] = process.argv;
if (command === 'hook' && process.argv.length === 5 &&
  ['claude', 'codex', 'cursor'].includes(agent ?? '') &&
  ['pre_tool', 'post_tool', 'session_start', 'prompt', 'stop', 'pre_compact'].includes(event ?? '')) {
  try {
    const startupMs = performance.now();
    // The build bundles the hook runner (scripts/bundle-hook.mjs) so a hook process loads one module; source runs fall back.
    let runner: typeof import('../hooks/run.js');
    try { runner = nodeModule.createRequire(import.meta.url)('../hooks/run.bundle.cjs') as typeof runner; }
    catch { runner = await import('../hooks/run.js'); }
    const { runHook } = runner;
    await runHook(agent as AgentName, event as HookEventName, 2000, { startupMs, bundleMs: performance.now() - startupMs });
  } catch {
    if (agent === 'cursor' && event === 'pre_tool') process.stdout.write('{"permission":"allow"}\n');
  }
  process.exitCode = 0;
} else if (command === 'mcp' && process.argv.length === 3) {
  const { runMcp } = await import('../mcp/relay.js');
  await runMcp();
} else if (command === '__mcp_service' && process.argv.length === 4) {
  const { runService } = await import('../mcp/daemon.js');
  await runService(agent!);
} else {
  await import('./program.js');
}
