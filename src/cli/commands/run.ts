import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { loadConfig } from '../../config/load.js';
import { stats, updateLedger } from '../../guards/ledger.js';
import { commandInfo, lastSummary, workspaceFingerprint } from '../../guards/repeat.js';
import { compactOutput, noisyTool, shellQuote } from '../../guards/trimmer.js';
import { globalOpts, repoRoot } from '../context.js';

export interface RunResult { output: string; logPath: string; exitCode: number; signal: NodeJS.Signals | null }
export async function runCommand(root: string, command: string, sessionId?: string, cwd = process.cwd()): Promise<RunResult> {
  const logs = path.join(root, '.groundwork', 'logs');
  mkdirSync(logs, { recursive: true });
  const logPath = path.join(logs, `run-${Date.now()}-${randomUUID().slice(0, 8)}.log`);
  const fd = openSync(logPath, 'w');
  const info = commandInfo(command);
  let exitCode = 1;
  let signal: NodeJS.Signals | null = null;
  try {
    const result = await new Promise<{ code: number; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const child = spawn(info.command, { shell: existsSync('/bin/bash') ? '/bin/bash' : true, cwd, stdio: ['inherit', fd, fd] });
      child.on('error', reject);
      child.on('close', (code, sig) => resolve({ code: code ?? (sig ? 128 + ({ SIGINT: 2, SIGTERM: 15, SIGKILL: 9 }[sig as 'SIGINT'] ?? 1) : 1), signal: sig }));
    });
    exitCode = result.code; signal = result.signal;
  } finally { closeSync(fd); }
  const full = readFileSync(logPath, 'utf8');
  const cfg = loadConfig(root).guards;
  const output = cfg.outputTrimmer.enabled ? compactOutput(full, noisyTool(info.command) ?? 'generic') : full;
  const printed = `${output}${output.endsWith('\n') ? '' : '\n'}Full log: ${logPath}\n`;
  updateLedger(root, sessionId, (l) => {
    if (cfg.outputTrimmer.enabled) {
      const s = stats(l, 'outputTrimmer');
      const saved = Math.max(0, (Buffer.byteLength(full) - Buffer.byteLength(printed)) / 4);
      if (saved) s.interventions++;
      s.tokensSaved += saved;
    }
    if (cfg.repeatCommand.enabled) {
      const fingerprint = workspaceFingerprint(root);
      l.commands[info.normalized] = { step: l.step, fingerprint: fingerprint === 'unknown' ? 'unknown' : `${cwd}:${fingerprint}`, summary: lastSummary(full), logPath, outputBytes: Buffer.byteLength(full) };
    }
  });
  return { output: printed, logPath, exitCode, signal };
}
export function register(program: Command): void {
  program.command('run').description('run a noisy command, retaining its full local log').argument('<command...>')
    .action(async (args: string[], _options, cmd: Command) => {
      const opts = globalOpts(cmd);
      // Hook rewrites pass one complete shell command; direct argv remains safely quoted.
      const command = args.length === 1 ? args[0]! : args.map(shellQuote).join(' ');
      const result = await runCommand(process.env.GW_ROOT ?? repoRoot(opts), command, process.env.GW_SESSION_ID);
      process.stdout.write(opts.json ? JSON.stringify(result) + '\n' : result.output);
      process.exitCode = result.exitCode;
    });
}
