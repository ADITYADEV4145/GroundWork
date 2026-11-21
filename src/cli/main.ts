#!/usr/bin/env node
import * as nodeModule from 'node:module';
import type { AgentName, HookEventName } from '../hooks/types.js';

try { nodeModule.enableCompileCache?.(); } catch { /* Optional startup optimization. */ }

const [, , command, agent, event] = process.argv;
if (command === 'hook' && process.argv.length === 5 &&
  ['claude', 'codex', 'cursor'].includes(agent ?? '') &&
  ['pre_tool', 'post_tool', 'session_start', 'prompt', 'stop', 'pre_compact'].includes(event ?? '')) {
  try {
    const { runHook } = await import('../hooks/run.js');
    await runHook(agent as AgentName, event as HookEventName);
  } catch {
    if (agent === 'cursor' && event === 'pre_tool') process.stdout.write('{"permission":"allow"}\n');
  }
  process.exitCode = 0;
} else {
  await import('./program.js');
}
