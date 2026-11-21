import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentName } from '../hooks/types.js';

// What `gw setup` writes for each agent. Every entry carries the Groundwork command, which is how
// `gw setup --remove` finds exactly what it added and nothing else.

export interface JsonEdit {
  kind: 'json';
  file: string;
  /** Adds our entries to the parsed file; must be idempotent. */
  add(doc: Record<string, unknown>): void;
  /** Removes only our entries. */
  remove(doc: Record<string, unknown>): void;
}

export interface BlockEdit {
  kind: 'block';
  file: string;
  block: string;
}

export type Edit = JsonEdit | BlockEdit;

export interface AgentTarget {
  agent: AgentName;
  label: string;
  edits: Edit[];
  notes: string[];
}

export const BLOCK_START = '# >>> groundwork (managed by gw setup; remove with gw setup --remove)';
export const BLOCK_END = '# <<< groundwork';

type HookMap = Record<string, { matcher?: string; command: string }[]>;

/** Any Groundwork hook, whichever launch command installed it, so removal and re-setup with a new `--command` find it. */
const OUR_HOOK = /(?:^|[\s/])(?:gw|groundwork-agent)(?:\s+\S+)*\s+hook\s+(?:claude|codex|cursor)\s+\w+$/;

function isOurs(command: unknown): boolean {
  return typeof command === 'string' && OUR_HOOK.test(command.trim());
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Claude Code and Codex share the `{ hooks: { Event: [{ matcher, hooks: [{ type, command }] }] } }` shape. */
function nestedHooks(file: string, gw: string, map: HookMap): JsonEdit {
  return {
    kind: 'json',
    file,
    add(doc) {
      this.remove(doc);
      const hooks = asObject(doc.hooks);
      for (const [event, entries] of Object.entries(map)) {
        const list = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
        for (const e of entries) list.push({ ...(e.matcher ? { matcher: e.matcher } : {}), hooks: [{ type: 'command', command: e.command, timeout: 10 }] });
        hooks[event] = list;
      }
      doc.hooks = hooks;
    },
    remove(doc) {
      const hooks = asObject(doc.hooks);
      for (const event of Object.keys(hooks)) {
        if (!Array.isArray(hooks[event])) continue;
        const kept = (hooks[event] as unknown[]).filter((g) => {
          const inner = asObject(g).hooks;
          return !(Array.isArray(inner) && inner.some((h) => isOurs(asObject(h).command)));
        });
        if (kept.length) hooks[event] = kept;
        else delete hooks[event];
      }
      if (doc.hooks !== undefined) {
        if (Object.keys(hooks).length) doc.hooks = hooks;
        else delete doc.hooks;
      }
    },
  };
}

function cursorHooks(file: string, gw: string, map: HookMap): JsonEdit {
  return {
    kind: 'json',
    file,
    add(doc) {
      this.remove(doc);
      const hooks = asObject(doc.hooks);
      for (const [event, entries] of Object.entries(map)) {
        const list = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
        for (const e of entries) list.push({ command: e.command, ...(e.matcher ? { matcher: e.matcher } : {}) });
        hooks[event] = list;
      }
      doc.version ??= 1;
      doc.hooks = hooks;
    },
    remove(doc) {
      const hooks = asObject(doc.hooks);
      for (const event of Object.keys(hooks)) {
        if (!Array.isArray(hooks[event])) continue;
        const kept = (hooks[event] as unknown[]).filter((h) => !isOurs(asObject(h).command));
        if (kept.length) hooks[event] = kept;
        else delete hooks[event];
      }
      if (doc.hooks !== undefined) {
        if (Object.keys(hooks).length) doc.hooks = hooks;
        else {
          delete doc.hooks;
          if (Object.keys(doc).length === 1 && doc.version === 1) delete doc.version;
        }
      }
    },
  };
}

const OUR_MCP = /(?:^|[\s/])(?:gw|groundwork-agent)(?:\s+\S+)*\s+mcp$/;

/** An entry `gw setup` wrote: only `command` and `args`, launching `gw mcp`. Anything else is the user's and is left alone. */
function isOurMcp(entry: unknown): boolean {
  const e = asObject(entry);
  if (Object.keys(e).some((k) => k !== 'command' && k !== 'args')) return false;
  if (typeof e.command !== 'string' || !Array.isArray(e.args)) return false;
  return OUR_MCP.test([e.command, ...(e.args as unknown[]).map(String)].join(' '));
}

function mcpServer(file: string, gw: string): JsonEdit {
  const [command, ...prefix] = gw.split(' ');
  return {
    kind: 'json',
    file,
    add(doc) {
      const servers = asObject(doc.mcpServers);
      if ('groundwork' in servers && !isOurMcp(servers.groundwork)) return;
      servers.groundwork = { command, args: [...prefix, 'mcp'] };
      doc.mcpServers = servers;
    },
    remove(doc) {
      const servers = asObject(doc.mcpServers);
      if (!('groundwork' in servers) || !isOurMcp(servers.groundwork)) return;
      delete servers.groundwork;
      if (Object.keys(servers).length) doc.mcpServers = servers;
      else delete doc.mcpServers;
    },
  };
}

export const FIND_CODE_TOOLS = ['mcp__groundwork__find_code', 'mcp__plugin_groundwork_groundwork__find_code'];

export function claudeHookMap(gw: string): HookMap {
  return {
    PreToolUse: [{ matcher: 'Read|Bash', command: `${gw} hook claude pre_tool` }],
    PostToolUse: [{ matcher: ['Read', 'Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', ...FIND_CODE_TOOLS].join('|'), command: `${gw} hook claude post_tool` }],
    PreCompact: [{ command: `${gw} hook claude pre_compact` }],
    Stop: [{ command: `${gw} hook claude stop` }],
  };
}

export interface TargetOptions {
  root: string;
  /** Unused since every file is project-scoped; kept so callers can pass it. */
  home?: string;
  /** How hooks and MCP launch Groundwork, e.g. `gw` or `npx -y groundwork-agent`. */
  gw: string;
}

export function targetsFor(opts: TargetOptions): AgentTarget[] {
  const { root, gw } = opts;
  return [
    {
      agent: 'claude',
      label: 'Claude Code',
      edits: [nestedHooks(path.join(root, '.claude', 'settings.json'), gw, claudeHookMap(gw)), mcpServer(path.join(root, '.mcp.json'), gw)],
      notes: ['Claude Code asks once to approve the project MCP server in .mcp.json.'],
    },
    {
      agent: 'codex',
      label: 'Codex',
      edits: [
        nestedHooks(path.join(root, '.codex', 'hooks.json'), gw, {
          PreToolUse: [{ matcher: 'Bash', command: `${gw} hook codex pre_tool` }],
          PostToolUse: [{ matcher: ['apply_patch', 'Bash', ...FIND_CODE_TOOLS].join('|'), command: `${gw} hook codex post_tool` }],
          PreCompact: [{ command: `${gw} hook codex pre_compact` }],
          Stop: [{ command: `${gw} hook codex stop` }],
        }),
        {
          kind: 'block',
          file: path.join(root, '.codex', 'config.toml'),
          block: `[mcp_servers.groundwork]\ncommand = ${JSON.stringify(gw.split(' ')[0])}\nargs = ${JSON.stringify([...gw.split(' ').slice(1), 'mcp'])}`,
        },
      ],
      notes: ['Codex loads project .codex/ hooks and MCP config only in trusted projects; then open /hooks in Codex and approve the Groundwork entries.'],
    },
    {
      agent: 'cursor',
      label: 'Cursor',
      edits: [
        cursorHooks(path.join(root, '.cursor', 'hooks.json'), gw, {
          preToolUse: [{ matcher: 'Read|Shell', command: `${gw} hook cursor pre_tool` }],
          postToolUse: [{ matcher: 'Read|Shell|Write|Edit|MCP:find_code', command: `${gw} hook cursor post_tool` }],
          preCompact: [{ command: `${gw} hook cursor pre_compact` }],
          stop: [{ command: `${gw} hook cursor stop` }],
        }),
        mcpServer(path.join(root, '.cursor', 'mcp.json'), gw),
      ],
      notes: ['Cursor gates on stop, not afterFileEdit; enable the groundwork MCP server in Cursor settings if prompted.'],
    },
  ];
}

function onPath(bin: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Agents that look installed on this machine. */
export function detectAgents(home = os.homedir()): AgentName[] {
  const found: AgentName[] = [];
  if (onPath('claude') || existsSync(path.join(home, '.claude'))) found.push('claude');
  if (onPath('codex') || existsSync(path.join(home, '.codex'))) found.push('codex');
  if (onPath('cursor') || onPath('cursor-agent') || existsSync(path.join(home, '.cursor'))) found.push('cursor');
  return found;
}
