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

it('hints on a large read and uses recent find_code queries to pick a relevant symbol', async () => {
  const root = tempDir('gw-read-hint-');
  try {
    const file = path.join(root, 'sample.ts');
    writeFileSync(file, ['function earlier() {}', 'export function wanted() {}', ...Array(400).fill('// filler')].join('\n'));
    await initSqlBackend();
    await refreshIndex(root);
    const payload = { cwd: root, session_id: 'hint-test', tool_name: 'Read', tool_input: { file_path: file } };
    await dispatch(normalise('claude', 'post_tool', { ...payload, tool_name: 'mcp__plugin_groundwork_groundwork__find_code', tool_input: { query: 'wanted' } }), root);
    expect(await dispatch(normalise('claude', 'pre_tool', payload), root)).toMatchObject({
      action: 'context', message: expect.stringMatching(/Large read allowed \(402 lines\).*outline.*Try read_symbol/s),
    });
    expect((await dispatch(normalise('claude', 'pre_tool', { ...payload, tool_input: { ...payload.tool_input, limit: 10 } }), root)).action).toBe('allow');
    writeFileSync(gwPath(root, 'config.json'), JSON.stringify({ navigation: { readGuard: { enabled: false } } }));
    expect((await dispatch(normalise('claude', 'pre_tool', payload), root)).action).toBe('allow');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
