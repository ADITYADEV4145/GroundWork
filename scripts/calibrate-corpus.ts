import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Recipe {
  task: string;
  name: string;
  signature: string;
  doc: string;
  base: string;
  edited: string;
  alternate: string;
  negative: string;
  difference: string;
}

const ts: Recipe[] = [
  { task: 'positive-total', name: 'positiveTotal', signature: '(values: number[]): number', doc: 'Sum strictly positive numeric values.',
    base: 'let total = 0; for (const value of values) { if (value > 0) total += value; } return total;',
    edited: 'let total = 0; for (const value of values) { if (value <= 0) continue; total = total + value; } return total;',
    alternate: 'return values.filter(value => value > 0).reduce((total, value) => total + value, 0);',
    negative: 'let total = 0; for (const value of values) { if (value < 0) total += value; } return total;', difference: 'sums negative rather than positive values' },
  { task: 'active-count', name: 'activeCount', signature: '(values: boolean[]): number', doc: 'Count enabled boolean flags.',
    base: 'let total = 0; for (const value of values) { if (value) total += 1; } return total;',
    edited: 'let total = 0; for (const value of values) { if (!value) continue; total++; } return total;',
    alternate: 'return values.filter(Boolean).length;',
    negative: 'let total = 0; for (const value of values) { if (!value) total += 1; } return total;', difference: 'counts disabled rather than enabled flags' },
  { task: 'unique-values', name: 'uniqueValues', signature: '(values: string[]): string[]', doc: 'Remove duplicate strings while retaining first occurrence order.',
    base: 'const result: string[] = []; for (const value of values) { if (!result.includes(value)) result.push(value); } return result;',
    edited: 'const result: string[] = []; for (const value of values) { if (result.indexOf(value) >= 0) continue; result.push(value); } return result;',
    alternate: 'return Array.from(new Set(values));',
    negative: 'const result: string[] = []; for (const value of values) { if (result.includes(value)) result.push(value); } return result;', difference: 'drops every value instead of retaining first occurrences' },
  { task: 'clamp-range', name: 'clampRange', signature: '(value: number, low: number, high: number): number', doc: 'Clamp a finite number inside ordered inclusive bounds.',
    base: 'if (value < low) return low; if (value > high) return high; return value;',
    edited: 'let result = value; if (result < low) result = low; else if (result > high) result = high; return result;',
    alternate: 'return Math.min(high, Math.max(low, value));',
    negative: 'if (value < low) return high; if (value > high) return low; return value;', difference: 'wraps out-of-range values to the opposite bound' },
  { task: 'parse-port', name: 'parsePort', signature: '(value: string): number', doc: 'Parse an integer TCP port between one and 65535.',
    base: 'const port = Number(value); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port"); return port;',
    edited: 'const port = Number(value); const valid = Number.isInteger(port) && port >= 1 && port <= 65535; if (!valid) throw new Error("Invalid port"); return port;',
    alternate: 'const port = +value; if (port % 1 !== 0 || !(port >= 1 && port <= 65535)) throw new Error("Invalid port"); return port;',
    negative: 'const port = Number(value); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port"); return port;', difference: 'rejects privileged ports which the original accepts' },
  { task: 'slug-text', name: 'slugText', signature: '(value: string): string', doc: 'Trim lowercase text and replace whitespace runs with a dash.',
    base: 'const text = value.trim().toLowerCase(); return text.replace(/\\s+/g, "-");',
    edited: 'const text = value.toLowerCase(); const trimmed = text.trim(); return trimmed.replace(/\\s+/g, "-");',
    alternate: 'return value.trim().toLowerCase().split(/\\s+/).join("-");',
    negative: 'const text = value.trim().toUpperCase(); return text.replace(/\\s+/g, "_");', difference: 'creates uppercase underscore identifiers rather than lowercase dash slugs' },
  { task: 'mean-value', name: 'meanValue', signature: '(values: number[]): number', doc: 'Compute arithmetic mean, returning zero for an empty list.',
    base: 'if (!values.length) return 0; let total = 0; for (const value of values) total += value; return total / values.length;',
    edited: 'let total = 0; for (const value of values) total += value; const count = values.length; return count === 0 ? 0 : total / count;',
    alternate: 'return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;',
    negative: 'if (!values.length) return 0; let total = 0; for (const value of values) total += value; return total;', difference: 'returns sum rather than mean' },
  { task: 'compact-values', name: 'compactValues', signature: '(values: (string | null)[]): string[]', doc: 'Remove null entries but retain empty strings.',
    base: 'const result: string[] = []; for (const value of values) { if (value !== null) result.push(value); } return result;',
    edited: 'const result: string[] = []; for (const value of values) { if (value === null) continue; result.push(value); } return result;',
    alternate: 'return values.filter((value): value is string => value !== null);',
    negative: 'const result: string[] = []; for (const value of values) { if (value) result.push(value); } return result;', difference: 'also removes valid empty strings' },
  { task: 'word-counts', name: 'wordCounts', signature: '(values: string[]): Record<string, number>', doc: 'Count occurrences of each string using a dictionary.',
    base: 'const result: Record<string, number> = Object.create(null); for (const value of values) result[value] = (result[value] ?? 0) + 1; return result;',
    edited: 'const result: Record<string, number> = Object.create(null); for (const value of values) { if (result[value] === undefined) result[value] = 0; result[value]++; } return result;',
    alternate: 'return values.reduce((result, value) => { result[value] = (result[value] ?? 0) + 1; return result; }, Object.create(null));',
    negative: 'const result: Record<string, number> = Object.create(null); for (const value of values) result[value] = (result[value] ?? 0) + value.length; return result;', difference: 'accumulates character lengths rather than occurrence counts' },
  { task: 'chunk-list', name: 'chunkList', signature: '(values: number[], size: number): number[][]', doc: 'Split a list into consecutive chunks for a positive integer size.',
    base: 'const result: number[][] = []; for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size)); return result;',
    edited: 'const result: number[][] = []; let index = 0; while (index < values.length) { result.push(values.slice(index, index + size)); index += size; } return result;',
    alternate: 'return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));',
    negative: 'const result: number[][] = []; for (let index = 0; index < values.length; index += 1) result.push(values.slice(index, index + size)); return result;', difference: 'produces sliding windows instead of disjoint chunks' },
  { task: 'factorial-value', name: 'factorialValue', signature: '(value: number): number', doc: 'Compute factorial of a nonnegative integer.',
    base: 'let result = 1; for (let index = 2; index <= value; index++) result *= index; return result;',
    edited: 'let result = 1; let index = value; while (index > 1) { result *= index; index--; } return result;',
    alternate: 'return value <= 1 ? 1 : value * factorialValue(value - 1);',
    negative: 'let result = 1; for (let index = 2; index <= value; index++) result += index; return result;', difference: 'adds integers rather than multiplying them' },
  { task: 'equal-folded', name: 'equalFolded', signature: '(left: string, right: string): boolean', doc: 'Compare ASCII strings ignoring letter case but not whitespace.',
    base: 'const first = left.toLowerCase(); const second = right.toLowerCase(); return first === second;',
    edited: 'const first = left.toUpperCase(); const second = right.toUpperCase(); return first === second;',
    alternate: 'if (left.length !== right.length) return false; for (let index = 0; index < left.length; index++) { if (left[index]!.toLowerCase() !== right[index]!.toLowerCase()) return false; } return true;',
    negative: 'const first = left.trim().toLowerCase(); const second = right.trim().toLowerCase(); return first === second;', difference: 'ignores whitespace as well as case' },
];

