import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import type { AgentName } from '../hooks/types.js';
import { onPath, targetsFor, type AgentTarget, type JsonEdit, type SkillEdit, type TargetOptions } from './targets.js';

// Every client `gw install` knows. Claude Code, Codex and Cursor get hooks and MCP (targets.ts);
// the rest get the MCP server and the skill, because Groundwork has no hook runner for them.

export type ClientName = AgentName | 'gemini' | 'copilot' | 'zed' | 'kiro' | 'opencode';
export type Enforcement = 'hooks' | 'mcp-only';

export interface ClientInfo {
  name: ClientName;
  label: string;
  enforcement: Enforcement;
  /** One line: what Groundwork can and cannot do in this client. */
  enforced: string;
  /** Binaries and home-relative paths that mean the client is installed. */
  bins: string[];
  homePaths: string[];
}

const MCP_ONLY = 'MCP tools and the skill; no hook runs, so nothing is blocked (use `gw check` before a commit or in CI as the gate)';

export const CLIENTS: ClientInfo[] = [
  { name: 'claude', label: 'Claude Code', enforcement: 'hooks', enforced: 'hooks (read guard, waste guards, grounding notes, Stop gate; the Stop gate blocks in the strict profile) and MCP tools', bins: ['claude'], homePaths: ['.claude'] },
  { name: 'codex', label: 'Codex', enforcement: 'hooks', enforced: 'hooks (waste guards, grounding notes, Stop gate; the Stop gate blocks in the strict profile), MCP tools and the skill', bins: ['codex'], homePaths: ['.codex'] },
  { name: 'cursor', label: 'Cursor', enforcement: 'hooks', enforced: 'hooks (read guard, waste guards, Stop gate in the strict profile only) and MCP tools', bins: ['cursor', 'cursor-agent'], homePaths: ['.cursor'] },
  { name: 'gemini', label: 'Gemini CLI', enforcement: 'mcp-only', enforced: MCP_ONLY, bins: ['gemini'], homePaths: ['.gemini'] },
  { name: 'copilot', label: 'GitHub Copilot (VS Code)', enforcement: 'mcp-only', enforced: MCP_ONLY, bins: ['code', 'code-insiders'], homePaths: ['.vscode', '.config/Code', 'Library/Application Support/Code'] },
  { name: 'zed', label: 'Zed', enforcement: 'mcp-only', enforced: MCP_ONLY, bins: ['zed', 'zeditor'], homePaths: ['.config/zed', 'Library/Application Support/Zed'] },
  { name: 'kiro', label: 'Kiro', enforcement: 'mcp-only', enforced: MCP_ONLY, bins: ['kiro', 'kiro-cli'], homePaths: ['.kiro'] },
  { name: 'opencode', label: 'OpenCode', enforcement: 'mcp-only', enforced: MCP_ONLY, bins: ['opencode'], homePaths: ['.config/opencode', '.opencode'] },
];

export const CLIENT_NAMES = CLIENTS.map((c) => c.name);

