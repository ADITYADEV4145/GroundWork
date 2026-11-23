import { changedFromToolInput, renderResults, verifyChangedDeep } from '../../grounding/index.js';
import { indexDbPath } from '../../index/store.js';
import { openDb } from '../../store/db.js';
import { log } from '../../util/log.js';
import { updateLedger } from '../../guards/ledger.js';
import { hookTiming } from '../../util/hook-timing.js';
import type { HookHandler } from '../types.js';
import { EDIT_TOOLS } from '../edit-tools.js';

// Phase 4: after an edit (and after refresh_on_edit re-indexed it), check only the changed lines for invented
// imports, calls, members and wrong arguments. Feedback is context for the agent, never a block; silent when clean.
export const groundingOnEdit: HookHandler = {
  name: 'grounding_on_edit',
  events: ['post_tool'],
  tools: EDIT_TOOLS,
  async run(ev, { root, config }) {
    if (!config.grounding.enabled || !config.grounding.postToolHook) return null;
    const changed = changedFromToolInput(root, ev.cwd, ev.input).filter((c) => c.ranges === null || c.ranges.length);
    if (!changed.length) return null;
    const t = performance.now();
    const db = openDb(indexDbPath(root), { readonly: true });
    hookTiming('groundingOpenMs', performance.now() - t);
    try {
      const verifyStart = performance.now();
      const results = await verifyChangedDeep(db, root, changed, config);
      hookTiming('verifyMs', performance.now() - verifyStart);
      const n = results.reduce((a, r) => a + r.findings.length, 0);
      hookTiming('groundingFiles', results.length);
      hookTiming('groundingUnchecked', results.filter((r) => r.unchecked).length);
      hookTiming('groundingFindings', n);
      log(root, 'info', 'grounding_checked', { files: changed.length, findings: n, ms: Math.round(performance.now() - t) });
      updateLedger(root, ev.sessionId, (l) => { l.callsChecked += results.reduce((a, r) => a + (r.checked ?? 0), 0); l.inventedCallsCaught += n; });
      if (!n) return null;
      return { action: 'context', message: renderResults(results, config.grounding.budgetTokens, { header: 'Groundwork: {n} grounding issue(s) in the lines you just changed — these names/arguments do not match the code:' }) };
    } finally {
      db.close();
    }
  },
};
