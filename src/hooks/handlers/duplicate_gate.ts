import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { sha1 } from '../../util/hash.js';
import { log } from '../../util/log.js';
import { ensureGwDir } from '../../util/paths.js';
import { fitToBudget } from '../../util/tokens.js';
import type { HookHandler } from '../types.js';

export const duplicateGate: HookHandler = {
  name: 'duplicate_gate',
  events: ['stop'],
  async run(ev, { root, config }) {
    const raw = ev.raw as { stop_hook_active?: unknown } | null;
    if (!config.reuse.duplicateGate || raw?.stop_hook_active === true) return { action: 'allow' };
    try {
      const { checkRepository, formatFinding } = await import('../../reuse/check.js');
      let sessionWritten;
      if (config.reuse.sessionMemory && ev.sessionId) {
        try {
          const { sessionMemory } = await import('../session-memory.js');
          sessionWritten = sessionMemory(root, ev.sessionId).written;
        } catch { /* A damaged ledger must not prevent the gate from running. */ }
      }
      const report = await checkRepository(root, { config, timeoutMs: 1500, sessionWritten });
      const blocks = report.findings.filter((f) => f.severity === 'BLOCK');
      if (!blocks.length) return { action: 'allow' };
      const findingSet = sha1(JSON.stringify(blocks.map((f) => f.id).sort()));
      const session = sha1(`${ev.agent}:${ev.sessionId ?? '<anonymous>'}`);
      const marker = path.join(ensureGwDir(root, 'sessions', session), `${findingSet}.json`);
      try {
        writeFileSync(marker, JSON.stringify({ findingSet, ids: blocks.map((f) => f.id) }), { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        log(root, 'info', 'duplicate_gate', { status: 'ignored', sessionId: ev.sessionId, findingSet });
        return { action: 'allow' };
      }
      const strict = config.profile === 'strict';
      log(root, 'info', 'duplicate_gate', { status: strict ? 'blocked' : 'warned', sessionId: ev.sessionId, findingSet });
      const budgeted = fitToBudget(blocks, formatFinding, 500);
      // Only the strict profile blocks the stop; standard reports the same findings without holding the agent.
      return { action: strict ? 'deny' : 'context', message: budgeted.items.map(formatFinding).join('\n\n') };
    } catch (error) {
      log(root, 'warn', 'duplicate_gate_failed_open', { error: (error as Error).message });
      return { action: 'allow' };
    }
  },
};