const pyBodies: [string, string, string, string][] = [
  ['total = 0\nfor value in values:\n    if value > 0:\n        total += value\nreturn total', 'total = 0\nfor value in values:\n    if value <= 0:\n        continue\n    total = total + value\nreturn total', 'return sum(value for value in values if value > 0)', 'total = 0\nfor value in values:\n    if value < 0:\n        total += value\nreturn total'],
  ['total = 0\nfor value in values:\n    if value:\n        total += 1\nreturn total', 'total = 0\nfor value in values:\n    if not value:\n        continue\n    total += 1\nreturn total', 'return sum(map(bool, values))', 'total = 0\nfor value in values:\n    if not value:\n        total += 1\nreturn total'],
  ['result = []\nfor value in values:\n    if value not in result:\n        result.append(value)\nreturn result', 'result = []\nfor value in values:\n    if value in result:\n        continue\n    result.append(value)\nreturn result', 'return list(dict.fromkeys(values))', 'result = []\nfor value in values:\n    if value in result:\n        result.append(value)\nreturn result'],
  ['if value < low:\n    return low\nif value > high:\n    return high\nreturn value', 'result = value\nif result < low:\n    result = low\nelif result > high:\n    result = high\nreturn result', 'return min(high, max(low, value))', 'if value < low:\n    return high\nif value > high:\n    return low\nreturn value'],
  ['port = float(value)\nif not port.is_integer() or port < 1 or port > 65535:\n    raise ValueError("Invalid port")\nreturn int(port)', 'port = float(value)\nvalid = port.is_integer() and 1 <= port <= 65535\nif not valid:\n    raise ValueError("Invalid port")\nreturn int(port)', 'port = float(value)\nif port % 1 != 0 or not (1 <= port <= 65535):\n    raise ValueError("Invalid port")\nreturn int(port)', 'port = float(value)\nif not port.is_integer() or port < 1024 or port > 65535:\n    raise ValueError("Invalid port")\nreturn int(port)'],
  ['text = value.strip().lower()\nreturn "-".join(text.split())', 'text = value.lower()\ntrimmed = text.strip()\nreturn "-".join(trimmed.split())', 'import re\nreturn re.sub(r"\\s+", "-", value.strip().lower()) if value.strip() else ""', 'text = value.strip().upper()\nreturn "_".join(text.split())'],
  ['if not values:\n    return 0\ntotal = 0\nfor value in values:\n    total += value\nreturn total / len(values)', 'total = 0\nfor value in values:\n    total += value\ncount = len(values)\nreturn total / count if count else 0', 'return sum(values) / len(values) if values else 0', 'if not values:\n    return 0\ntotal = 0\nfor value in values:\n    total += value\nreturn total'],
  ['result = []\nfor value in values:\n    if value is not None:\n        result.append(value)\nreturn result', 'result = []\nfor value in values:\n    if value is None:\n        continue\n    result.append(value)\nreturn result', 'return [value for value in values if value is not None]', 'result = []\nfor value in values:\n    if value:\n        result.append(value)\nreturn result'],
  ['result = {}\nfor value in values:\n    result[value] = result.get(value, 0) + 1\nreturn result', 'result = {}\nfor value in values:\n    if value not in result:\n        result[value] = 0\n    result[value] += 1\nreturn result', 'from collections import Counter\nreturn dict(Counter(values))', 'result = {}\nfor value in values:\n    result[value] = result.get(value, 0) + len(value)\nreturn result'],
  ['result = []\nfor index in range(0, len(values), size):\n    result.append(values[index:index + size])\nreturn result', 'result = []\nindex = 0\nwhile index < len(values):\n    result.append(values[index:index + size])\n    index += size\nreturn result', 'return [values[index:index + size] for index in range(0, len(values), size)]', 'result = []\nfor index in range(0, len(values), 1):\n    result.append(values[index:index + size])\nreturn result'],
  ['result = 1\nfor index in range(2, value + 1):\n    result *= index\nreturn result', 'result = 1\nindex = value\nwhile index > 1:\n    result *= index\n    index -= 1\nreturn result', 'return 1 if value <= 1 else value * factorial_value(value - 1)', 'result = 1\nfor index in range(2, value + 1):\n    result += index\nreturn result'],
  ['first = left.lower()\nsecond = right.lower()\nreturn first == second', 'first = left.upper()\nsecond = right.upper()\nreturn first == second', 'return len(left) == len(right) and all(a.lower() == b.lower() for a, b in zip(left, right))', 'first = left.strip().lower()\nsecond = right.strip().lower()\nreturn first == second'],
];

