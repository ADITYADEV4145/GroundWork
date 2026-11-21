import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { gwPath } from './paths.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Append-only JSON-lines log in .groundwork/logs/. Never throws: logging must not break a hook. */
export function log(root: string, level: Level, event: string, data: Record<string, unknown> = {}): void {
  try {
    const dir = gwPath(root, 'logs');
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...data });
    appendFileSync(path.join(dir, 'groundwork.log'), line + '\n');
  } catch {
    // ignore
  }
}
