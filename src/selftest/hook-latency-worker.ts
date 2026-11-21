import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface HookLatencyEdit {
  file: string;
  content: string;
  payload: Record<string, unknown>;
}

export interface HookLatencySample {
  elapsed: number;
  status: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export function sampleBuiltHooks(main: string, root: string, edits: HookLatencyEdit[]): HookLatencySample[] {
  return edits.map((edit) => {
    writeFileSync(edit.file, edit.content);
    const start = performance.now();
    const child = spawnSync(process.execPath, [main, 'hook', 'claude', 'post_tool'], {
      cwd: root, encoding: 'utf8', timeout: 5000, input: JSON.stringify(edit.payload), env: { ...process.env, GW_HOOK_TIMINGS: '1' },
    });
    return { elapsed: performance.now() - start, status: child.status, stdout: child.stdout ?? '', stderr: child.stderr ?? '', error: child.error?.message };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { main, root, edits } = JSON.parse(readFileSync(0, 'utf8')) as { main: string; root: string; edits: HookLatencyEdit[] };
  process.stdout.write(JSON.stringify(sampleBuiltHooks(main, root, edits)));
}
