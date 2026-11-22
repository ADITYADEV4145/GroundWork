import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { dispatch, normalise } from '../src/hooks/run.js';
import { readSessionLedger, updateSessionLedger } from '../src/hooks/session-ledger.js';
import type { HookEventName } from '../src/hooks/types.js';
import { refreshIndex } from '../src/index/refresh.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { initSqlBackend } from '../src/store/db.js';
import { gwPath } from '../src/util/paths.js';

it('only denies verified covered reads in the same session, with a one-time force retry', async () => {
  const root = tempDir('gw-read-verification-');
  try {
    const file = path.join(root, 'sample.ts');
    const payload = {
      cwd: root, session_id: 'session-a', tool_name: 'Read', tool_input: { file_path: file, offset: 1, limit: 2 },
      tool_response: { type: 'text', file: { filePath: file, startLine: 1, numLines: 2, content: 'first\nsecond' } },
    };
    const run = (event: HookEventName, override = {}) => dispatch(normalise('claude', event, { ...payload, ...override }), root);
    writeFileSync(file, 'first\r\nsecond\r\nthird\r\n');
    updateSessionLedger(root, 'session-a', (s) => ({ ...s, guards: { retained: true } }));
    await run('post_tool', { tool_response: { type: 'text', file: { ...payload.tool_response.file, content: 'stale data' } } });
    expect((await run('pre_tool')).action).toBe('allow');
    await run('post_tool', { tool_response: { type: 'text', file: { ...payload.tool_response.file, numLines: 1, content: 'first' } } });
    expect((await run('pre_tool')).action).toBe('allow');
    await run('post_tool');
    expect((await run('pre_tool', { session_id: 'session-b' })).action).toBe('allow');
    expect((await run('pre_tool', { agent_id: 'some-subagent' })).action).toBe('allow');
    expect((await run('pre_tool', { tool_input: { ...payload.tool_input, offset: 2, limit: 2 } })).action).toBe('allow');
    const covered = { tool_input: { ...payload.tool_input, offset: 2, limit: 1 } };
    expect(await run('pre_tool', covered)).toMatchObject({ action: 'deny', message: expect.stringContaining('Read step 2 (lines 1-2)') });
    expect((await run('pre_tool', covered)).action).toBe('allow');
    expect((await run('pre_tool', covered)).action).toBe('deny');
    expect(readSessionLedger(root, 'session-a')).toMatchObject({
      guards: { retained: true }, navigation: { forcedReads: 1, blockedReads: 2, estimatedTokensSaved: 4 },
    });
    const log = readFileSync(gwPath(root, 'logs', 'groundwork.log'), 'utf8');
    expect(log).toContain('read_guard_forced');
    expect(log).toContain('"method":"bytes/4"');
    writeFileSync(file, 'first\r\nSECOND\r\nthird\r\n');
    expect((await run('pre_tool', covered)).action).toBe('allow');
    // A malformed or unsafe session ID must not read or write a ledger outside the sessions directory.
    expect((await run('pre_tool', { session_id: '../unsafe' })).action).toBe('allow');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('compacts a large indexed whole-file read with query-ranked bodies and an exact force retry', async () => {
  const root = tempDir('gw-read-hint-');
  try {
    const file = path.join(root, 'sample.ts');
    const source = ['function earlier() {}', 'export function wanted() { return 42; }', ...Array(400).fill('// filler')].join('\n');
    writeFileSync(file, source);
    await initSqlBackend();
    await refreshIndex(root);
    const payload = { cwd: root, session_id: 'hint-test', tool_name: 'Read', tool_input: { file_path: file } };
    await dispatch(normalise('claude', 'post_tool', { ...payload, tool_name: 'mcp__plugin_groundwork_groundwork__find_code', tool_input: { query: 'wanted' } }), root);
    const compact = await dispatch(normalise('claude', 'pre_tool', payload), root);
    expect(compact).toMatchObject({ action: 'deny', message: expect.stringContaining('Repeat the exact Read to get the full file') });
    expect(compact.message).toContain('Outline (');
    expect(compact.message).toContain('function wanted() { return 42; }');
    expect(Buffer.byteLength(compact.message!)).toBeLessThanOrEqual(Buffer.byteLength(source) * 0.65);
    expect((await dispatch(normalise('claude', 'pre_tool', payload), root)).action).toBe('allow');
    expect((await dispatch(normalise('claude', 'pre_tool', payload), root)).action).toBe('deny');
    expect((await dispatch(normalise('claude', 'pre_tool', { ...payload, tool_input: { ...payload.tool_input, limit: 10 } }), root)).action).toBe('allow');
    writeFileSync(gwPath(root, 'config.json'), JSON.stringify({ navigation: { readGuard: { enabled: false } } }));
    expect((await dispatch(normalise('claude', 'pre_tool', payload), root)).action).toBe('allow');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('does not add denials for ranged, small, unindexed, empty, changed, subagent or malformed reads', async () => {
  const root = tempDir('gw-read-compact-safety-');
  try {
    const file = path.join(root, 'sample.ts');
    const source = 'export function target() { return 1; }\n' + '// useful source context\n'.repeat(150);
    const payload = { cwd: root, session_id: 'compact-safety', tool_name: 'Read', tool_input: { file_path: file } };
    const run = (override = {}) => dispatch(normalise('claude', 'pre_tool', { ...payload, ...override }), root);
    writeFileSync(file, source);
    expect((await run()).action).toBe('allow');
    await refreshIndex(root);
    expect((await run({ agent_id: 'subagent' })).action).toBe('allow');
    expect((await run({ session_id: '../bad' })).action).toBe('allow');
    expect((await run({ tool_input: { file_path: file, offset: 1 } })).action).toBe('allow');
    expect((await run({ tool_input: { file_path: file, limit: 2 } })).action).toBe('allow');
    expect((await run()).action).toBe('deny');
    expect((await run({ tool_input: { file_path: file, offset: 1, limit: 151 } })).action).toBe('allow');
    expect((await run()).action).toBe('deny');
    writeFileSync(file, source.replace('return 1', 'return 2'));
    expect((await run()).action).toBe('allow');
    writeFileSync(file, 'export function small() {}');
    await refreshIndex(root);
    expect((await run()).action).toBe('allow');
    writeFileSync(file, ''); await refreshIndex(root);
    expect((await run()).action).toBe('allow');
    writeFileSync(file, '// no indexed symbols\n'.repeat(160)); await refreshIndex(root);
    expect((await run()).action).toBe('allow');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('wires the Claude subprocess hook and clears its history on PreCompact', () => {
  const root = tempDir('gw-read-cli-');
  try {
    const file = path.join(root, 'sample.ts');
    writeFileSync(file, 'const x = 42;\n');
    const payload = {
      cwd: root, session_id: 'cli-a', tool_name: 'Read', tool_input: { file_path: file },
      tool_response: { type: 'text', file: { filePath: file, startLine: 1, numLines: 1, content: 'const x = 42;' } },
    };
    function run(event: HookEventName) {
      const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'),
        fileURLToPath(new URL('../src/cli/main.ts', import.meta.url)), 'hook', 'claude', event], { cwd: root, input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000 });
      expect(result.status).toBe(0);
      return result.stdout;
    }
    expect(run('post_tool')).toBe('');
    expect(JSON.parse(run('pre_tool'))).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } });
    expect(run('pre_compact')).toBe('');
    expect(run('pre_tool')).toBe('');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);
