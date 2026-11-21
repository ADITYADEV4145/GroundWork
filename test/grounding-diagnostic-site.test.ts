import { beforeAll, describe, expect, it } from 'vitest';
import { diagnosticCallSite } from '../src/bench/grounding/diagnostic-site.js';
import { initParsersFor } from '../src/lang/parser.js';

beforeAll(async () => { await initParsersFor(['typescript']); });

describe('compiler diagnostic call ownership', () => {
  it.each([
    ['outer(inner(), true)', 'true', 2554, 'Expected 1 arguments, but got 2.', 'outer'],
    ['outer(inner())', 'inner', 2554, 'Expected 0 arguments, but got 1.', 'outer'],
    ['outer(inner())', 'inner', 2554, 'Expected at least 1 arguments, but got 0.', 'inner'],
    ['outer(inner(true))', 'true', 2554, 'Expected 0 arguments, but got 1.', 'inner'],
    ['outer(inner())', 'inner', 2345, 'Argument type is not assignable', 'outer'],
    ['outer(inner(), { bogus: true })', 'bogus', 2353, 'Unknown property', 'outer'],
    ['outer(unknown())', 'unknown', 2304, "Cannot find name 'unknown'.", 'unknown'],
    ['outer(obj.unknown())', 'unknown', 2339, "Property 'unknown' does not exist", 'obj.unknown'],
    ['const café = "☕"; outer(inner(), true)', 'true', 2554, 'Expected 1 arguments, but got 2.', 'outer'],
  ])('locates %s at %s', (source, token, code, message, callee) => {
    expect(diagnosticCallSite('a.ts', source, 1, source.indexOf(token), code, message))
      .toEqual({ line: 1, column: source.indexOf(callee), name: callee.split('.').at(-1) });
  });
  it('maps a multiline diagnostic to the call start, not the argument line', () => {
    expect(diagnosticCallSite('a.ts', 'outer(\n  inner(),\n  true\n)', 3, 2, 2554, 'Expected 1 arguments, but got 2.'))
      .toEqual({ line: 1, column: 0, name: 'outer' });
  });
  it('does not map non-call diagnostics, empty sources or Python to TS call sites', () => {
    expect(diagnosticCallSite('a.ts', 'const missing = value;', 1, 16, 2304, 'Unknown name')).toBeNull();
    expect(diagnosticCallSite('a.ts', '', 1, 0, 2554, 'Expected 1 arguments, but got 0.')).toBeNull();
    expect(diagnosticCallSite('a.py', 'outer(inner())', 1, 6, 2554, '')).toBeNull();
  });
});
