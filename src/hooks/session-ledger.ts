import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { withFileLock } from '../index/lock.js';
import { ensureGwDir, gwPath } from '../util/paths.js';

const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const ledgerSchema = z.record(z.string(), z.unknown());
type Ledger = Record<string, unknown>;

function ledgerPath(root: string, sessionId: string): string {
  return gwPath(root, 'sessions', sessionIdSchema.parse(sessionId) + '.json');
}

export function readSessionLedger(root: string, sessionId: string): Ledger {
  const file = ledgerPath(root, sessionId);
  try {
    return ledgerSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

/** Both hook streams take the same short writer lock; readers see a complete old or new snapshot. */
export function updateSessionLedger(root: string, sessionId: string, update: (ledger: Ledger) => Ledger): void {
  const file = ledgerPath(root, sessionId);
  ensureGwDir(root, 'sessions');
  withFileLock(file + '.lock', () => {
    const ledger = readSessionLedger(root, sessionId);
    const updated = update(ledger);
    if (ledger === updated) return;
    const tmp = file + '.tmp-' + process.pid;
    try {
      writeFileSync(tmp, JSON.stringify(updated) + '\n', { mode: 0o600 });
      renameSync(tmp, file);
    } finally {
      rmSync(tmp, { force: true });
    }
  }, 50);
}
