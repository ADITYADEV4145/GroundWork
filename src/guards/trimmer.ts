export type NoisyTool = 'pytest' | 'vitest' | 'jest' | 'tsc' | 'eslint' | 'ruff' | 'install' | 'generic';
export function isSimpleNoisyCommand(command: string): boolean {
  const words: string[] = [];
  let word = '';
  let quote = '';
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (c === '\n' || c === '\r') return false;
    if (quote === "'") {
      if (c === "'") quote = ''; else word += c;
      continue;
    }
    if (c === '\\') {
      const next = command[++i];
      if (!next || next === '\n' || next === '\r') return false;
      word += next; continue;
    }
    if (c === '`' || (c === '$' && command[i + 1] === '(')) return false;
    if (quote === '"') {
      if (c === '"') quote = ''; else word += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (/[;&|<>(){}#]/.test(c)) return false;
    if (/\s/.test(c)) { if (word) words.push(word); word = ''; }
    else word += c;
  }
  if (quote) return false;
  if (word) words.push(word);
  while (words[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift();
  if (words[0] === 'npx') words.shift();
  else if (words[0] === 'pnpm' && words[1] === 'exec') words.splice(0, 2);
  else if (/^python[23]?$/.test(words[0] ?? '') && words[1] === '-m') words.splice(0, 2);
  const executable = words[0]?.split('/').at(-1) ?? '';
  if (/^(pytest|vitest|jest|tsc|eslint|ruff)$/.test(executable)) return true;
  if (/^(npm|pnpm|yarn)$/.test(executable)) return /^(?:run\s+)?(?:test|build|lint)(?:\s|$)|^(?:install|i)(?:\s|$)/.test(words.slice(1).join(' '));
  return /^(pip|pip3)$/.test(executable) && words[1] === 'install';
}
export function noisyTool(command: string): NoisyTool | null {
  for (const tool of ['pytest', 'vitest', 'jest', 'tsc', 'eslint', 'ruff'] as const)
    if (new RegExp(`(?:^|[\\s/;&|])${tool}(?:\\s|$)`).test(command)) return tool;
  if (/(?:^|[\s;&|])(?:npm|pnpm|yarn|pip|pip3)\s+(?:install|i)(?:\s|$)/.test(command)) return 'install';
  if (/(?:^|[\s;&|])(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|build|lint)(?:\s|$)/.test(command)) return 'generic';
  return null;
}
export const failurePattern = /FAIL|Error|error TS|✗|✕|×|❯|failed|^\s*E {2}|Traceback|ERR[_!]|AssertionError|assert |Assertion|\berror\b|\bF\d{3}\b|\bE\d{3}\b/i;
const parsers: Record<NoisyTool, RegExp> = {
  pytest: /_{3,}|^\s*>|^\s*E\s|short test summary|=+.*(?:failed|passed)|\.py:\d+/,
  vitest: /[❯×✗]|Assertion|Expected:|Received:|Test Files|Tests\s|\.\w+:[0-9]+/,
  jest: /●|Expected\b|Received\b|Test Suites:|Tests:|Snapshots:|\bat .+:\d+/,
  tsc: /\(\d+,\d+\)|error TS|Found \d+ error/,
  eslint: /^\S+\.[cm]?[jt]sx?$|^\s*\d+:\d+\s+(?:error|warning)\b|problems? \(/,
  ruff: /\w+\.py:\d+:\d+|Found \d+ error|\[\*\]/,
  install: /ERR!|ERROR|error|npm warn|Resolution|Could not|No matching|Failed/i,
  generic: /\S+:\d+(?::\d+)?|Expected:|Received:|Assertion/,
};
export function compactOutput(output: string, tool: NoisyTool = 'generic'): string {
  const clean = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const lines = clean.split(/\r?\n/);
  if (lines.length < 60) return output;
  const keep = new Set<number>();
  const around = (i: number, n: number) => { for (let k = Math.max(0, i - n); k <= Math.min(lines.length - 1, i + n); k++) keep.add(k); };
  lines.forEach((line, i) => {
    if (failurePattern.test(line) || parsers[tool].test(line)) around(i, 3);
  });
  const last = lines.findLastIndex((line) => line.trim().length > 0);
  if (last >= 0) keep.add(last);
  // The safety net is deliberately independent of tool detection.
  lines.forEach((line, i) => { if (failurePattern.test(line)) keep.add(i); });
  return [...keep].sort((a, b) => a - b).map((i) => lines[i]).join('\n');
}
export const shellQuote = (s: string) => `'${s.replace(/'/g, `'"'"'`)}'`;
export function invokingGw(): string {
  const script = process.argv[1];
  if (!script) throw new Error('cannot resolve invoking gw');
  const args = process.execArgv.map((arg, i, all) => all[i - 1] === '--import' && arg === 'tsx' ? import.meta.resolve('tsx') : arg);
  return [process.execPath, ...args, script].map(shellQuote).join(' ');
}
