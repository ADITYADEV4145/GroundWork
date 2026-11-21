import { closeSync, openSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs';
import { ensureGwDir, gwPath } from '../util/paths.js';

const STALE_MS = 120_000;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Single-writer lock for .groundwork/index.db. Readers never take it (SQLite WAL handles them). */
export function withWriteLock<T>(root: string, fn: () => T, timeoutMs = 30_000): T {
  ensureGwDir(root);
  const file = gwPath(root, 'index.lock');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const fd = openSync(file, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        const pid = Number(readFileSync(file, 'utf8'));
        const age = Date.now() - statSync(file).mtimeMs;
        if (!pidAlive(pid) || age > STALE_MS) {
          rmSync(file, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) throw new Error('another groundwork process is writing the index (.groundwork/index.lock)');
      sleep(25);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(file, { force: true });
  }
}
