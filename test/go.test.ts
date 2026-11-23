import { beforeAll, describe, expect, it } from 'vitest';
import { initParsersFor } from '../src/lang/parser.js';
import { goAdapter } from '../src/lang/go.js';

beforeAll(() => initParsersFor(['go']));
const extract = (source: string) => goAdapter.extract(source, 'go');

describe('Go extraction', () => {
  it('extracts methods, parents declared later, parameter groups and variadic arity', () => {
    const source = `package demo
// Add records.
// Returns a count.
func (b *Box[T]) Add(a, z int, rest ...string) (int, error) { return 0, nil }
type Box[T any] struct { Value T }
func (x Elsewhere) hidden() {}
func Empty() {}
`;
    const r = extract(source);
    expect(r.hasErrors).toBe(false);
    expect(r.symbols[0]).toMatchObject({ qualifiedName: 'Box.Add', parent: 1, exported: true,
      minArity: 2, maxArity: null, returnType: '(int, error)', docstring: 'Add records.\nReturns a count.',
      params: [{ name: 'a', type: 'int' }, { name: 'z', type: 'int' }, { name: 'rest', type: 'string', rest: true }] });
    expect(r.symbols[2]).toMatchObject({ qualifiedName: 'Elsewhere.hidden', parent: null, exported: false });
    expect(r.symbols[3]).toMatchObject({ minArity: 0, maxArity: 0 });
  });

  it('extracts aliased imports, calls, literals and package declarations only for vars', () => {
    const r = extract(`package demo
import ( f "fmt"; _ "embed"; . "strings"; "os" )
type Reader interface { Read() string }
type Label = string
const Env = "APP_HOME_KEY"
var URL = "https://example.com"
func Run(args ...string) { var local int; f.Println(args...); _ = local }
`);
    expect(r.hasErrors).toBe(false);
    expect(r.imports.map((i) => [i.module, i.alias])).toEqual([['fmt', 'f'], ['embed', '_'], ['strings', '.'], ['os', null]]);
    expect(r.calls[0]).toMatchObject({ calleeText: 'f.Println', calleeName: 'Println', argCount: 1, hasSpread: true });
    expect(r.symbols.map((s) => [s.name, s.kind])).toEqual([['Reader', 'interface'], ['Label', 'type'], ['Env', 'constant'], ['URL', 'variable'], ['Run', 'function']]);
    expect(r.literals.map((l) => l.kind)).toEqual(['env', 'url']);
  });

  it('uses JS string offsets after non-ASCII text', () => {
    const source = 'package demo\n// 😀 café\nfunc Hello() {}\n';
    const s = extract(source).symbols[0]!;
    expect(source.slice(s.startByte, s.endByte)).toBe('func Hello() {}');
  });

  it('handles empty files and reports syntax errors', () => {
    expect(extract('package demo\n')).toMatchObject({ symbols: [], calls: [], imports: [], literals: [], hasErrors: false });
    expect(extract('package demo\nfunc Broken(').hasErrors).toBe(true);
  });
});
