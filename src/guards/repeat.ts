import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';

export function commandInfo(command: string): { command: string; normalized: string; forced: boolean } {
  const forced = /^\s*GW_FORCE=1\s+/.test(command) || /\s+#\s*gw:force\s*$/.test(command);
  command = command.replace(/^\s*GW_FORCE=1\s+/, '').replace(/\s+#\s*gw:force\s*$/, '');
  return { command, normalized: command.trim().replace(/\s+/g, ' '), forced };
}
export function workspaceFingerprint(root: string): string {
  const start = performance.now();
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, timeout: 80, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const hash = createHash('sha256');
    hash.update(git(['rev-parse', 'HEAD']));
    hash.update(git(['status', '--porcelain', '-z', '--untracked-files=all']));
    const names = git(['ls-files', '-z', '--modified', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean);
    if (names.length > 2000) return 'unknown';
    let bytes = 0;
    for (const name of [...new Set(names)].sort()) {
      if (performance.now() - start > 180) return 'unknown';
      if (name === '.groundwork' || name.startsWith('.groundwork/')) continue;
      hash.update(name);
      const p = path.join(root, name);
      try {
        const s = lstatSync(p);
        if (s.isSymbolicLink()) hash.update(readlinkSync(p));
        else if (!s.isFile()) return 'unknown';
        else if (s.size > 1024 * 1024) hash.update(`${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.ino}`);
        else if (bytes + s.size > 8 * 1024 * 1024) return 'unknown';
        else { hash.update(readFileSync(p)); bytes += s.size; }
      } catch { hash.update('deleted'); }
    }
    return hash.digest('hex');
  } catch { return 'unknown'; }
}
export function responseText(response: unknown): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    const parts = ['stdout', 'stderr', 'output', 'content'].map((k) => r[k]).filter((v) => typeof v === 'string');
    if (parts.length) return parts.join('\n');
  }
  return response == null ? '' : JSON.stringify(response);
}
export const lastSummary = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter((s) => s.trim()).slice(-2).map((s) => s.slice(0, 240)).join('\n');
