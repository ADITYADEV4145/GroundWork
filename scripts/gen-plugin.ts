// Regenerate the Claude Code plugin's hooks/hooks.json from the same map `gw setup` uses.
import { writeFileSync } from 'node:fs';
import { claudeHookMap } from '../src/setup/targets.js';

export const PLUGIN_GW = 'npx -y groundwork-agent';

export function pluginHooks(): unknown {
  const hooks: Record<string, unknown[]> = {};
  for (const [event, entries] of Object.entries(claudeHookMap(PLUGIN_GW)))
    hooks[event] = entries.map((e) => ({ ...(e.matcher ? { matcher: e.matcher } : {}), hooks: [{ type: 'command', command: e.command, timeout: 10 }] }));
  return { hooks };
}

if (process.argv[1]?.endsWith('gen-plugin.ts')) {
  writeFileSync(new URL('../hooks/hooks.json', import.meta.url), JSON.stringify(pluginHooks(), null, 2) + '\n');
  console.log('wrote hooks/hooks.json');
}
