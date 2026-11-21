import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readSessionLedger, updateSessionLedger } from '../hooks/session-ledger.js';

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
export const tokens = (text: string) => Buffer.byteLength(text) / 4;
export function emptyLedger(sessionId: string): Ledger {
  return { sessionId, method: 'bytes/4', step: 0, guards: {}, commands: {}, exploration: { files: [], hinted: false }, duplicatesPrevented: 0, inventedCallsCaught: 0, ignores: 0 };
}
export function readLedger(root: string, id: string): Ledger {
  try {
    const x = readSessionLedger(root, id).guards as Ledger;
    if (x.sessionId !== id || x.method !== 'bytes/4' || !Number.isFinite(x.step) || !x.guards || !x.commands || !Array.isArray(x.exploration.files)) throw new Error('invalid ledger');
    return x;
  } catch { return emptyLedger(id); }
}
export function updateLedger(root: string, id: string | null | undefined, update: (ledger: Ledger) => void): void {
  if (!id) return;
  updateSessionLedger(root, id, (document) => {
    const ledger = readLedger(root, id);
    update(ledger);
    return { ...document, guards: ledger };
  });
}
export function stats(ledger: Ledger, guard: string): GuardStats {
  return ledger.guards[guard] ??= { interventions: 0, tokensSaved: 0, forced: 0 };
}
export function bumpCounter(root: string, id: string | null, counter: 'duplicatesPrevented' | 'inventedCallsCaught' | 'ignores', amount = 1): void {
  updateLedger(root, id, (l) => { l[counter] += amount; });
}
export function sessionIds(root: string): string[] {
  try { return readdirSync(dir(root)).filter((f) => f.endsWith('.json')).sort((a, b) => statSync(path.join(dir(root), b)).mtimeMs - statSync(path.join(dir(root), a)).mtimeMs).map((f) => decodeURIComponent(f.slice(0, -5))); }
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
