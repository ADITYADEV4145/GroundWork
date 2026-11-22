import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DYNAMIC_TEXT } from '../grounding/verify.js';
import type { ChangedFile } from '../grounding/ranges.js';
import type { GroundworkConfig } from '../config/schema.js';
import type { TypeCheckResult, TypeFinding } from './index.js';
import { tsDiagnostics, navigate } from './typescript.js';
import { pythonDiagnostics } from './pyright.js';

const signature = (f: TypeFinding) => `${f.code}:${f.message.replace(/\s+/g, ' ').trim()}`;
process.on('message', (request: { root: string; changed: ChangedFile[]; config: GroundworkConfig; base?: string; target?: string; operation?: 'def' | 'impl' | 'refs'; deadline: number }) => {
  try {
    if (request.target && request.operation) { process.send?.(navigate(request.root, request.target, request.operation)); return; }
    const result: TypeCheckResult = { available: { typescript: false, python: false }, findings: [], timedOut: false };
    for (const changed of request.changed) {
      const language = /\.[cm]?tsx?$/.test(changed.file) ? 'typescript' : changed.file.endsWith('.py') ? 'python' : null;
      if (!language) continue;
      if (!request.config.types.enabled || request.config.types[language] === 'off') { result.available[language] = 'disabled'; continue; }
      const check = (root: string, file: string, text?: string) => language === 'typescript' ? tsDiagnostics(root, file, text) : pythonDiagnostics(root, file, text, request.deadline);
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
            try { const prior = new Set(check(request.root, changed.file, baseText).map(signature)); for (const f of relevant) if (prior.has(signature(f))) { f.blocking = false; f.preExisting = true; } }
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