export function clientInfo(name: string): ClientInfo | undefined {
  return CLIENTS.find((c) => c.name === name);
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function entryKey(entry: unknown): string {
  const e = asObject(entry);
  return `mcp:${JSON.stringify(Object.fromEntries(Object.keys(e).sort().map((k) => [k, e[k]])))}`;
}

/** A `groundwork` entry under `section` (e.g. `mcpServers`, `servers`, `context_servers`, `mcp`). An entry the user wrote under that name is left alone. */
function serverEntry(file: string, section: string, entry: Record<string, unknown>, seed: Record<string, unknown> = {}): JsonEdit {
  const seeded = (doc: Record<string, unknown>) => Object.keys(seed).filter((k) => !(k in doc));
  return {
    kind: 'json',
    file,
    owned: (doc) => [entryKey(entry), ...seeded(doc).map((k) => `seed:${k}`)],
    add(doc, known) {
      const servers = asObject(doc[section]);
      if ('groundwork' in servers && !known.has(entryKey(servers.groundwork))) return;
      for (const k of seeded(doc)) doc[k] = seed[k];
      servers.groundwork = entry;
      doc[section] = servers;
    },
    remove(doc, known) {
      const servers = asObject(doc[section]);
      if (!('groundwork' in servers) || !known.has(entryKey(servers.groundwork))) return;
      delete servers.groundwork;
      if (Object.keys(servers).length) doc[section] = servers;
      else delete doc[section];
      for (const k of Object.keys(seed)) if (known.has(`seed:${k}`) && doc[k] === seed[k]) delete doc[k];
    },
  };
}

function skillEdits(root: string): SkillEdit[] {
  const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
  const files = ['SKILL.md', ...readdirSync(path.join(packageRoot, 'references')).filter((f) => f.endsWith('.md')).map((f) => `references/${f}`)];
  return files.map((file) => ({ kind: 'skill', file: path.join(root, '.agents/skills/groundwork', file), content: readFileSync(path.join(packageRoot, file), 'utf8') }));
}

/** Targets for all eight clients, in CLIENTS order. */
export function clientTargets(opts: TargetOptions): AgentTarget[] {
  const { root, gw } = opts;
  const [command, ...prefix] = gw.split(' ');
  const args = [...prefix, 'mcp'];
  const stdio = { command, args };
  const skill = () => skillEdits(root);
  const mcpOnly: AgentTarget[] = [
    { agent: 'gemini', label: 'Gemini CLI', edits: [serverEntry(path.join(root, '.gemini', 'settings.json'), 'mcpServers', stdio), ...skill()], notes: ['Gemini CLI: run /mcp to confirm the groundwork server is connected.'] },
    { agent: 'copilot', label: 'GitHub Copilot (VS Code)', edits: [serverEntry(path.join(root, '.vscode', 'mcp.json'), 'servers', { type: 'stdio', ...stdio }), ...skill()], notes: ['VS Code: open .vscode/mcp.json and press Start above the groundwork server, then use Copilot Chat in agent mode.'] },
    { agent: 'zed', label: 'Zed', edits: [serverEntry(path.join(root, '.zed', 'settings.json'), 'context_servers', { ...stdio, env: {} }), ...skill()], notes: ['Zed: the server shows up in the Agent Panel settings; .zed/settings.json must be plain JSON (no comments) for gw install to edit it.'] },
    { agent: 'kiro', label: 'Kiro', edits: [serverEntry(path.join(root, '.kiro', 'settings', 'mcp.json'), 'mcpServers', stdio), ...skill()], notes: ['Kiro: check the MCP Servers view and approve the groundwork tools when asked.'] },
    { agent: 'opencode', label: 'OpenCode', edits: [serverEntry(path.join(root, 'opencode.json'), 'mcp', { type: 'local', command: [command!, ...args], enabled: true }, { $schema: 'https://opencode.ai/config.json' }), ...skill()], notes: ['OpenCode: run `opencode mcp list` to confirm the groundwork server.'] },
  ];
  return [...targetsFor(opts), ...mcpOnly];
}

/** Clients that look installed on this machine, or already have a project config in `root`. */
export function detectClients(home = os.homedir(), root?: string, hasBin: (bin: string) => boolean = onPath): ClientName[] {
  const projectDirs: Partial<Record<ClientName, string[]>> = { gemini: ['.gemini'], copilot: ['.vscode'], zed: ['.zed'], kiro: ['.kiro'], opencode: ['opencode.json', '.opencode'] };
  return CLIENTS.filter((c) => c.bins.some(hasBin) || c.homePaths.some((p) => existsSync(path.join(home, p))) || (root !== undefined && (projectDirs[c.name] ?? []).some((p) => existsSync(path.join(root, p))))).map((c) => c.name);
}

/** Keeps the first edit of each file, so clients sharing the skill directory plan it once. */
export function dedupeEdits(targets: AgentTarget[]): AgentTarget[] {
  const seen = new Set<string>();
  return targets.map((t) => ({ ...t, edits: t.edits.filter((e) => !seen.has(e.file) && (seen.add(e.file), true)) }));
}
