import { closeSync, linkSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { ensureGwDir, gwPath } from '../util/paths.js';

/** A lock file with no pid yet is only abandoned if it stays empty this long. */
const EMPTY_LOCK_STALE_MS = 5_000;

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

function readPid(file: string): number {
  try {
    const n = Number.parseInt(readFileSync(file, 'utf8'), 10);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  } catch {
    return NaN;
  }
}

function isStale(file: string, pid: number): boolean {
  if (!Number.isNaN(pid)) return !pidAlive(pid);
  try {
    return Date.now() - statSync(file).mtimeMs > EMPTY_LOCK_STALE_MS;
  } catch {
    return false;
  }
}

/**
 * Remove a stale lock without ever deleting a live one: move it aside atomically, and if what we moved
 * turns out to be a fresh lock another process just took, put it back.
 */
function reclaim(file: string, stalePid: number): void {
  const aside = `${file}.stale-${process.pid}-${Date.now()}`;
  try {
    renameSync(file, aside);
  } catch {
    return; // someone else reclaimed it first
  }
  const pid = readPid(aside);
  if (pid !== stalePid && !Number.isNaN(pid) && pidAlive(pid)) {
    try {
      linkSync(aside, file);
    } catch {
      // another writer already holds the slot; the one we moved will fail to release a lock it no longer owns
    }
  }
  rmSync(aside, { force: true });
}

/** Single-writer lock for .groundwork/index.db. Readers never take it (SQLite WAL handles them). */
export function withWriteLock<T>(root: string, fn: () => T, timeoutMs = 30_000): T {
  ensureGwDir(root);
  return withFileLock(gwPath(root, 'index.lock'), fn, timeoutMs, 'another groundwork process is writing the index (.groundwork/index.lock)');
}

export function withFileLock<T>(file: string, fn: () => T, timeoutMs: number, busyMessage = `Another Groundwork process holds the lock: ${file}`): T {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const fd = openSync(file, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const pid = readPid(file);
      if (isStale(file, pid)) {
        reclaim(file, pid);
        continue;
      }
      if (Date.now() > deadline) throw new Error(busyMessage);
      sleep(25);
    }
  }
  try {
    return fn();
  } finally {
    if (readPid(file) === process.pid) rmSync(file, { force: true });
  }
}
