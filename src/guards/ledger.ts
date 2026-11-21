import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import * as z from 'zod';
import { readSessionLedger, updateSessionLedger } from '../hooks/session-ledger.js';
import { log } from '../util/log.js';

export interface GuardStats { interventions: number; tokensSaved: number; forced: number }
export interface CommandRecord { step: number; fingerprint: string; summary: string; logPath: string | null; outputBytes: number }
export interface Ledger {
  sessionId: string;
  method: 'bytes/4';
  step: number;
  guards: Record<string, GuardStats>;
  commands: Record<string, CommandRecord>;
  exploration: { files: string[]; hinted: boolean };
  duplicatesPrevented: number;
  inventedCallsCaught: number;
  ignores: number;
}
const dir = (root: string) => path.join(root, '.groundwork', 'sessions');
const count = z.number().finite().nonnegative();
const ledgerSchema = z.object({
  sessionId: z.string(), method: z.literal('bytes/4'), step: count,
  guards: z.record(z.string(), z.object({ interventions: count, tokensSaved: count, forced: count })),
  commands: z.record(z.string(), z.object({ step: count, fingerprint: z.string(), summary: z.string(), logPath: z.string().nullable(), outputBytes: count })),
  exploration: z.object({ files: z.array(z.string()), hinted: z.boolean() }),
  duplicatesPrevented: count, inventedCallsCaught: count, ignores: count,
}).passthrough();
function parseLedger(value: unknown, id: string): Ledger {
  const parsed = ledgerSchema.safeParse(value);
  if (parsed.success && parsed.data.sessionId === id) return parsed.data;
  const document = z.record(z.string(), z.unknown()).safeParse(value);
  return { ...(document.success ? document.data : {}), ...emptyLedger(id) };
}
export const tokens = (text: string) => Buffer.byteLength(text) / 4;
export function emptyLedger(sessionId: string): Ledger {
  return { sessionId, method: 'bytes/4', step: 0, guards: {}, commands: {}, exploration: { files: [], hinted: false }, duplicatesPrevented: 0, inventedCallsCaught: 0, ignores: 0 };
}
export function readLedger(root: string, id: string): Ledger {
  try {
    return parseLedger(readSessionLedger(root, id).guards, id);
  } catch { return emptyLedger(id); }
}
export function updateLedger(root: string, id: string | null | undefined, update: (ledger: Ledger) => void): boolean {
  if (!id) return false;
  try {
    updateSessionLedger(root, id, (document) => {
      const ledger = parseLedger(document.guards, id);
      update(ledger);
      return { ...document, guards: ledger };
    });
    return true;
  } catch (error) { log(root, 'warn', 'guards_ledger_failed', { error: String(error) }); return false; }
}
export function stats(ledger: Ledger, guard: string): GuardStats {
  return ledger.guards[guard] ??= { interventions: 0, tokensSaved: 0, forced: 0 };
}
export function bumpCounter(root: string, id: string | null, counter: 'duplicatesPrevented' | 'inventedCallsCaught' | 'ignores', amount = 1): void {
  updateLedger(root, id, (l) => { l[counter] += amount; });
}
export function sessionIds(root: string): string[] {
  try { return readdirSync(dir(root)).filter((f) => /^[A-Za-z0-9_-]{1,128}\.json$/.test(f)).sort((a, b) => statSync(path.join(dir(root), b)).mtimeMs - statSync(path.join(dir(root), a)).mtimeMs).map((f) => f.slice(0, -5)); }
  catch { return []; }
}
export function report(root: string, ids: string[]): Ledger & { forced: number; forceRate: number } {
  const total = emptyLedger(ids.length === 1 ? ids[0]! : 'all');
  for (const id of ids) {
    const l = readLedger(root, id);
    total.step += l.step;
    for (const [name, s] of Object.entries(l.guards)) {
      const t = stats(total, name);
      t.interventions += s.interventions; t.tokensSaved += s.tokensSaved; t.forced += s.forced;
    }
    total.duplicatesPrevented += l.duplicatesPrevented;
    total.inventedCallsCaught += l.inventedCallsCaught;
    total.ignores += l.ignores;
  }
  const forced = Object.values(total.guards).reduce((n, s) => n + s.forced, 0);
  const interventions = Object.values(total.guards).reduce((n, s) => n + s.interventions, 0);
  return { ...total, forced, forceRate: forced / (forced + interventions || 1) };
}
export function summary(l: Ledger): string {
  const saved = Object.values(l.guards).reduce((n, s) => n + s.tokensSaved, 0);
  return `Groundwork saved ~${saved >= 1000 ? `${Math.round(saved / 1000)}k` : Math.round(saved)} tokens, blocked ${l.duplicatesPrevented} duplicate${l.duplicatesPrevented === 1 ? '' : 's'}, caught ${l.inventedCallsCaught} invented calls.`;
}
