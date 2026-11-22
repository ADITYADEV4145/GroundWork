import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { TypeFinding } from './index.js';

const rules = new Set(['reportAttributeAccessIssue', 'reportCallIssue', 'reportArgumentType', 'reportMissingImports', 'reportUndefinedVariable']);

export function pythonDiagnostics(root: string, file: string, text?: string, deadline = Date.now() + 4000): TypeFinding[] {
  if (deadline - Date.now() < 250) throw new Error('timeout');
  const local = path.join(root, 'node_modules', '.bin', 'pyright');
  const binary = existsSync(local) ? local : 'pyright';
  let directory: string | undefined;
  let target = path.resolve(root, file);
  // Preserve the source directory for relative import resolution without modifying the user's file.
  if (text !== undefined) {
    directory = mkdtempSync(path.join(path.dirname(target), 'gw_types_'));
    target = `${directory}.py`;
    writeFileSync(target, text);
  }
  try {
    let output: string;
    try { output = execFileSync(binary, ['--outputjson', target], { cwd: root, encoding: 'utf8', timeout: Math.max(1, deadline - Date.now() - 200), maxBuffer: 16 << 20, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { const err = e as { status?: number; stdout?: string }; if (err.status !== 1 || !err.stdout) throw e; output = String(err.stdout); }
    const parsed = JSON.parse(output) as { generalDiagnostics: { file: string; message: string; rule?: string; severity: string; range: { start: { line: number; character: number } } }[] };
    const source = text ?? readFileSync(path.resolve(root, file), 'utf8');
    return parsed.generalDiagnostics.filter((d) => path.resolve(d.file) === target).map((d) => {
      const code = d.rule ?? 'unknown';
      const localImport = /^\s*from\s+\./m.test(source.split('\n')[d.range.start.line] ?? '');
      return { file, line: d.range.start.line + 1, column: d.range.start.character + 1,
        name: /"([^"]+)"/.exec(d.message)?.[1] ?? '', message: d.message, code, language: 'python' as const,
        blocking: d.severity === 'error' && rules.has(code) && (code !== 'reportMissingImports' || localImport) };
    });
  } finally { if (directory) { rmSync(target, { force: true }); rmSync(directory, { recursive: true, force: true }); } }
}
