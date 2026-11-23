import type { GroundworkConfig } from '../config/schema.js';
import { readLedger } from '../guards/ledger.js';
import { changeImpact } from '../impact/index.js';
import type { Db } from '../store/db.js';

export interface Receipt {
  sessionId: string;
  callsChecked: number;
  inventedCallsCaught: number;
  duplicatesPrevented: number;
  /** Direct callers of the symbols changed in the working tree, and how many of them the change also edited. Null when it cannot be told. */
  callers: { updated: number; total: number } | null;
  /** Tests that cover the working-tree change and how many were seen running. Whether they passed is not recorded. */
  tests: { ran: number; affected: number } | null;
  addedMs: number;
}

/** Counts only: no file names, symbol names or code leave the machine in a receipt. */
export async function buildReceipt(db: Db, root: string, sessionId: string, config: GroundworkConfig, current = true): Promise<Receipt> {
  const ledger = readLedger(root, sessionId);
  const receipt: Receipt = { sessionId, callsChecked: ledger.callsChecked, inventedCallsCaught: ledger.inventedCallsCaught,
    duplicatesPrevented: ledger.duplicatesPrevented, callers: null, tests: null, addedMs: Math.round(ledger.hookMs) };
  // Callers and tests are read from the uncommitted change, which belongs to the latest session only; an older
  // session, or one whose work is already committed, has nothing left to measure and stays unknown.
  if (!current) return receipt;
  try {
    const impact = await changeImpact(db, root, { sessionId, config });
    if (impact.complete && impact.symbols.length) {
      const sites = new Map(impact.symbols.flatMap((s) => s.callers).filter((c) => c.depth === 1).map((c) => [`${c.file}:${c.line}`, c.changedFile]));
      // Call sites inside functions the change rewrote are not listed as callers; they were updated by definition.
      const edited = impact.symbols.reduce((n, s) => n + s.callersEdited, 0);
      receipt.callers = { updated: [...sites.values()].filter(Boolean).length + edited, total: sites.size + edited };
      if (impact.evidenceKnown) {
        const tests = new Map(impact.symbols.flatMap((s) => s.tests).map((t) => [t.file, t.ran]));
        receipt.tests = { ran: [...tests.values()].filter(Boolean).length, affected: tests.size };
      }
    }
  } catch { /* the counts above still stand */ }
  return receipt;
}

export function receiptLines(r: Receipt): string[] {
  return [
    'GroundWork session receipt',
    `Calls checked: ${r.callsChecked}`,
    `Invented calls caught: ${r.inventedCallsCaught}`,
    `Duplicates prevented: ${r.duplicatesPrevented}`,
    `Callers updated: ${r.callers ? `${r.callers.updated}/${r.callers.total}` : 'unknown'} (uncommitted change)`,
    `Affected tests run: ${r.tests ? `${r.tests.ran}/${r.tests.affected}` : 'unknown'} (pass/fail not recorded)`,
    `Time added: ${(r.addedMs / 1000).toFixed(1)}s`,
  ];
}
