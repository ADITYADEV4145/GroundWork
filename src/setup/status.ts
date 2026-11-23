import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { planSetup } from './apply.js';
import { CLIENTS, clientTargets, detectClients, type ClientName, type Enforcement } from './clients.js';
import { onPath } from './targets.js';

// What `gw doctor` reports per client: is it on this machine, is every Groundwork entry in place, can the client start `gw`.

export interface ClientStatus {
  client: ClientName;
  label: string;
  enforcement: Enforcement;
  detected: boolean;
  /** 'installed': every entry present. 'partial': some missing or changed. 'none': nothing installed. 'broken': a config file cannot be read. */
  state: 'installed' | 'partial' | 'none' | 'broken';
  /** Project-relative files with a missing or changed Groundwork entry. */
  missing: string[];
  /** The launcher found in the client's config (e.g. `gw`), and whether it resolves on PATH. */
  command: string | null;
  commandFound: boolean | null;
  problem: string | null;
}

const LAUNCHERS = ['gw', 'npx -y groundwork-agent', 'npx groundwork-agent', 'bunx groundwork-agent'];

/** Launchers written in a client's config files: whatever precedes ` hook <agent> <event>` or the MCP `mcp` argument. */
function launchersIn(files: string[]): string[] {
  const out = new Set<string>();
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(/"command":\s*"([^"]+?) hook (?:claude|codex|cursor) \w+"/g)) out.add(m[1]!);
    for (const m of text.matchAll(/"groundwork":\s*\{[^{}]*?"command":\s*"([^"]+)"[^{}]*?"args":\s*\[([^\]]*)\]/g)) {
      const args = [...m[2]!.matchAll(/"([^"]*)"/g)].map((a) => a[1]!);
      if (args.at(-1) === 'mcp') out.add([m[1]!, ...args.slice(0, -1)].join(' '));
    }
    for (const m of text.matchAll(/"groundwork":\s*\{[^{}]*?"command":\s*\[([^\]]*)\]/g)) {
      const parts = [...m[1]!.matchAll(/"([^"]*)"/g)].map((a) => a[1]!);
      if (parts.at(-1) === 'mcp') out.add(parts.slice(0, -1).join(' '));
    }
    for (const m of text.matchAll(/\[mcp_servers\.groundwork\]\s*\ncommand = "([^"]+)"\nargs = \[([^\]]*)\]/g)) {
      const args = [...m[2]!.matchAll(/"([^"]*)"/g)].map((a) => a[1]!);
      out.add([m[1]!, ...args.slice(0, -1)].join(' '));
    }
  }
  return [...out];
}

/** True when the file's groundwork server entry is disabled (`enabled: false` in OpenCode, `disabled: true` in Kiro and others). */
function switchedOff(file: string): boolean {
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  if (!doc || typeof doc !== 'object') return false;
  return Object.values(doc).some((section) => {
    const entry = section && typeof section === 'object' ? (section as Record<string, unknown>).groundwork : null;
    return !!entry && typeof entry === 'object' && ((entry as Record<string, unknown>).enabled === false || (entry as Record<string, unknown>).disabled === true);
  });
}

export function clientStatuses(root: string, options: { home?: string; hasBin?: (bin: string) => boolean } = {}): ClientStatus[] {
  const hasBin = options.hasBin ?? onPath;
  const detected = new Set(detectClients(options.home, root, hasBin));
  return CLIENTS.map((info) => {
    const base = { client: info.name, label: info.label, enforcement: info.enforcement, detected: detected.has(info.name) };
    const targetFor = (gw: string) => clientTargets({ root, gw }).find((t) => t.agent === info.name)!;
    const files = targetFor('gw').edits.filter((e) => e.kind !== 'skill').map((e) => e.file);
    const found = launchersIn(files);
    let best: { gw: string; missing: string[]; present: number } | null = null;
    try {
      for (const gw of [...new Set([...found, ...LAUNCHERS])]) {
        const plan = planSetup(root, [targetFor(gw)], 'add');
        const missing = plan.filter((c) => c.action !== 'unchanged').map((c) => path.relative(root, c.file));
        const present = plan.length - missing.length;
        if (!best || present > best.present) best = { gw, missing, present };
      }
    } catch (e) {
      return { ...base, state: 'broken' as const, missing: [], command: found[0] ?? null, commandFound: null, problem: (e as Error).message.replace(/; fix or remove it.*$/, '').replace(root + path.sep, '') };
    }
    const off = files.find(switchedOff);
    if (off) return { ...base, state: 'broken' as const, missing: [], command: found[0] ?? null, commandFound: null, problem: `the groundwork server is switched off in ${path.relative(root, off)}` };
    const configPresent = files.filter((f) => existsSync(f)).length;
    const nothing = found.length === 0 && (best!.present === 0 || configPresent === 0);
    if (nothing) return { ...base, state: 'none' as const, missing: [], command: null, commandFound: null, problem: null };
    const command = found[0] ?? best!.gw;
    const commandFound = hasBin(command.split(' ')[0]!);
    const state = best!.missing.length ? ('partial' as const) : ('installed' as const);
    const problem = !commandFound ? `\`${command.split(' ')[0]}\` is not on PATH, so the client may not be able to start Groundwork` : state === 'partial' ? `missing or changed: ${best!.missing.join(', ')}` : null;
    return { ...base, state, missing: best!.missing, command, commandFound, problem };
  });
}
