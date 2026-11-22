import { existsSync } from 'node:fs';
import { readSessionSymbols } from '../index/query.js';
import { indexDbPath } from '../index/store.js';
import { openDb } from '../store/db.js';
import { readSessionLedger, updateSessionLedger } from './session-ledger.js';
import * as z from 'zod';

const writtenSchema = z.object({
  id: z.string(), qualifiedName: z.string(), kind: z.string(), file: z.string(),
  line: z.number(), signature: z.string(), bodyHash: z.string(), turn: z.number().int().nonnegative(),
});
export type SessionWritten = z.infer<typeof writtenSchema>;
const memorySchema = z.object({ turn: z.number().int().nonnegative().default(0), written: z.array(writtenSchema).max(200).default([]) });
export function sessionMemory(root: string, session: string) {
  return memorySchema.parse(readSessionLedger(root, session));
}
export function memorySymbols(root: string): Omit<SessionWritten, 'turn'>[] {
  if (!existsSync(indexDbPath(root))) return [];
  const db = openDb(indexDbPath(root), { readonly: true });
  try {
    return readSessionSymbols(db);
  } finally { db.close(); }
}
export function recordWritten(root: string, session: string, before: Omit<SessionWritten, 'turn'>[], after: Omit<SessionWritten, 'turn'>[]): void {
  const previous = new Map(before.map((s) => [s.id, s.bodyHash]));
  const current = new Map(after.map((s) => [s.id, s]));
  updateSessionLedger(root, session, (ledger) => {
    const memory = memorySchema.parse(ledger);
    const changed = after.filter((s) => previous.get(s.id) !== s.bodyHash);
    const changedIds = new Set(changed.map((s) => s.id));
    const written = memory.written.filter((s) => current.has(s.id) && !changedIds.has(s.id))
      .map((s) => ({ ...current.get(s.id)!, turn: s.turn }));
    return { ...ledger, written: [...written, ...changed.map((s) => ({ ...s, turn: memory.turn }))].slice(-200) };
  });
}
export function nextTurn(root: string, session: string): number {
  let turn = 0;
  updateSessionLedger(root, session, (ledger) => {
    turn = memorySchema.parse(ledger).turn + 1;
    return { ...ledger, turn };
  });
  return turn;
}
