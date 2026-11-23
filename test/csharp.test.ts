import { beforeAll, describe, expect, it } from 'vitest';
import { initParsersFor } from '../src/lang/parser.js';
import { csharpAdapter } from '../src/lang/csharp.js';

beforeAll(() => initParsersFor(['csharp']));
const extract = (s: string) => csharpAdapter.extract(s, 'csharp');

describe('C# extraction', () => {
  it('extracts nested types, methods, constructors, local functions and typed optional/rest parameters', () => {
    const r = extract(`namespace Demo {
/// <summary>Run <c>tasks</c>.</summary>
[Obsolete] public class Box {
 public Box(int n = 1) {}
 public async Task<int> Run(this string x, int n = 2, params string[] args) {
   int Local(int a) { return a; }
   return Local(n);
 }
 public record Entry(string Name);
 internal struct Key {}
 interface Reader { string Read(); }
 enum State { Ready }
} }`);
    expect(r.hasErrors).toBe(false);
    expect(r.symbols[0]).toMatchObject({ name: 'Box', exported: true, docstring: 'Run tasks.', decorators: ['[Obsolete]'] });
    expect(r.symbols[1]).toMatchObject({ qualifiedName: 'Box.Box', parent: 0, minArity: 0, maxArity: 1, params: [{ name: 'n', type: 'int', default: '1', optional: true }] });
    expect(r.symbols[2]).toMatchObject({ qualifiedName: 'Box.Run', parent: 0, isAsync: true, minArity: 1, maxArity: null, returnType: 'Task<int>',
      params: [{ name: 'x', type: 'string' }, { name: 'n', type: 'int', optional: true, default: '2' }, { name: 'args', type: 'string[]', rest: true }] });
    expect(r.symbols[3]).toMatchObject({ qualifiedName: 'Box.Run.Local', kind: 'function', parent: 2 });
    expect(r.symbols[4]).toMatchObject({ qualifiedName: 'Box.Entry', kind: 'class', parent: 0 });
    expect(r.symbols[5]).toMatchObject({ kind: 'class', exported: false });
    expect(r.symbols[6]).toMatchObject({ kind: 'interface' });
    expect(r.symbols[8]).toMatchObject({ kind: 'enum' });
  });

  it('extracts usings, constants, invocations and object creation', () => {
    const r = extract(`using System.Text;
using A = X.Y;
using static System.Math;
class Demo {
 public const string Key = "APP_STORE_KEY";
 static readonly int Count = 2;
 static int mutable;
 void Run() { A.Call(1); var x = new Demo(); }
}`);
    expect(r.hasErrors).toBe(false);
    expect(r.imports.map((i) => [i.module, i.alias])).toEqual([['System.Text', null], ['X.Y', 'A'], ['System.Math', null]]);
    expect(r.symbols.map((s) => s.kind)).toEqual(['class', 'constant', 'constant', 'method']);
    expect(r.calls).toMatchObject([{ calleeText: 'A.Call', calleeName: 'Call', argCount: 1, isNew: false }, { calleeName: 'Demo', argCount: 0, isNew: true }]);
    expect(r.literals[0]).toMatchObject({ value: 'APP_STORE_KEY', kind: 'env' });
  });

  it('handles empty, invalid and non-ASCII source', () => {
    expect(extract('').symbols).toEqual([]);
    expect(extract('class Broken { void F(').hasErrors).toBe(true);
    const source = '// 😀\nclass Good {}';
    const s = extract(source).symbols[0]!;
    expect(source.slice(s.startByte, s.endByte)).toBe('class Good {}');
  });
});
