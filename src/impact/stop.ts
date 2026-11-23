import { fork } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sha1 } from '../util/hash.js';
import { ensureGwDir } from '../util/paths.js';
import { log } from '../util/log.js';
import type { HookHandler } from '../hooks/types.js';
import { renderImpact, type ImpactReport } from './index.js';

export const impactStop: HookHandler = {
  name: 'impact', events: ['stop'],
  async run(ev, { root, config }) {
    if (!config.impact.enabled || !config.impact.stopGate || (ev.raw as { stop_hook_active?: boolean } | null)?.stop_hook_active) return null;
    try {
      const result = await new Promise<ImpactReport>((resolve, reject) => {
        const compiled = new URL('../impact/worker.js', import.meta.url);
        const source = new URL('../impact/worker.ts', import.meta.url);
        const js = existsSync(fileURLToPath(compiled));
        const worker = fork(fileURLToPath(js ? compiled : source), [], { execArgv: js ? [] : ['--import', 'tsx'], ...(js ? {} : { cwd: fileURLToPath(new URL('../..', import.meta.url)) }), stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        const timer = setTimeout(() => { worker.kill(); reject(new Error('impact hook timeout')); }, config.impact.timeoutMs);
        worker.once('message', (value: ImpactReport & { error?: string }) => {
          clearTimeout(timer); worker.kill();
          if (value.error) reject(new Error(value.error)); else resolve(value);
        });
        worker.once('error', (error) => { clearTimeout(timer); worker.kill(); reject(error); });
        worker.once('exit', () => { clearTimeout(timer); reject(new Error('impact worker exited')); });
        worker.send({ root, config, sessionId: ev.sessionId ?? undefined });
      });
      const message = renderImpact(result, config.impact.budgetTokens, true);
      if (!message || result.incompleteBecause.includes('impact timeout')) return null;
      const relevant = result.symbols.filter((s) => s.risk !== 'low' && (s.callers.some((c) => !c.changedFile && !c.lookedAt) || s.tests.some((t) => !t.ran)));
      const fingerprint = sha1(JSON.stringify(relevant));
      const dir = ensureGwDir(root, 'sessions', sha1(`${ev.agent}:${ev.sessionId ?? '<anonymous>'}`));
      try { writeFileSync(path.join(dir, `impact-${fingerprint}.json`), '{}\n', { flag: 'wx' }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null; throw error; }
      return { action: 'context', message };
    } catch (error) {
      log(root, 'warn', 'impact_failed_open', { error: (error as Error).message });
      return null;
    }
  },
};
