import path from 'node:path';
import { statSync } from 'node:fs';
import { readLedger, stats, summary, updateLedger } from '../../guards/ledger.js';
import { commandInfo, lastSummary, responseText, workspaceFingerprint } from '../../guards/repeat.js';
import { invokingGw, noisyTool, shellQuote } from '../../guards/trimmer.js';
import { log } from '../../util/log.js';
import type { HookHandler, HookResult } from '../types.js';

export const wasteGuards: HookHandler = {
  name: 'waste_guards',
  events: ['pre_tool', 'post_tool', 'stop'],
  run(ev, { root, config }) {
    if (!ev.sessionId) return null;
    try {
      const cfg = config.guards;
      if (ev.event === 'stop') {
        if (!cfg.sessionSummary || (ev.raw as Record<string, unknown> | null)?.stop_hook_active) return null;
        return { action: 'context', message: summary(readLedger(root, ev.sessionId)) };
      }
      let result: HookResult | null = null;
      const command = typeof ev.input.command === 'string' ? ev.input.command : '';
      const info = commandInfo(command);
      if (ev.tool === 'Bash' && command && ev.event === 'pre_tool') {
        const rawFingerprint = cfg.repeatCommand.enabled ? workspaceFingerprint(root) : 'unknown';
        const fingerprint = rawFingerprint === 'unknown' ? 'unknown' : `${ev.cwd}:${rawFingerprint}`;
        updateLedger(root, ev.sessionId, (l) => {
          l.step++;
          const previous = Object.hasOwn(l.commands, info.normalized) ? l.commands[info.normalized] : undefined;
          if (cfg.repeatCommand.enabled && info.forced) stats(l, 'repeatCommand').forced++;
          if (cfg.repeatCommand.enabled && !info.forced && !cfg.repeatCommand.exempt.some((prefix) => info.normalized.startsWith(prefix)) && fingerprint !== 'unknown' && previous?.fingerprint === fingerprint) {
            const s = stats(l, 'repeatCommand');
            s.interventions++; s.tokensSaved += previous.outputBytes / 4;
            result = { action: 'deny', message: `Same command, nothing changed since step ${previous.step}. Last result: ${previous.summary}. Change something first, or rerun with force.` };
          }
        });
        if (result) return result;
        if (ev.agent === 'claude' && cfg.outputTrimmer.enabled && noisyTool(info.command) && !/\bgw\s+run\s+--/.test(info.command)) {
          return { action: 'allow', updatedInput: { ...ev.input, command: `GW_SESSION_ID=${shellQuote(ev.sessionId)} GW_ROOT=${shellQuote(root)} ${invokingGw()} run -- ${shellQuote(info.command)}` } };
        }
        if (info.forced && ev.agent === 'claude') return { action: 'allow', updatedInput: { ...ev.input, command: info.command } };
      }
      if (ev.tool === 'Bash' && command && ev.event === 'post_tool' && cfg.repeatCommand.enabled) {
        // A rewritten command is an implementation detail; run records the original.
        if (command.includes('GW_SESSION_ID=') && command.includes(' run -- ')) return null;
        const text = responseText(ev.response);
        const rawFingerprint = workspaceFingerprint(root);
        const fingerprint = rawFingerprint === 'unknown' ? 'unknown' : `${ev.cwd}:${rawFingerprint}`;
        updateLedger(root, ev.sessionId, (l) => {
          const previous = l.commands[info.normalized];
          if (previous?.logPath && text.includes(previous.logPath)) return;
          l.commands[info.normalized] = { step: l.step, fingerprint, summary: lastSummary(text), logPath: null, outputBytes: Buffer.byteLength(text) };
        });
      }
      if (ev.event === 'post_tool' && cfg.explorationHint.enabled) {
        updateLedger(root, ev.sessionId, (l) => {
          if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(ev.tool ?? '')) l.exploration = { files: [], hinted: false };
          const files: string[] = [];
          if (ev.tool === 'Read' && typeof ev.input.file_path === 'string') files.push(ev.input.file_path);
          if (ev.tool === 'Grep' || ev.tool === 'Glob') {
            if (typeof ev.input.path === 'string') {
              try { if (statSync(path.resolve(ev.cwd, ev.input.path)).isFile()) files.push(ev.input.path); } catch { /* not an obvious file */ }
            }
            if (ev.response && typeof ev.response === 'object' && Array.isArray((ev.response as Record<string, unknown>).filenames))
              files.push(...((ev.response as Record<string, unknown>).filenames as unknown[]).filter((f): f is string => typeof f === 'string'));
          }
          l.exploration.files = [...new Set([...l.exploration.files, ...files.map((f) => path.resolve(ev.cwd, f))])];
          if (l.exploration.files.length > cfg.explorationHint.threshold && !l.exploration.hinted) {
            l.exploration.hinted = true; stats(l, 'explorationHint').interventions++;
            result = { action: 'context', message: `Read ${l.exploration.files.length} files without an edit. Try repo_map / find_code to narrow the search.` };
          }
        });
      }
      return result;
    } catch (error) { log(root, 'warn', 'waste_guard_failed', { error: String(error) }); return null; }
  },
};
