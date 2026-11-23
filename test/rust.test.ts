import { beforeAll, describe, expect, it } from 'vitest';
import { initParsersFor } from '../src/lang/parser.js';
import { rustAdapter } from '../src/lang/rust.js';

beforeAll(() => initParsersFor(['rust']));
const extract = (source: string) => rustAdapter.extract(source, 'rust');

describe('Rust extraction', () => {
  it('extracts impl and trait methods, visibility, docs, attributes and receivers', () => {
    const r = extract(`impl<T> Box<T> {
/// Run a task.
#[test]
#[doc = "ignored"]
pub(crate) async fn run(&mut self, x: i32) -> i32 { x }
}
pub struct Box<T> { value: T }
pub trait Read { fn read(&self) -> String; }
impl Read for Box<String> { fn read(&self) -> String { String::new() } }
impl Other { fn hidden(self) {} }`);
    expect(r.hasErrors).toBe(false);
    expect(r.symbols[0]).toMatchObject({ qualifiedName: 'Box.run', parent: 1, exported: true, isAsync: true,
      params: [{ name: 'x', type: 'i32' }], minArity: 1, maxArity: 1, returnType: 'i32',
      docstring: 'Run a task.', decorators: ['#[test]'] });
    expect(r.symbols[3]).toMatchObject({ qualifiedName: 'Read.read', parent: 2, minArity: 0, maxArity: 0 });
    expect(r.symbols[4]).toMatchObject({ qualifiedName: 'Box.read', parent: 1, exported: false });
    expect(r.symbols[5]).toMatchObject({ qualifiedName: 'Other.hidden', parent: null });
  });

  it('expands use groups and aliases, skips macros, and extracts calls and declarations', () => {
    const r = extract(`use a::b::{c, d as e, nested::{f}, *};
mod other;
pub enum State { Ready }
type Key = String;
static ENV: &str = "APP_STORE_KEY";
fn run() { foo(); a::b(); x.m(1); println!("{}", hidden()); }`);
    expect(r.hasErrors).toBe(false);
    expect(r.imports.map((i) => [i.module, i.name, i.alias, i.kind])).toEqual([
      ['a::b', 'c', null, 'named'], ['a::b', 'd', 'e', 'named'], ['a::b::nested', 'f', null, 'named'], ['a::b', '*', null, 'namespace'],
    ]);
    expect(r.symbols.map((s) => s.kind)).toEqual(['enum', 'type', 'constant', 'function']);
    expect(r.calls.map((c) => [c.calleeText, c.calleeName])).toEqual([['foo', 'foo'], ['a::b', 'b'], ['x.m', 'm']]);
    expect(r.literals[0]).toMatchObject({ value: 'APP_STORE_KEY', kind: 'env' });
  });

  it('handles empty, invalid and non-ASCII sources', () => {
    expect(extract('').symbols).toEqual([]);
    expect(extract('fn broken(').hasErrors).toBe(true);
    const source = '// 😀\nfn good() {}';
    const s = extract(source).symbols[0]!;
    expect(source.slice(s.startByte, s.endByte)).toBe('fn good() {}');
  });
});
