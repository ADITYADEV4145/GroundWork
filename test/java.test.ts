import { beforeAll, describe, expect, it } from 'vitest';
import { initParsersFor } from '../src/lang/parser.js';
import { javaAdapter } from '../src/lang/java.js';

beforeAll(() => initParsersFor(['java']));
const extract = (source: string) => javaAdapter.extract(source, 'java');

describe('Java extraction', () => {
  it('extracts nested types, constructors, varargs, annotations and Javadoc', () => {
    const r = extract(`/** A box. */
@Deprecated public class Box {
 public Box(int size) {}
 /** Run tasks. */
 @Override public String run(int n, String... args) { return new String(args[0]); }
 class Nested { void hidden() {} }
 public record Entry(String name) { public Entry { check(name); } }
}`);
    expect(r.hasErrors).toBe(false);
    expect(r.symbols[0]).toMatchObject({ name: 'Box', exported: true, docstring: 'A box.', decorators: ['@Deprecated'] });
    expect(r.symbols[1]).toMatchObject({ qualifiedName: 'Box.Box', kind: 'method', parent: 0, minArity: 1 });
    expect(r.symbols[2]).toMatchObject({ qualifiedName: 'Box.run', parent: 0, decorators: ['@Override'],
      params: [{ name: 'n', type: 'int' }, { name: 'args', type: 'String', rest: true }], minArity: 1, maxArity: null, returnType: 'String', docstring: 'Run tasks.' });
    expect(r.symbols[3]).toMatchObject({ qualifiedName: 'Box.Nested', parent: 0, exported: false });
    expect(r.symbols[4]).toMatchObject({ qualifiedName: 'Box.Nested.hidden', parent: 3 });
    expect(r.symbols[6]).toMatchObject({ qualifiedName: 'Box.Entry.Entry', parent: 5, minArity: 1 });
    expect(r.calls[0]).toMatchObject({ calleeName: 'String', isNew: true, argCount: 1, caller: 2 });
  });

  it('extracts ordinary/static/wildcard imports, constants and method calls', () => {
    const r = extract(`import a.b.C;
import static a.b.C.run;
import a.b.*;
import static a.b.C.*;
interface Read { String read(); }
enum State { READY }
class Demo {
 public static final String KEY = "APP_STORE_KEY";
 static int mutable;
 void f() { C.run(1, 2); }
}`);
    expect(r.hasErrors).toBe(false);
    expect(r.imports.map((i) => [i.module, i.name, i.kind])).toEqual([
      ['a.b', 'C', 'named'], ['a.b.C', 'run', 'named'], ['a.b', '*', 'namespace'], ['a.b.C', '*', 'namespace'],
    ]);
    expect(r.symbols.map((s) => s.kind)).toEqual(['interface', 'method', 'enum', 'class', 'constant', 'method']);
    expect(r.calls[0]).toMatchObject({ calleeText: 'C.run', calleeName: 'run', isNew: false, argCount: 2 });
    expect(r.literals[0]).toMatchObject({ kind: 'env', value: 'APP_STORE_KEY' });
  });

  it('handles empty, invalid and non-ASCII sources', () => {
    expect(extract('').symbols).toEqual([]);
    expect(extract('class Broken { void f(').hasErrors).toBe(true);
    const source = '// 😀\nclass Good {}';
    const s = extract(source).symbols[0]!;
    expect(source.slice(s.startByte, s.endByte)).toBe('class Good {}');
  });
});
