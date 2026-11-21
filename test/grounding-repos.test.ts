import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroundingReposMissing, prepareGroundingRepos } from '../src/selftest/grounding-repos.js';
import { setupGroundingRepos } from '../scripts/setup-grounding-repos.js';
import { PHASE4_CHECKS } from '../src/selftest/checks/phase4.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const project = path.resolve(__dirname, '..');
const repos = JSON.parse(readFileSync(path.join(project, 'bench/real-repos/repos.json'), 'utf8')).repositories as { id: string; url: string; end: string }[];
const git = vi.mocked(execFileSync);
let cache: string;
let present = false;
let dirty = false;
let wrongHead = false;
let offline = false;
const fetched = new Set<string>();

beforeEach(() => {
  cache = mkdtempSync(path.join(os.tmpdir(), 'gw-ground-cache-test-'));
  vi.stubEnv('GW_REAL_REPOS_CACHE', cache);
  present = true;
  dirty = wrongHead = offline = false;
  fetched.clear();
  for (const repo of repos) mkdirSync(path.join(cache, 'grounding', repo.id, repo.end, '.git'), { recursive: true });
  git.mockImplementation((_cmd, args, options) => {
    const a = args as string[];
    const cwd = (options as { cwd: string }).cwd;
    const repo = repos.find((r) => cwd.includes(`/${r.id}/`))!;
    if (a[0] === 'config') return repo.url;
    if (a[0] === 'status') return dirty ? '?? unexpected.py' : '';
    if (a[0] === 'init') mkdirSync(path.join(cwd, '.git'));
    if (a[0] === 'cat-file' && !present && !fetched.has(repo.id)) throw new Error('missing object');
    if (a[0] === 'fetch') {
      if (offline) throw new Error('network unavailable');
      fetched.add(repo.id);
    }
    if (a[0] === 'rev-parse') return wrongHead ? '0'.repeat(40) : repo.end;
    return '';
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  git.mockReset();
  rmSync(cache, { recursive: true, force: true });
});

describe('pinned grounding repositories', () => {
  it('fails a full gate with setup instructions when pins are missing, without fetching', async () => {
    offline = true;
    rmSync(path.join(cache, 'grounding'), { recursive: true });
    const check = PHASE4_CHECKS.find((c) => c.name.includes('clean repos'))!;
    expect(await check.run({ quick: false, sequences: 1 })).toMatchObject({ ok: false, detail: expect.stringContaining('npm run setup:grounding-repos') });
    expect(git.mock.calls.some(([, args]) => args?.[0] === 'fetch')).toBe(false);
    expect(git).not.toHaveBeenCalled();
  });
  it('fetches all three end commits shallowly only in the developer setup script', () => {
    present = false;
    rmSync(path.join(cache, 'grounding'), { recursive: true });
    expect(setupGroundingRepos(project)).toEqual(repos.map((r) => path.join(cache, 'grounding', r.id, r.end)));
    for (const r of repos) expect(git).toHaveBeenCalledWith('git', ['fetch', '--depth=1', 'origin', r.end], expect.anything());
  });
  it('reuses cached pins without a network request', () => {
    present = true;
    expect(prepareGroundingRepos(project)).toHaveLength(3);
    expect(git.mock.calls.every(([, a]) => ['config', 'status', 'cat-file', 'rev-parse'].includes(a![0] as string))).toBe(true);
  });
  it('distinguishes offline fetches from unsafe checkouts', () => {
    offline = true;
    present = false;
    expect(() => prepareGroundingRepos(project)).toThrow(GroundingReposMissing);
    expect(git.mock.calls.some(([, a]) => a?.[0] === 'fetch')).toBe(false);
    expect(() => setupGroundingRepos(project)).toThrow('network unavailable');
    offline = false;
    present = true;
    dirty = true;
    expect(() => prepareGroundingRepos(project)).toThrow('checkout is not clean');
    dirty = false;
    wrongHead = true;
    expect(() => prepareGroundingRepos(project)).toThrow('expected clean checkout');
  });
  it('rejects an in-project cache before running git', () => {
    vi.stubEnv('GW_REAL_REPOS_CACHE', path.join(project, 'cache'));
    expect(() => prepareGroundingRepos(project)).toThrow('must be outside');
    expect(git).not.toHaveBeenCalled();
  });
  it('rejects an empty manifest instead of passing with no real repositories', () => {
    const emptyProject = path.join(cache, 'project');
    mkdirSync(path.join(emptyProject, 'bench/real-repos'), { recursive: true });
    writeFileSync(path.join(emptyProject, 'bench/real-repos/repos.json'), JSON.stringify({ repositories: [] }));
    expect(() => prepareGroundingRepos(emptyProject)).toThrow();
    expect(git).not.toHaveBeenCalled();
  });
  it('refuses an unexpected origin without fetching or checking out', () => {
    git.mockReturnValue('https://github.com/unexpected/repository');
    expect(() => prepareGroundingRepos(project)).toThrow('unexpected origin');
    expect(git.mock.calls.some(([, a]) => a?.[0] === 'fetch' || a?.[0] === 'checkout')).toBe(false);
  });
  it('skips quick runs but never skips missing pins or unsafe checkouts in a full run', async () => {
    const check = PHASE4_CHECKS.find((c) => c.name.includes('clean repos'))!;
    expect(await check.run({ quick: true, sequences: 1 })).toMatchObject({ skipped: true, detail: expect.stringContaining('--quick') });
    expect(git).not.toHaveBeenCalled();
    offline = true;
    present = false;
    expect(await check.run({ quick: false, sequences: 1 })).toMatchObject({ ok: false, detail: expect.stringContaining('npm run setup:grounding-repos') });
    present = true;
    dirty = true;
    await expect(check.run({ quick: false, sequences: 1 })).rejects.toThrow('checkout is not clean');
  });
  it('reuses setup caches offline but refuses dirty or unexpected origins before fetching', () => {
    offline = true;
    expect(setupGroundingRepos(project)).toHaveLength(3);
    expect(git.mock.calls.some(([, a]) => a?.[0] === 'fetch')).toBe(false);
    dirty = true;
    expect(() => setupGroundingRepos(project)).toThrow('checkout is not clean');
    dirty = false;
    git.mockReturnValue('https://github.com/unexpected/repository');
    expect(() => setupGroundingRepos(project)).toThrow('unexpected origin');
  });
});
