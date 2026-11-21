import { TextDecoder } from 'node:util';
import { z } from 'zod';
import { fileOutline, findCode } from '../../index/navigation.js';
import { indexDbPath } from '../../index/store.js';
import { openDb } from '../../store/db.js';
import { sha1 } from '../../util/hash.js';
import { log } from '../../util/log.js';
import { readRepoFile, repoRelative } from '../../util/repo-file.js';
import { estimateTokens, TOKEN_ESTIMATE_METHOD } from '../../util/tokens.js';
import { updateSessionLedger } from '../session-ledger.js';
import type { HookHandler, HookResult } from '../types.js';

const MAX_READ_BYTES = 1_000_000;
const MAX_HISTORY = 256;
const safeId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const readInput = z.object({
  file_path: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
  pages: z.never().optional(),
});
const textResponse = z.object({
  type: z.literal('text'),
  file: z.object({
    filePath: z.string(),
    content: z.string(),
    startLine: z.number().int().positive(),
    numLines: z.number().int().positive(),
  }),
});
const range = z.object({ file: z.string(), hash: z.string(), from: z.number(), to: z.number() });
const read = range.extend({ step: z.number(), estimatedTokens: z.number() });
const navigationState = z.object({
  reads: z.array(read).default([]),
  pending: range.optional(),
  lastQuery: z.string().optional(),
  step: z.number().default(0),
  forcedReads: z.number().default(0),
  blockedReads: z.number().default(0),
  estimatedTokensSaved: z.number().default(0),
});

function sameFile(a: z.infer<typeof range>, b: z.infer<typeof range>): boolean {
  return a.file === b.file && a.hash === b.hash;
}

function hint(root: string, file: string, lines: number, query?: string): string {
  const label = JSON.stringify(file);
  const base = `Large read allowed (${lines} lines). Next time, use outline({"file":${label}}) then read_symbol, or request a line range.`;
  // The read hook never waits for a writer or refreshes the index for a non-blocking hint.
  try {
    const db = openDb(indexDbPath(root), { readonly: true });
    try {
      const ni = fileOutline(db, file);
      if (!ni) return `Large read allowed (${lines} lines). File is not indexed; prefer a ranged Read.`;
      if (!ni.symbols.length) return base;
      const relevant = query ? findCode(db, query, undefined, file).filter((s) => s.score > 0) : [];
      const ids = (relevant.length ? relevant : ni.symbols).slice(0, 2).map((s) => JSON.stringify({ symbol: s.id }));
      return `${base} Try ${ids.map((args) => `read_symbol(${args})`).join(' or ')}.`;
    } finally {
      db.close();
    }
  } catch {
    return base; // missing or unavailable index
  }
}

