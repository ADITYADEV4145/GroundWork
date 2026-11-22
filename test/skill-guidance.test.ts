import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAVIGATION_TOOLS } from '../src/mcp/tools/navigation.js';
import { verifyCallsTool } from '../src/mcp/tools/verify_calls.js';

const read = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

describe('shipped task-aware guidance', () => {
  it('reuses carried evidence across steps/sessions without treating other agents as context', () => {
    for (const file of ['SKILL.md', 'references/navigation.md', 'references/reuse.md', 'references/grounding.md']) {
      const text = read(file);
      expect(text).toContain('across continuing steps and sessions');
      expect(text).toContain('current context');
      expect(text).not.toMatch(/within the task|confirmed in this task/);
    }
    expect(read('SKILL.md')).toContain("Do not treat another agent's reads as your own.");
    expect(read('references/grounding.md')).toContain('Automatic grounding and duplicate-gate checks remain active.');
  });
  it('uses batched bodies and traces, and verification rather than confirmation-only rereads', () => {
    for (const file of ['SKILL.md', 'references/navigation.md']) {
      expect(read(file)).toContain('include_body');
      expect(read(file)).toContain('"symbols":');
      expect(read(file)).toContain('chain `callees` and `read_symbol`');
    }
    for (const file of ['SKILL.md', 'references/grounding.md']) {
      expect(read(file)).toContain('Never re-read a file only to satisfy the verify rule.');
      expect(read(file)).toContain('one batched call instead of rereads');
    }
    expect(NAVIGATION_TOOLS.find((tool) => tool.name === 'find_code')!.description).toContain('include_body');
    expect(NAVIGATION_TOOLS.find((tool) => tool.name === 'read_symbol')!.description).toContain('symbols');
    expect(verifyCallsTool.description).toContain('Never re-read');
    expect(verifyCallsTool.description).toContain('one batched call instead of rereads');
    expect(read('SKILL.md')).toContain('start with `explore(');
    expect(NAVIGATION_TOOLS.find((tool) => tool.name === 'explore')!.description).toContain('Answer directly');
  });
});
