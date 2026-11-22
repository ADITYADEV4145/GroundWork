import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as memory from '../src/hooks/session-memory.js';
import { defaultConfig } from '../src/config/load.js';
import { refreshOnEdit } from '../src/hooks/handlers/refresh_on_edit.js';
import { sessionMemoryPrompt } from '../src/hooks/handlers/session_memory.js';
import { memorySymbols, nextTurn, recordWritten, sessionMemory } from '../src/hooks/session-memory.js';
import { normalise, render } from '../src/hooks/run.js';
import { refreshIndex } from '../src/index/refresh.js';
import { checkRepository, formatFinding } from '../src/reuse/check.js';
import { withCheckScenario, writeScenarioFile } from '../src/reuse/scenarios.js';
import { initSqlBackend } from '../src/store/db.js';
import { estimateTokens } from '../src/util/tokens.js';
import { targetsFor } from '../src/setup/targets.js';

const source = `export function sessionHelper(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return date;
}\n`;

describe('session reuse memory', () => {
  it('caps the ledger, preserves other keys, and registers/render prompts for each agent', async () => {
    await withCheckScenario('clean', async (root) => {
      nextTurn(root, 'cap');
      const symbols = Array.from({ length: 210 }, (_, i) => ({ id: String(i), qualifiedName: `helper${i}`, kind: 'function',
        file: 'a.ts', line: i + 1, signature: '(value: string)', bodyHash: String(i) }));
      recordWritten(root, 'cap', [], symbols);
      expect(sessionMemory(root, 'cap').written).toHaveLength(200);
      expect(sessionMemory(root, 'cap').written[0]!.id).toBe('10');
      for (const agent of ['claude', 'codex', 'cursor'] as const) {
        const target = targetsFor({ root, gw: 'gw' }).find((t) => t.agent === agent)!;
        const hookEdit = target.edits.find((e) => e.kind === 'json' && (e.file.endsWith('hooks.json') || e.file.endsWith('settings.json')))!;
        const doc = {};
        if (hookEdit.kind === 'json') hookEdit.add(doc, new Set());
        if (agent === 'cursor') {
          expect(JSON.stringify(doc)).not.toContain('gw hook cursor prompt');
          expect(render(normalise(agent, 'prompt', {}), { action: 'context', message: 'Reuse earlier code' })).toBe('');
        } else {
          expect(JSON.stringify(doc)).toContain(`gw hook ${agent} prompt`);
          expect(render(normalise(agent, 'prompt', {}), { action: 'context', message: 'Reuse earlier code' })).toContain('Reuse earlier code');
        }
      }
    });
  });
  it('scopes edit reads and removal to the edited file, with full-scan fallback', async () => {
    await withCheckScenario('clean', async (root) => {
      await initSqlBackend();
      await refreshIndex(root);
      nextTurn(root, 'scoped');
      const ctx = { root, config: defaultConfig() };
      const edit = (file?: string) => refreshOnEdit.run(normalise('claude', 'post_tool', {
        session_id: 'scoped', cwd: root, tool_name: 'Write', tool_input: file ? { file_path: file } : {},
      }), ctx);
      const reads = vi.spyOn(memory, 'memorySymbols');
      try {
        writeScenarioFile(root, 'a.ts', source);
        await edit('a.ts');
        const first = sessionMemory(root, 'scoped').written;
        expect(reads.mock.calls).toEqual([[root, 'a.ts'], [root, 'a.ts']]);
        reads.mockClear();
        writeScenarioFile(root, 'b.ts', source.replaceAll('sessionHelper', 'otherHelper'));
        await edit('b.ts');
        expect(reads.mock.calls).toEqual([[root, 'b.ts'], [root, 'b.ts']]);
        expect(memorySymbols(root, 'b.ts').map((s) => s.file)).toEqual(['b.ts']);
        expect(sessionMemory(root, 'scoped').written).toEqual([...first, expect.objectContaining({ file: 'b.ts' })]);
        writeScenarioFile(root, 'a.ts', '');
        await edit('a.ts');
        expect(sessionMemory(root, 'scoped').written.map((s) => s.file)).toEqual(['b.ts']);
        writeScenarioFile(root, 'b.ts', '');
        reads.mockClear();
        await edit();
        expect(reads.mock.calls).toEqual([[root, undefined], [root, undefined]]);
        expect(sessionMemory(root, 'scoped').written).toEqual([]);
      } finally { reads.mockRestore(); }
    });
  });
  it('counts turns, records new and changed symbols, skips unchanged/tests/generated/noise, drops removed symbols', async () => {
    await withCheckScenario('clean', async (root) => {
      await initSqlBackend();
      await refreshIndex(root);
      const config = defaultConfig();
      const ctx = { root, config };
      const prompt = normalise('claude', 'prompt', { session_id: 'memory', cwd: root });
      const edit = (file: string) => refreshOnEdit.run(normalise('claude', 'post_tool', {
        session_id: 'memory', cwd: root, tool_name: 'Write', tool_input: { file_path: file },
      }), ctx);
      expect(await sessionMemoryPrompt.run(prompt, ctx)).toBeNull();
      expect(sessionMemory(root, 'memory').turn).toBe(1);
      writeScenarioFile(root, 'z.ts', source);
      await edit('z.ts');
      const first = sessionMemory(root, 'memory').written;
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({ qualifiedName: 'sessionHelper', file: 'z.ts', turn: 1 });
      await edit('z.ts');
      expect(sessionMemory(root, 'memory').written).toEqual(first);
      const context = await sessionMemoryPrompt.run(prompt, ctx);
      expect(context?.action).toBe('context');
      expect(context?.message).toContain('sessionHelper(value: string) z.ts:1');
      expect(estimateTokens(context!.message!)).toBeLessThanOrEqual(200);
      writeScenarioFile(root, 'z.ts', source.replace('Invalid date', 'Bad date'));
      await edit('z.ts');
      const changed = sessionMemory(root, 'memory').written;
      expect(changed[0]!.bodyHash).not.toBe(first[0]!.bodyHash);
      expect(changed[0]!.turn).toBe(2);
      for (const [file, text] of [['code.test.ts', source], ['generated.ts', '// @generated DO NOT EDIT\n' + source], ['tiny.ts', 'export function tiny(x: number) { return x; }']]) {
        writeScenarioFile(root, file!, text!);
        await edit(file!);
      }
      expect(sessionMemory(root, 'memory').written).toEqual(changed);
      writeScenarioFile(root, 'z.ts', '');
      await edit('z.ts');
      expect(sessionMemory(root, 'memory').written).toEqual([]);
      expect(await sessionMemoryPrompt.run(prompt, ctx)).toBeNull();
      writeFileSync(path.join(root, '.groundwork/sessions/memory.json'), '{broken');
      expect(await sessionMemoryPrompt.run(prompt, ctx)).toBeNull();
      writeScenarioFile(root, 'z.ts', source);
      await expect(edit('z.ts')).resolves.toBeNull();
      expect(memorySymbols(root).some((s) => s.file === 'z.ts')).toBe(true);
    });
  });

  it('disables turn counting and recording with configuration off', async () => {
    await withCheckScenario('clean', async (root) => {
      await initSqlBackend();
      const config = defaultConfig();
      config.reuse.sessionMemory = false;
      const ctx = { root, config };
      expect(await sessionMemoryPrompt.run(normalise('claude', 'prompt', { session_id: 'off', cwd: root }), ctx)).toBeNull();
      writeScenarioFile(root, 'z.ts', source);
      await refreshOnEdit.run(normalise('claude', 'post_tool', { session_id: 'off', cwd: root, tool_name: 'Write', tool_input: { path: 'z.ts' } }), ctx);
      expect(sessionMemory(root, 'off')).toEqual({ turn: 0, written: [] });
    });
  });

  it('orders non-base duplicates by earlier turn rather than file order, never the reverse', async () => {
    await withCheckScenario('clean', async (root) => {
      await initSqlBackend();
      writeScenarioFile(root, 'z.ts', source.replaceAll('sessionHelper', 'earlierHelper'));
      writeScenarioFile(root, 'a.ts', source.replaceAll('sessionHelper', 'laterHelper'));
      await refreshIndex(root);
      const written = memorySymbols(root).filter((s) => ['z.ts', 'a.ts'].includes(s.file))
        .map((s) => ({ ...s, turn: s.file === 'z.ts' ? 1 : 2 }));
      writeScenarioFile(root, 'utils.ts', '');
      const isolated = await checkRepository(root, { sessionWritten: written });
      const directional = isolated.findings.find((f) => f.kind === 'duplicate' && f.added.file === 'a.ts');
      expect(directional).toMatchObject({ existing: { file: 'z.ts' }, existingTurn: 1 });
      expect(formatFinding(directional!)).toContain('written by you in turn 1');
      expect(isolated.findings.some((f) => f.kind === 'duplicate' && f.added.file === 'z.ts' && f.existing?.file === 'a.ts')).toBe(false);
      const config = defaultConfig();
      config.reuse.sessionMemory = false;
      const disabled = await checkRepository(root, { config, sessionWritten: written });
      const baseline = await checkRepository(root, { config });
      expect(disabled.findings).toEqual(baseline.findings);
      expect(disabled.findings.find((f) => f.added.file === 'z.ts' && f.kind === 'duplicate')?.existing?.file).toBe('a.ts');
    });
  });
});
