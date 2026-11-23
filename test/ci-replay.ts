// Synthetic replay corpus for the phase 6 gate: one small repository and 20 scripted pull requests against it,
// each with the findings a reviewer would expect. These are hand-written, not real agent-written pull requests.

const chunk = (name: string) => `export function ${name}(items: number[], size: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < items.length; i += size) {
    const part = items.slice(i, i + size);
    if (part.length > 0) out.push(part);
  }
  return out;
}
`;

export const replayRepo: Record<string, string> = {
  '.gitignore': '.groundwork/\n',
  'lists.ts': chunk('chunk') + `
export function total(a: number, b: number): number { return a + b; }
export function clamp(value: number, low: number, high: number): number { return Math.min(high, Math.max(low, value)); }
export const DEFAULT_TIMEOUT_MS = 45000;
`,
  'text.ts': `export function slugify(input: string): string {
  const lower = input.trim().toLowerCase();
  const dashed = lower.replace(/[^a-z0-9]+/g, '-');
  const trimmed = dashed.replace(/^-+|-+$/g, '');
  return trimmed.length > 0 ? trimmed : 'untitled';
}
export function shout(input: string): string { return input.toUpperCase() + '!'; }
`,
  'app.ts': `import { chunk, total } from "./lists.js";
import { slugify } from "./text.js";
export const pages = chunk([1, 2, 3], 2);
export const sum = total(1, 2);
export const slug = slugify("Hello World");
`,
};

export interface ReplayPr { name: string; files: Record<string, string>; expect: string[] }
const use = (body: string) => ({ 'feature.ts': body });

export const REPLAY_PRS: ReplayPr[] = [
  { name: 'imports a helper that does not exist', files: use('import { average } from "./lists.js";\nexport const a = average;\n'), expect: ['invented-call feature.ts:1'] },
  { name: 'imports a near-miss name', files: use('import { slugifyTitle } from "./text.js";\nexport const s = slugifyTitle;\n'), expect: ['invented-call feature.ts:1'] },
  { name: 'calls a method the module does not export', files: use('import * as lists from "./lists.js";\nexport const m = lists.median([1, 2]);\n'), expect: ['invented-call feature.ts:2'] },
  { name: 'imports two invented names', files: use('import { total } from "./lists.js";\nimport { titleCase } from "./text.js";\nimport { sumAll } from "./lists.js";\nexport const t = [total(1, 2), titleCase, sumAll];\n'), expect: ['invented-call feature.ts:2', 'invented-call feature.ts:3'] },
  { name: 'too few arguments', files: use('import { total } from "./lists.js";\nexport const t = total(1);\n'), expect: ['wrong-arguments feature.ts:2'] },
  { name: 'too many arguments', files: use('import { shout } from "./text.js";\nexport const t = shout("a", "b");\n'), expect: ['wrong-arguments feature.ts:2'] },
  { name: 'drops a required argument of three', files: use('import { clamp } from "./lists.js";\nexport const c = clamp(5, 0);\n'), expect: ['wrong-arguments feature.ts:2'] },
  { name: 'invented import and wrong arity together', files: use('import { total, mean } from "./lists.js";\nexport const t = total(1, 2, 3);\nexport const m = mean;\n'), expect: ['invented-call feature.ts:1', 'wrong-arguments feature.ts:2'] },
  { name: 'reimplements chunk under a new name', files: use(chunk('splitEvery')), expect: ['duplicate-logic feature.ts:1'] },
  { name: 'reimplements slugify under a new name', files: use(replayRepo['text.ts']!.split('\n').slice(0, 6).join('\n').replace('slugify', 'toSlug') + '\n'), expect: ['duplicate-logic feature.ts:1'] },
  { name: 'redefines an existing constant', files: use('export const DEFAULT_TIMEOUT_MS = 45000;\n'), expect: ['duplicate-constant feature.ts:1'] },
  { name: 'duplicate plus an invented call', files: use(chunk('batch') + 'import { range } from "./lists.js";\nexport const r = range;\n'), expect: ['duplicate-logic feature.ts:1', 'invented-call feature.ts:9'] },
  { name: 'clean: uses existing helpers correctly', files: use('import { chunk, total, clamp } from "./lists.js";\nexport const v = [chunk([1], 1).length, total(1, 2), clamp(1, 0, 2)];\n'), expect: [] },
  { name: 'clean: new helper with new logic', files: use('export function mean(values: number[]): number {\n  if (values.length === 0) return 0;\n  let sum = 0;\n  for (const v of values) sum += v;\n  return sum / values.length;\n}\n'), expect: [] },
  { name: 'clean: documentation only', files: { 'README.md': '# Notes\n\nNothing to check here.\n' }, expect: [] },
  { name: 'clean: edits an existing call site', files: { 'app.ts': replayRepo['app.ts']!.replace('total(1, 2)', 'total(3, 4)') }, expect: [] },
  { name: 'clean: adds a parameter and updates the caller', files: { 'text.ts': replayRepo['text.ts']!.replace('shout(input: string)', 'shout(input: string, mark = "!")').replace("+ '!'", '+ mark'), 'feature.ts': 'import { shout } from "./text.js";\nexport const s = shout("a", "?");\n' }, expect: [] },
  { name: 'clean: new constant with a new value', files: use('export const RETRY_LIMIT = 7;\nexport const BACKOFF_MS = 1250;\n'), expect: [] },
  { name: 'clean: namespace import of real members', files: use('import * as text from "./text.js";\nexport const s = text.slugify(text.shout("a"));\n'), expect: [] },
  { name: 'clean: configuration file only', files: { 'settings.json': '{ "retries": 3 }\n' }, expect: [] },
];
