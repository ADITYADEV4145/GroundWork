import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { VERSION } from '../util/version.js';

// `gw update`: the one runtime command that uses the network, and only when the user runs it.
// The tarball is installed only after its bytes match the registry's sha512 integrity.

export const PACKAGE = 'groundwork-agent';
export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

export interface Release { version: string; tarball: string; integrity: string }

export interface UpdateResult {
  current: string;
  latest: string;
  updateAvailable: boolean;
  /** 'installed' only after the checksum matched and the installer exited 0. */
  status: 'up-to-date' | 'available' | 'installed';
  verified: boolean;
  integrity?: string;
}

export interface UpdateOptions {
  registry?: string;
  check?: boolean;
  timeoutMs?: number;
  /** Installs a verified tarball; defaults to `npm install -g <file>`. */
  install?: (tarball: string) => void;
  current?: string;
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = '', pre] = v.replace(/^v/, '').split('+')[0]!.split('-', 2);
    return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if ((x.nums[i] ?? 0) !== (y.nums[i] ?? 0)) return (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  // Semver: compare dot-separated identifiers; numeric ones as numbers and below alphanumeric ones.
  const p = x.pre.split('.'), q = y.pre.split('.');
  for (let i = 0; i < Math.max(p.length, q.length); i++) {
    const l = p[i], r = q[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    const ln = /^\d+$/.test(l), rn = /^\d+$/.test(r);
    if (ln && rn) return Number(l) - Number(r);
    if (ln !== rn) return ln ? -1 : 1;
    return l < r ? -1 : 1;
  }
  return 0;
}

/** Throws unless `data` hashes to the sha512 entry of an SRI string. Weaker algorithms are not accepted. */
export function verifyIntegrity(data: Uint8Array, integrity: string): void {
  const expected = integrity.split(/\s+/).find((e) => e.startsWith('sha512-'));
  if (!expected) throw new Error('the registry gave no sha512 checksum for this release; not installing');
  const actual = `sha512-${createHash('sha512').update(data).digest('base64')}`;
  if (actual !== expected) throw new Error(`checksum mismatch: expected ${expected}, downloaded ${actual}; not installing`);
}

async function get(url: string, timeoutMs: number): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res;
}

export async function latestRelease(registry: string, timeoutMs: number): Promise<Release> {
  const body = (await (await get(`${registry.replace(/\/+$/, '')}/${PACKAGE}/latest`, timeoutMs)).json()) as { version?: unknown; dist?: { tarball?: unknown; integrity?: unknown } };
  if (typeof body.version !== 'string' || typeof body.dist?.tarball !== 'string') throw new Error('the registry response has no version or tarball');
  return { version: body.version, tarball: body.dist.tarball, integrity: typeof body.dist.integrity === 'string' ? body.dist.integrity : '' };
}

/** Why this copy cannot replace itself, or null when it is a normal global install. */
export function selfUpdateBlocker(packageRoot = fileURLToPath(new URL('../../', import.meta.url)), npmGlobalRoot: () => string | null = defaultGlobalRoot): string | null {
  if (existsSync(path.join(packageRoot, '.git'))) return 'this is a source checkout; update it with `git pull && npm ci && npm run build`';
  if (/[\\/]Cellar[\\/]/.test(packageRoot)) return 'this copy was installed by Homebrew; update it with `brew upgrade groundwork`';
  if (/[\\/]_npx[\\/]/.test(packageRoot)) return 'this copy was started by npx, which fetches the latest version itself';
  // `npm install -g` writes to npm's global directory; a copy anywhere else would keep running the old version.
  const real = (p: string) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
  const globalRoot = npmGlobalRoot();
  if (globalRoot === null) return 'npm is not available to install the update';
  const rel = path.relative(real(globalRoot), real(packageRoot));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return `this copy is not in npm's global directory (${globalRoot}); update it with the tool that installed it`;
  return null;
}

function defaultGlobalRoot(): string | null {
  const r = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

function npmInstall(tarball: string): void {
  const r = spawnSync('npm', ['install', '-g', tarball], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.error) throw new Error(`could not run npm: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`npm install -g failed: ${r.stderr.trim().split('\n').slice(-3).join(' ')}`);
}

export async function runUpdate(options: UpdateOptions = {}): Promise<UpdateResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const current = options.current ?? VERSION;
  const release = await latestRelease(options.registry ?? DEFAULT_REGISTRY, timeoutMs);
  const updateAvailable = compareVersions(release.version, current) > 0;
  const base = { current, latest: release.version, updateAvailable, verified: false };
  if (!updateAvailable) return { ...base, status: 'up-to-date' };
  if (options.check) return { ...base, status: 'available' };
  const data = new Uint8Array(await (await get(release.tarball, timeoutMs)).arrayBuffer());
  verifyIntegrity(data, release.integrity);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gw-update-'));
  try {
    const file = path.join(dir, `${PACKAGE}-${release.version}.tgz`);
    writeFileSync(file, data);
    (options.install ?? npmInstall)(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { ...base, status: 'installed', verified: true, integrity: release.integrity };
}
