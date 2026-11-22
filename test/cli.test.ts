import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXTURES_DIR, tempDir } from '../src/selftest/fixtures.js';

const MAIN = path.resolve(__dirname, '../src/cli/main.ts');
const TSX = import.meta.resolve('tsx');
let dir = '';
const gw = (...args: string[]) => execFileSync(process.execPath, ['--import', TSX, MAIN, '--root', dir, ...args], { encoding: 'utf8' });

describe('gw cli', () => {
  beforeAll(() => {
    dir = tempDir('gw-cli-');
    cpSync(path.join(FIXTURES_DIR, 'ts-app'), dir, { recursive: true });
    gw('init');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('stats --json', () => {
    const s = JSON.parse(gw('--json', 'stats'));
    expect(s.files).toBe(8);
    expect(s.symbols).toBeGreaterThan(20);
  });

  it('symbols ranks the exact name first', () => {
    const hits = JSON.parse(gw('--json', 'symbols', 'formatDate'));
    expect(hits[0].qualifiedName).toBe('formatDate');
    expect(hits[0].file).toBe('src/utils/date.ts');
    expect(gw('symbols', 'format', 'date')).toContain('src/utils/date.ts:');
  });

  it('show lists callers', () => {
    const d = JSON.parse(gw('--json', 'show', 'formatDate'));
    expect(d.callersTotal).toBe(2);
    expect(d.maxArity).toBe(2);
    expect(gw('show', 'ApiClient')).toContain('members: constructor, create, get, request, label');
  });

  it('show suggests near matches for unknown names', () => {
    const r = spawnSync(process.execPath, ['--import', TSX, MAIN, '--root', dir, 'show', 'formatDat'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('did you mean: formatDate');
  });

  it('doctor --json has no failures', () => {
    expect(JSON.parse(gw('--json', 'doctor')).ok).toBe(true);
  });

  it('hook fails open on garbage input', () => {
    const r = spawnSync(process.execPath, ['--import', TSX, MAIN, 'hook', 'claude', 'pre_tool'], { input: 'not json', encoding: 'utf8', cwd: dir });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('keeps global and scoped help available with lazy command registration', () => {
    expect(gw('--help')).toContain('selftest');
    expect(gw('mcp', '--help')).toContain('stdio');
    expect(gw('symbols', '--help')).toContain('--no-refresh');
    const result = spawnSync(process.execPath, ['--import', TSX, MAIN, `--root=${dir}`, '--json', 'stats'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).files).toBe(8);
  });
});