const pySignatures = ['values: list[float]', 'values: list[bool]', 'values: list[str]', 'value: float, low: float, high: float', 'value: str', 'value: str', 'values: list[float]', 'values: list[str | None]', 'values: list[str]', 'values: list[int], size: int', 'value: int', 'left: str, right: str'];

export function generateCorpus(root = fileURLToPath(new URL('../', import.meta.url))): number {
  const pairs: object[] = [];
  for (const [i, recipe] of ts.entries()) for (const language of ['ts', 'py'] as const) {
    const group = `${recipe.task}/${language}`;
    const dir = path.join(root, 'bench/dupes/corpus', group);
    mkdirSync(dir, { recursive: true });
    const name = language === 'ts' ? recipe.name : recipe.name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    const bodies = language === 'ts' ? [recipe.base, recipe.edited, recipe.alternate, recipe.negative] : pyBodies[i]!;
    const variants = ['base', 'format', 'renamed', 'edited', 'alternate', 'changed', 'overload'] as const;
    const refs = variants.map((variant) => {
      let body = bodies[variant === 'edited' ? 1 : variant === 'alternate' ? 2 : variant === 'changed' ? 3 : 0]!;
      let symbol = name;
      let doc = recipe.doc;
      let signature = language === 'ts' ? recipe.signature : `(${pySignatures[i]})`;
      if (variant === 'renamed') {
        symbol = language === 'ts' ? `calculate${i}` : `calculate_${i}`;
        const renames: Record<string, string> = { [name]: symbol, values: 'items', value: 'entry', total: 'accumulator', result: 'output', index: 'cursor', left: 'alpha', right: 'beta', low: 'minimum', high: 'maximum' };
        const rename = (s: string) => s.replace(/\b\w+\b/g, (w) => renames[w] ?? w);
        body = rename(body); signature = rename(signature);
      }
      if (variant === 'changed') doc = `${recipe.doc} Policy variant: ${recipe.difference}.`;
      if (variant === 'overload') {
        doc = 'Normalize a textual identifier by removing surrounding spaces and folding case; not numeric or collection processing.';
        signature = language === 'ts' ? '(value: string): string' : '(value: str) -> str';
        body = language === 'ts' ? 'const result = value.trim(); if (!result) return ""; return result.toLowerCase();' : 'result = value.strip()\nif not result:\n    return ""\nreturn result.lower()';
      }
      const source = language === 'ts' ? `/** ${doc} */\nexport function ${symbol}${signature} {\n  ${body}\n}\n`
        : `def ${symbol}${signature}:\n    """${doc}"""\n${body.split('\n').map((line) => `    ${line}`).join('\n')}\n`;
      const formatted = variant === 'format' ? (language === 'ts' ? source.replace(/; /g, ';\n  ') : `# Formatting-only copy\n\n${source}`) : source;
      const file = `corpus/${group}/${variant}.${language}`;
      writeFileSync(path.join(root, 'bench/dupes', file), formatted);
      return { file, symbol };
    });
    for (let a = 0; a < variants.length; a++) for (let b = a + 1; b < variants.length; b++) {
      const dup = b < 5;
      const cloneType = !dup ? null : b === 4 ? 4 : b === 3 ? 3 : b === 2 ? 2 : 1;
      const negativeKind = b === 6 ? 'overloads' : a === 2 ? 'similar-structure-different-purpose' : 'same-name-different-behavior';
      pairs.push({ id: `${recipe.task}-${language}-${variants[a]}-${variants[b]}`, a: refs[a], b: refs[b], label: dup ? 'dup' : 'not', cloneType,
        ...(!dup ? { negativeKind } : {}),
        reasoning: dup ? `${recipe.doc} ${cloneType === 1 ? 'Only formatting differs.' : cloneType === 2 ? 'Identifiers are consistently renamed.' : cloneType === 3 ? 'Equivalent control-flow refactor preserves the stated domain.' : 'Different implementation computes the same result on the stated domain.'}`
          : b === 6 ? `Same-name textual overload normalizes identifiers, whereas the other symbol ${a === 5 ? recipe.difference : recipe.doc.toLowerCase()}` : `Not interchangeable: the changed policy ${recipe.difference}.` });
    }
  }
  const oss = path.join(root, 'bench/dupes/oss-pairs.jsonl');
  if (existsSync(oss)) pairs.push(...readFileSync(oss, 'utf8').trim().split('\n').map((line) => JSON.parse(line)));
  writeFileSync(path.join(root, 'bench/dupes/labeled.jsonl'), pairs.map((p) => JSON.stringify(p)).join('\n') + '\n');
  return pairs.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`Generated ${generateCorpus()} labeled pairs.`);