export const readGuard: HookHandler = {
  name: 'read_guard',
  events: ['pre_tool', 'post_tool', 'pre_compact'],
  run(ev, { root, config }) {
    if (ev.agent !== 'claude' || !config.navigation.readGuard.enabled) return null;
    const session = safeId.safeParse(ev.sessionId);
    if (!session.success) return null;
    const id = session.data;
    const event = z.object({ agent_id: z.string().optional(), hook_event_name: z.string().optional() }).safeParse(ev.raw);
    // A subagent may share the session ID but not its parent's context.
    if (!event.success || event.data.agent_id) return null;
    const update = (fn: (state: z.infer<typeof navigationState>) => z.infer<typeof navigationState>) => {
      updateSessionLedger(root, id, (ledger) => {
        const prev = navigationState.parse(ledger.navigation ?? {});
        const next = fn(prev);
        return next === prev ? ledger : { ...ledger, navigation: next };
      });
    };
    if (ev.event === 'pre_compact') {
      update((s) => s.reads.length || s.pending || s.lastQuery ? { ...s, reads: [], pending: undefined, lastQuery: undefined } : s);
      return null;
    }
    if (ev.event === 'post_tool' && /^mcp__(?:plugin_groundwork_)?groundwork__find_code$/.test(ev.tool ?? '')) {
      const match = z.string().trim().min(1).max(256).safeParse(ev.input.query);
      if (match.success) update((s) => ({ ...s, lastQuery: match.data }));
      return null;
    }
    if (ev.tool !== 'Read') return null;
    const input = readInput.safeParse(ev.input);
    if (!input.success) return null;
    const file = repoRelative(root, input.data.file_path, ev.cwd);
    if (!file || file.split('/').some((part) => part === '.git' || part === '.groundwork')) return null;
    const output = textResponse.safeParse(ev.response);
    if (ev.event === 'post_tool' && !output.success) return null;
    const buf = readRepoFile(root, file, MAX_READ_BYTES);
    if (!buf || buf.includes(0)) return null;
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
    const lines = source.split(/\r?\n/);
    const lineCount = lines.length - Number(lines.at(-1) === '');
    const hash = sha1(buf);
    const from = Math.max(1, input.data.offset ?? 1);
    const to = Math.min(lineCount, from + (input.data.limit ?? lineCount) - 1);
    if (from > to) return null;
    if (ev.event === 'post_tool' && output.success) {
      const actual = output.data.file;
      const end = Math.min(to, from + actual.numLines - 1);
      // Record only text actually delivered. A changed file, failure, or unknown Read shape can't cause a later denial.
      if (actual.startLine !== from || repoRelative(root, actual.filePath, ev.cwd) !== file) return null;
      const observed = actual.content.replaceAll('\r\n', '\n');
      const expected = lines.slice(from - 1, end).join('\n');
      if (!expected || (observed !== expected && observed !== expected + '\n')) return null;
      update((s) => ({
        ...s, step: s.step + 1,
        reads: [...s.reads.filter((r) => r.file !== file || (r.hash === hash && !(from <= r.from && end >= r.to))),
          { file, hash, from, to: end, step: s.step + 1, estimatedTokens: estimateTokens(actual.content) }].slice(-MAX_HISTORY),
      }));
      return null;
    }
    if (ev.event !== 'pre_tool') return null;
    const requested = { file, hash, from, to };
    let result: HookResult | null = null;
    let eventLog: { name: string; estimatedTokensSaved: number } | undefined;
    let recentQuery: string | undefined;
    update((s) => {
      recentQuery = s.lastQuery;
      if (s.pending && sameFile(s.pending, requested) && s.pending.from === from && s.pending.to === to) {
        eventLog = { name: 'read_guard_forced', estimatedTokensSaved: 0 };
        return { ...s, pending: undefined, forcedReads: s.forcedReads + 1 };
      }
      const previous = s.reads.findLast((r) => sameFile(r, requested) && r.from <= from && r.to >= to);
      if (!previous) return s.pending ? { ...s, pending: undefined } : s;
      const saved = estimateTokens(lines.slice(from - 1, to).join('\n'));
      result = {
        action: 'deny',
        message: `Unchanged since Read step ${previous.step} (lines ${previous.from}-${previous.to}). Use outline({"file":${JSON.stringify(file)}}) and read_symbol for the part you need, or repeat this exact Read to force it once.`,
      };
      eventLog = { name: 'read_guard_blocked', estimatedTokensSaved: saved };
      return { ...s, pending: requested, blockedReads: s.blockedReads + 1, estimatedTokensSaved: s.estimatedTokensSaved + saved };
    });
    if (eventLog) log(root, 'info', eventLog.name, { sessionId: id, file, from, to, estimatedTokensSaved: eventLog.estimatedTokensSaved, method: TOKEN_ESTIMATE_METHOD });
    if (result) return result;
    if (input.data.offset === undefined && input.data.limit === undefined && lineCount > config.navigation.readGuard.largeFileLines) {
      return { action: 'context', message: hint(root, file, lineCount, recentQuery) };
    }
    return null;
  },
};
