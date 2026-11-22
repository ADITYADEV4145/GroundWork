import path from 'node:path';
import { readFileSync } from 'node:fs';
import * as z from 'zod';
import { readSessionLedger, updateSessionLedger } from '../hooks/session-ledger.js';
import type { HookEvent } from '../hooks/types.js';
import { repoRelative } from '../util/repo-file.js';

const stateSchema = z.object({
  files: z.array(z.string()).default([]),
  commands: z.array(z.object({ command: z.string(), cwd: z.string() })).default([]),
});

function shellWords(command: string): string[] | null {
  const words: string[] = [];
  let word = '', quote = '', started = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (quote === "'") { if (c === "'") quote = ''; else word += c; continue; }
    if (c === '\\') { const next = command[++i]; if (!next || /[\r\n]/.test(next)) return null; word += next; started = true; continue; }
    if (quote === '"') { if (c === '"') quote = ''; else if (/[`$\r\n]/.test(c)) return null; else word += c; continue; }
    if (/[;&|`$<>\r\n]/.test(c)) return null;
    if (c === "'" || c === '"') { quote = c; started = true; }
    else if (/\s/.test(c)) { if (started) words.push(word); word = ''; started = false; }
    else { word += c; started = true; }
  }
  if (quote) return null;
  if (started) words.push(word);
  return words;
}

function originalCommand(command: string, root: string, sessionId: string): string {
  if (!command.startsWith('GW_SESSION_ID=')) return command;
  const words = shellWords(command);
  if (!words || words[0] !== `GW_SESSION_ID=${sessionId}` || words[1] !== `GW_ROOT=${root}`) return '';
  const separator = words.indexOf('run', 3);
  return separator >= 3 && words[separator + 1] === '--' && words.length === separator + 3 ? words[separator + 2]! : '';
}

export function recordImpactEvidence(root: string, ev: HookEvent): void {
  if (!ev.sessionId || ev.event !== 'post_tool' || !ev.response || (ev.response as { is_error?: boolean }).is_error) return;
  const paths: string[] = [];
  if (ev.tool === 'Read') {
    const response = ev.response as { type?: string; file?: { filePath?: string; numLines?: number } };
    if (response.type === 'text' && response.file?.filePath && (response.file.numLines ?? 0) > 0) paths.push(response.file.filePath);
  } else if (['Edit', 'Write', 'MultiEdit'].includes(ev.tool ?? '') && typeof ev.input.file_path === 'string') paths.push(ev.input.file_path);
  const inputCommand = ev.tool === 'Bash' && typeof ev.input.command === 'string' ? ev.input.command : '';
  const rawCommand = inputCommand.length <= 4096 ? originalCommand(inputCommand, root, ev.sessionId) : '';
  const command = rawCommand.length <= 4096 && /^(?:(?:npx )?(?:vitest|jest|pytest)\b|python(?:3)? -m pytest\b|(?:npm|pnpm|yarn) (?:run )?test(?:\s|$))/.test(rawCommand.trim()) ? rawCommand : undefined;
  if (!paths.length && !command) return;
  updateSessionLedger(root, ev.sessionId, (ledger) => {
    const state = stateSchema.parse(ledger.impactEvidence ?? {});
    const files = paths.map((file) => repoRelative(root, file, ev.cwd)).filter((file): file is string => !!file);
    return { ...ledger, impactEvidence: {
      files: [...new Set([...state.files, ...files])].slice(-512),
      commands: [...state.commands, ...(command ? [{ command, cwd: ev.cwd }] : [])].slice(-256),
    } };
  });
}

export function sessionEvidence(root: string, sessionId?: string) {
  const opened = new Set<string>(), commands: { command: string; cwd: string }[] = [];
  let known = false, commandsObserved = 0;
  if (sessionId) try {
    const ledger = readSessionLedger(root, sessionId);
    const state = stateSchema.parse(ledger.impactEvidence ?? {});
    state.files.forEach((f) => opened.add(f)); commands.push(...state.commands);
    const navigation = z.object({ reads: z.array(z.object({ file: z.string() })).default([]) }).parse(ledger.navigation ?? {});
    navigation.reads.forEach((r) => opened.add(r.file));
    commandsObserved = Object.keys((ledger.guards as { commands?: object } | undefined)?.commands ?? {}).length;
    known = Object.keys(ledger).length > 0;
  } catch { /* Invalid or absent session evidence is never proof of coverage. */ }
  let packageTest = '';
  try { packageTest = String(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.test ?? ''); } catch { /* Python-only repository. */ }
  const ran = (file: string) => commands.some(({ command, cwd }) => {
    if (/[;&|`$<>\n]/.test(command)) return false;
    const words = (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) => w.replace(/^['"]|['"]$/g, ''));
    let args: string[];
    if (/^(?:npx )?(?:vitest|jest|pytest)\b/.test(command.trim()) || /^python(?:3)? -m pytest\b/.test(command.trim())) {
      args = words.slice(words[0] === 'npx' ? 2 : words[1] === '-m' ? 3 : 1);
    } else if (/\b(vitest|jest|pytest)\b/.test(packageTest) && path.resolve(cwd) === path.resolve(root) && /^(npm|pnpm|yarn) (?:run )?test(?:\s|$)/.test(command.trim())) {
      args = words.slice(words[1] === 'run' ? 3 : 2);
    } else return false;
    args = args.filter((a) => a !== '--' && a !== 'run' && a !== '--run');
    if (!args.length) return path.resolve(root, file).startsWith(path.resolve(cwd) + path.sep);
    return args.some((a) => !a.startsWith('-') && repoRelative(root, a, cwd) === file);
  });
  return { opened, ran, known, commandsObserved };
}
