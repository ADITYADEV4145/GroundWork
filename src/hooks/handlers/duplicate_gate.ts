import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { bumpCounter } from '../../guards/ledger.js';
import { sha1 } from '../../util/hash.js';
import { log } from '../../util/log.js';
import { ensureGwDir } from '../../util/paths.js';
import { fitToBudget } from '../../util/tokens.js';
import type { HookHandler } from '../types.js';

/** The gate compares the working tree with HEAD, so an unchanged tree has nothing to report. Unknown means run the gate. */
function unchangedSinceHead(root: string): boolean {
  try {
    return execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, timeout: 300, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).length === 0;
  } catch { return false; }
}

export const duplicateGate: HookHandler = {
  name: 'duplicate_gate',
  events: ['stop'],
  async run(ev, { root, config }) {
    const raw = ev.raw as { stop_hook_active?: unknown } | null;
    if ((!config.reuse.duplicateGate && !(config.types.enabled && config.types.stopGate)) || raw?.stop_hook_active === true) return { action: 'allow' };
    if (unchangedSinceHead(root)) return { action: 'allow' };
    try {
      const { checkRepository, formatFinding } = await import('../../reuse/check.js');
      const report = await checkRepository(root, { config, timeoutMs: 1500, stopHook: true });
      const blocks = report.findings.filter((f) => (config.reuse.duplicateGate || f.grounding?.kind === 'type' || f.grounding?.typeBlocking === true) && f.severity === 'BLOCK');
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
      bumpCounter(root, ev.sessionId, 'duplicatesPrevented', blocks.filter((f) => f.kind.startsWith('duplicate')).length);
      const strict = config.profile === 'strict' && blocks.some((f) => f.severity === 'BLOCK');
      log(root, 'info', 'duplicate_gate', { status: strict ? 'blocked' : 'warned', sessionId: ev.sessionId, findingSet, findings: blocks.slice(0, 50).map((f) => ({ kind: f.grounding ? `grounding:${f.grounding.kind}` : f.kind, file: f.added.file, line: f.added.line, symbol: f.added.symbol })) });
      const budgeted = fitToBudget(blocks, formatFinding, 500);
      // Only the strict profile blocks the stop; standard reports the same findings without holding the agent.
      return { action: strict ? 'deny' : 'context', message: budgeted.items.map(formatFinding).join('\n\n') };
    } catch (error) {
      log(root, 'warn', 'duplicate_gate_failed_open', { error: (error as Error).message });
      return { action: 'allow' };
    }
  },
};
