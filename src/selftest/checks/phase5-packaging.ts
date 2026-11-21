import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Check } from '../registry.js';

const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else files[path.relative(root, file)] = readFileSync(file, 'utf8');
    }
  }
  walk(root);
  return files;
}
function sandbox() {
  const base = mkdtempSync(path.join(os.tmpdir(), 'gw-packaging-'));
  const root = path.join(base, 'repo');
  const home = path.join(base, 'home');
  mkdirSync(root); mkdirSync(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex'), XDG_CONFIG_HOME: path.join(home, '.config'), npm_config_cache: path.join(base, 'npm-cache'), npm_config_userconfig: path.join(home, '.npmrc') };
  execFileSync('git', ['init', '-q', root], { env });
  return { base, root, home, env };
}
function seed(root: string) {
  const files = {
    '.claude/settings.json': '{ "model": "user-model", "hooks": { "Stop": [] } }\n',
    '.mcp.json': '{"mcpServers":{"user-server":{"command":"echo"}}}\n',
    '.codex/config.toml': 'model = "user-model"\n',
    '.codex/hooks.json': '{"hooks":{"Stop":[]}}\n',
    '.cursor/hooks.json': '{"version":1,"hooks":{"stop":[{"command":"echo user"}]}}\n',
    '.cursor/mcp.json': '{"mcpServers":{}}\n',
    '.agents/skills/user-skill/SKILL.md': '# User skill\n',
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content);
  }
}
export const packagingChecks: Check[] = [
  { phase: 5, name: 'setup CLI install/remove leaves no trace (Claude Code, Codex, Cursor)', async run() {
    const s = sandbox();
    try {
      seed(s.root); seed(s.home);
      const before = JSON.stringify({ repo: snapshot(s.root), home: snapshot(s.home) });
      const cli = path.join(packageRoot, existsSync(path.join(packageRoot, 'src/cli/main.ts')) ? 'src/cli/main.ts' : 'dist/cli/main.js');
      const args = cli.endsWith('.ts') ? ['--import', 'tsx', cli] : [cli];
      const run = (remove: boolean) => execFileSync(process.execPath, [...args, '--root', s.root, 'setup', '--agent', 'claude,codex,cursor', '--yes', ...(remove ? ['--remove'] : [])], { cwd: packageRoot, env: s.env, timeout: 30000 });
      run(false);
      for (const file of ['.claude/settings.json', '.codex/hooks.json', '.cursor/hooks.json', '.agents/skills/groundwork/SKILL.md', '.agents/skills/groundwork/references/navigation.md']) {
        if (!existsSync(path.join(s.root, file))) return { ok: false, detail: `setup did not create ${file}` };
      }
      run(true);
      const after = JSON.stringify({ repo: snapshot(s.root), home: snapshot(s.home) });
      return { ok: before === after, detail: before === after ? 'real CLI: all repo and HOME config bytes restored; existing user settings and skills preserved' : `before/after config differs\nbefore: ${before}\nafter: ${after}` };
    } finally { rmSync(s.base, { recursive: true, force: true }); }
  } },
  { phase: 5, name: 'packed fresh-prefix install + three-agent setup + doctor < 180 s', slow: true, async run() {
    if (process.env.GW_SELFTEST_INSTALL !== '1') return { ok: true, skipped: true, detail: 'requires network for an empty-cache npm install; opt in with GW_SELFTEST_INSTALL=1 (enabled by the source npm run selftest gate)' };
    const s = sandbox();
    const start = performance.now();
    const run = (command: string, args: string[], cwd = s.root) => execFileSync(command, args, { cwd, env: s.env, encoding: 'utf8', timeout: Math.max(1, Math.floor(180000 - (performance.now() - start))), maxBuffer: 10 * 1024 * 1024 });
    try {
      if (existsSync(path.join(packageRoot, 'scripts/bundle-hook.mjs'))) run('npm', ['run', 'build'], packageRoot);
      const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', s.base], packageRoot)) as { filename: string }[];
      const archive = packed[0];
      if (!archive) throw new Error('npm pack returned no archive');
      const prefix = path.join(s.base, 'prefix');
      run('npm', ['install', '--global', '--prefix', prefix, '--no-audit', '--no-fund', path.join(s.base, archive.filename)]);
      const cli = path.join(prefix, 'bin/gw');
      run(process.execPath, [cli, 'init']);
      run(process.execPath, [cli, 'setup', '--agent', 'claude,codex,cursor', '--yes']);
      const doctor = JSON.parse(run(process.execPath, [cli, '--json', 'doctor'])) as { ok: boolean };
      const seconds = (performance.now() - start) / 1000;
      return { ok: doctor.ok && seconds < 180, detail: `npm pack + clean prefix/HOME install + init + Claude Code/Codex/Cursor setup + doctor: ${seconds.toFixed(2)} s (limit 180 s); doctor ${doctor.ok ? 'PASS' : 'FAIL'}`, metrics: { seconds } };
    } finally { rmSync(s.base, { recursive: true, force: true }); }
  } },
];
