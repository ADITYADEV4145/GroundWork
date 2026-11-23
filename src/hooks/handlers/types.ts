import type { HookHandler } from '../types.js';
import { EDIT_TOOLS } from '../edit-tools.js';
import { log } from '../../util/log.js';

export const typesOnEdit: HookHandler = {
  name: 'types_on_edit', events: ['post_tool'], tools: EDIT_TOOLS,
  async run(ev, { root, config }) {
    if (!config.types.enabled || !config.types.postToolHook) return null;
    try {
      const { changedFromToolInput } = await import('../../grounding/ranges.js');
      const { typeCheck, renderTypes } = await import('../../types/index.js');
      const result = await typeCheck(root, changedFromToolInput(root, ev.cwd, ev.input), config);
      if (result.timedOut) log(root, 'warn', 'types_failed_open', { reason: 'timeout' });
      const message = renderTypes(result, config.types.budgetTokens, false);
      return message ? { action: 'context', message } : null;
    } catch (e) { log(root, 'warn', 'types_failed_open', { reason: (e as Error).message }); return null; }
  },
};
