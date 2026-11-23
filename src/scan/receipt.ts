import type { GroundworkConfig } from '../config/schema.js';
import { readLedger } from '../guards/ledger.js';
import { changeImpact } from '../impact/index.js';
import type { Db } from '../store/db.js';

export interface Receipt {
  sessionId: string;
  callsChecked: number;
  inventedCallsCaught: number;
  duplicatesPrevented: number;
  /** Callers of the symbols this session changed, and how many sit in files it also edited. Null when impact could not be computed. */
  callers: { updated: number; total: number } | null;
  /** Tests that cover the change and how many were seen running. Whether they passed is not recorded. */
  tests: { ran: number; affected: number } | null;
  addedMs: number;
}

/** Counts only: no file names, symbol names or code leave the machine in a receipt. */
export async function buildReceipt(db: Db, root: string, sessionId: string, config: GroundworkConfig): Promise<Receipt> {
  const ledger = readLedger(root, sessionId);
  const receipt: Receipt = { sessionId, callsChecked: ledger.callsChecked, inventedCallsCaught: ledger.inventedCallsCaught,
    duplicatesPrevented: ledger.duplicatesPrevented, callers: null, tests: null, addedMs: Math.round(ledger.hookMs) };
  try {
    const impact = await changeImpact(db, root, { sessionId, config });
    if (impact.complete) {
      const callers = new Map(impact.symbols.flatMap((s) => s.callers).filter((c) => c.depth === 1).map((c) => [`${c.file}:${c.line}`, c.changedFile]));
      receipt.callers = { updated: [...callers.values()].filter(Boolean).length, total: callers.size };
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
    `Callers updated: ${r.callers ? `${r.callers.updated}/${r.callers.total}` : 'unknown'}`,
    `Affected tests run: ${r.tests ? `${r.tests.ran}/${r.tests.affected}` : 'unknown'} (pass/fail not recorded)`,
    `Time added: ${(r.addedMs / 1000).toFixed(1)}s`,
  ];
}
