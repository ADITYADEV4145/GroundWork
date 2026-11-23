import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DYNAMIC_TEXT } from '../grounding/verify.js';
import type { ChangedFile } from '../grounding/ranges.js';
import type { GroundworkConfig } from '../config/schema.js';
import type { TypeCheckResult, TypeFinding } from './index.js';
import { tsDiagnostics, navigate } from './typescript.js';
import { pythonDiagnostics } from './pyright.js';
import { compiledLanguage, compilerDiagnostics, resetCompilerMemo, type BaseTexts } from './compilers.js';

// The classpath note is about the file as a whole, not the error, so it is not part of an error's identity.
const signature = (f: TypeFinding) => `${f.code}:${f.message.replace(/ \(classpath incomplete\)$/, '').replace(/\s+/g, ' ').trim()}`;
process.on('message', (request: { root: string; changed: ChangedFile[]; config: GroundworkConfig; base?: string; target?: string; operation?: 'def' | 'impl' | 'refs'; deadline: number }) => {
  try {
    if (request.target && request.operation) { process.send?.(navigate(request.root, request.target, request.operation)); return; }
    const result: TypeCheckResult = { available: { typescript: false, python: false, go: false, rust: false, java: false, csharp: false }, findings: [], timedOut: false };
    resetCompilerMemo();
    const show = (file: string) => execFileSync('git', ['show', `${request.base ?? 'HEAD'}:${file}`], { cwd: request.root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
    // A file deleted since the base has no changed lines, but the baseline must still compile with it.
    let removed: string[] | undefined;
    const deleted = () => {
      if (removed) return removed;
      try { removed = execFileSync('git', ['diff', '--name-only', '--diff-filter=D', '--no-renames', request.base ?? 'HEAD', '--'], { cwd: request.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); }
      catch { removed = []; }
      return removed;
    };
    for (const changed of request.changed) {
      const compiled = compiledLanguage(changed.file);
      const language = /\.[cm]?tsx?$/.test(changed.file) ? 'typescript' : changed.file.endsWith('.py') ? 'python' : compiled;
      if (!language) continue;
      if (!request.config.types.enabled || request.config.types[language] === 'off') { result.available[language] = 'disabled'; continue; }
      // The baseline sees the base text of every changed TypeScript file, so changed dependencies don't leak into it.
      const baseOthers = () => new Map(request.changed.filter((c) => c.file !== changed.file && /\.[cm]?tsx?$/.test(c.file)).flatMap((c) => {
        try { return [[c.file, execFileSync('git', ['show', `${request.base ?? 'HEAD'}:${c.file}`], { cwd: request.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })] as const]; }
        catch { return []; }
      }));
      // Compiled languages build a whole package, so the baseline holds every changed file of the language at its base text.
      const baseTexts = (): BaseTexts => new Map([...request.changed.map((c) => c.file), ...deleted()].filter((f) => compiledLanguage(f) === compiled).map((f) => {
        try { return [f, show(f)] as const; } catch { return [f, null] as const; }
      }));
      const check = (root: string, file: string, text?: string) => compiled ? compilerDiagnostics(compiled, root, file, request.deadline, text === undefined ? undefined : baseTexts())
        : language === 'typescript' ? tsDiagnostics(root, file, text, text === undefined ? undefined : baseOthers()) : pythonDiagnostics(root, file, text, request.deadline);
      try {
        const findings = check(request.root, changed.file);
        result.available[language] = true;
        const relevant = findings.filter((f) => changed.ranges === null || changed.ranges.some(([a, b]) => f.line >= a && f.line <= b));
        if (DYNAMIC_TEXT.test(readFileSync(path.resolve(request.root, changed.file), 'utf8'))) {
          for (const finding of relevant) finding.blocking = false;
        }
        if (relevant.some((f) => f.blocking)) {
          let baseText: string | undefined;
          try { baseText = execFileSync('git', ['show', `${request.base ?? 'HEAD'}:${changed.file}`], { cwd: request.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
          catch {
            // Only a proven new file can block without a baseline.
            try {
              execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${request.base ?? 'HEAD'}^{commit}`], { cwd: request.root, stdio: 'ignore' });
              const listed = execFileSync('git', ['ls-tree', '--name-only', request.base ?? 'HEAD', '--', changed.file], { cwd: request.root, encoding: 'utf8' });
              if (listed.trim()) for (const f of relevant) f.blocking = false;
            } catch { for (const f of relevant) f.blocking = false; }
          }
          if (baseText !== undefined) {
            try {
              // An error counts as pre-existing only while its occurrences do not outnumber the baseline's.
              const prior = new Map<string, number>();
              for (const f of check(request.root, changed.file, baseText)) prior.set(signature(f), (prior.get(signature(f)) ?? 0) + 1);
              const current = new Map<string, number>();
              for (const f of findings) current.set(signature(f), (current.get(signature(f)) ?? 0) + 1);
              for (const f of relevant) if ((current.get(signature(f)) ?? 0) <= (prior.get(signature(f)) ?? 0)) { f.blocking = false; f.preExisting = true; }
            }
            catch (e) {
              if ((e as NodeJS.ErrnoException).code === 'ETIMEDOUT' || (e as Error).message === 'timeout') throw e;
              for (const f of relevant) f.blocking = false;
            }
          }
        }
        result.findings.push(...relevant);
      } catch (e) {
        result.available[language] = (e as Error).message.split('\n')[0]!.slice(0, 200);
        if ((e as NodeJS.ErrnoException).code === 'ETIMEDOUT' || (e as Error).message === 'timeout') {
          result.timedOut = true; result.findings = []; break;
        }
      }
    }
    process.send?.(result);
  } catch (e) { process.send?.({ unavailable: (e as Error).message }); }
});
