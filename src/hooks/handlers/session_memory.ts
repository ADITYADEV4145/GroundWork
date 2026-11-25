import { estimateTokens, fitToBudget } from '../../util/tokens.js';
import { memorySymbols, nextTurn, sessionMemory } from '../session-memory.js';
import type { HookHandler } from '../types.js';

export const sessionMemoryPrompt: HookHandler = {
  name: 'session_memory', events: ['prompt'],
  run(ev, { root, config }) {
    if (!config.reuse.sessionMemory || !ev.sessionId) return null;
    try {
      const turn = nextTurn(root, ev.sessionId);
      if (turn < 2) return null;
      const current = new Map(memorySymbols(root).map((s) => [s.id, s]));
      const written = sessionMemory(root, ev.sessionId).written.filter((s) => s.turn < turn && current.get(s.id)?.bodyHash === s.bodyHash).reverse();
      const header = 'Code you wrote earlier in this session; reuse or extend it before writing new code:';
      const clean = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, ' ');
      const lines = written.map((s) => {
        const now = current.get(s.id)!;
        const params = now.signature.match(/\([^)]*\)/)?.[0] ?? '()';
        return clean(`${s.qualifiedName}${params} ${s.file}:${now.line}`);
      }).filter((s) => estimateTokens(s) <= 150);
      if (!lines.length) return null;
      return { action: 'context', message: [header, ...fitToBudget(lines, (s) => s, 190, estimateTokens(header) + 2).items].join('\n') };
    } catch { return null; }
  },
};
