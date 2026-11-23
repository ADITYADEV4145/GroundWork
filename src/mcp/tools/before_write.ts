import { z } from 'zod';
import { navigationSymbols, symbolCalls } from '../../index/navigation.js';
import { fitToBudget } from '../../util/tokens.js';
import { defineTool } from '../registry.js';

const BUDGET = 700;
const ref = z.string().trim().min(1).max(256);
const one = (s: string, max = 200) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length <= max ? t : t.slice(0, max - 1) + '…'; };

/** One answer for the three questions asked before writing code: what to reuse, how to call it, and who breaks if it changes. */
export const beforeWriteTool = defineTool({
  name: 'before_write',
  description: 'One call before writing non-trivial code, instead of find_similar + read_symbol + callers. Give any of: new (a helper you are about to add: existing code to reuse), calls (symbols you will call: exact signatures), changes (symbols whose signature or behavior you will change: every caller to update). Skip for small edits, docs, config and symbols already confirmed in context.',
  inputSchema: {
    new: z.object({ description: z.string().trim().min(1).max(10000), name: z.string().max(300).optional(), signature: z.string().max(10000).optional(),
      language: z.enum(['typescript', 'tsx', 'javascript', 'python']).optional() }).strict().optional().describe('helper you are about to add'),
    calls: z.array(ref).max(20).optional().describe('symbols you will call: name, file:qualifiedName or symbol ID'),
    changes: z.array(ref).max(10).optional().describe('symbols you will change'),
    expand: z.enum(['reuse', 'callers']).optional().describe('repeat the same call with this to get the full section'),
    offset: z.number().int().min(0).optional().describe('with expand "callers": skip this many call sites, to page past the first answer'),
  },
  async handler(args, { root, db, config }) {
    if (!args.new && !args.calls?.length && !args.changes?.length) throw new Error('Provide new, calls or changes.');
    const sections: string[] = [];
    if (args.new) {
      const { cachedCandidates } = await import('../../reuse/candidate-cache.js');
      const { findSimilar } = await import('../../reuse/similar.js');
      const index = await cachedCandidates(db, root, config);
      await index.prepareMeaning(root, config);
      const { matches } = await findSimilar(index, { ...args.new, detail: args.expand === 'reuse' ? 'full' : 'compact' });
      const rows = matches.map((m) => `${m.verdict}: ${m.symbol} (${m.file}:${m.line}) — ${one(m.why, 120)}`);
      const shown = args.expand === 'reuse' ? rows : rows.slice(0, 3);
      sections.push('Reuse\n' + (shown.length ? shown.join('\n') : 'nothing to reuse; write it new')
        + (rows.length > shown.length ? `\n… ${rows.length - shown.length} more: expand "reuse"` : ''));
    }
    if (args.calls?.length) {
      sections.push('Signatures\n' + args.calls.map((name) => {
        const found = navigationSymbols(db, name);
        if (!found.length) return `${name}: not in the index. Do not call it; search with find_code.`;
        const rows = found.slice(0, 2).map((s) => `${one(s.signature || s.name)} (${s.file}:${s.line})`);
        return rows.join('\n') + (found.length > 2 ? `\n… ${found.length - 2} more named ${name}; pass file:name` : '');
      }).join('\n'));
    }
    if (args.changes?.length) {
      const expanded = args.expand === 'callers', limit = expanded ? 60 : 8, offset = expanded ? args.offset ?? 0 : 0;
      sections.push('Callers to update\n' + args.changes.map((name) => {
        const found = navigationSymbols(db, name);
        if (!found.length) return `${name}: not in the index.`;
        // Overloads share a file and qualified name and are changed together; anything else must be told apart.
        if (found.some((s) => s.file !== found[0]!.file || s.name !== found[0]!.name))
          return `${name}: ${found.length} symbols match; pass file:Qualified.name or one of these IDs\n`
            + found.slice(0, 5).map((s) => `  ${s.id} ${s.name} (${s.file}:${s.line})`).join('\n') + (found.length > 5 ? `\n  … ${found.length - 5} more` : '');
        const symbol = found[0]!, sites = found.flatMap((s) => symbolCalls(db, s.id, 'callers'));
        const seen = new Set<string>(), rows: string[] = [];
        for (const c of sites) { const key = `${c.file}:${c.line}`; if (!seen.has(key)) { seen.add(key); rows.push(`  ${key} in ${c.name}`); } }
        const files = new Set(sites.map((c) => c.file)).size, shown = rows.slice(offset, offset + limit), left = rows.length - offset - shown.length;
        return `${one(symbol.signature || symbol.name)} (${symbol.file}:${symbol.line}): ${rows.length ? `${rows.length} call site(s) in ${files} file(s)` : 'no indexed callers'}`
          + (shown.length ? '\n' + shown.join('\n') : '')
          + (left > 0 ? `\n  … ${left} more: expand "callers", offset ${offset + shown.length}` : '');
      }).join('\n'));
    }
    const budget = args.expand ? BUDGET * 3 : BUDGET;
    const { items, truncated: dropped } = fitToBudget(sections.join('\n\n').split('\n'), (line) => line, budget);
    return items.join('\n') + (dropped ? `\n… ${dropped} line(s) over budget; pass one symbol per call` : '');
  },
});
