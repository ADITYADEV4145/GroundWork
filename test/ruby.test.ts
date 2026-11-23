import { beforeAll, describe, expect, it } from 'vitest';
import { initParsersFor } from '../src/lang/parser.js';
import { rubyAdapter } from '../src/lang/ruby.js';

beforeAll(() => initParsersFor(['ruby']));
const extract = (s: string) => rubyAdapter.extract(s, 'ruby');

describe('Ruby extraction', () => {
  it('extracts owners, singleton methods, parameter kinds and private visibility', () => {
    const r = extract(`# A box.
class Box
 # Run tasks.
 def run(a, b=1, *rest, k:, opt: 2, **opts, &block); a; end
 def self.build; new; end
 private
 def hidden; 1; end
 public
 def shown; 2; end
 private :shown
end
module Helpers
 def clean(x); x.strip; end
end
def top(a); a; end`);
    expect(r.hasErrors).toBe(false);
    expect(r.symbols[0]).toMatchObject({ kind: 'class', docstring: 'A box.' });
    expect(r.symbols[1]).toMatchObject({ qualifiedName: 'Box.run', parent: 0, docstring: 'Run tasks.', minArity: 1, maxArity: null,
      params: [{ name: 'a' }, { name: 'b', optional: true, default: '1' }, { name: 'rest', rest: true },
        { name: 'k', keywordOnly: true }, { name: 'opt', keywordOnly: true, optional: true, default: '2' }, { name: 'opts', kwrest: true }] });
    expect(r.symbols[2]).toMatchObject({ qualifiedName: 'Box.build', kind: 'method' });
    expect(r.symbols[3]).toMatchObject({ exported: false });
    expect(r.symbols[4]).toMatchObject({ exported: false });
    expect(r.symbols[6]).toMatchObject({ qualifiedName: 'Helpers.clean', exported: true });
    expect(r.symbols[7]).toMatchObject({ qualifiedName: 'top', kind: 'function', minArity: 1, maxArity: 1 });
  });

  it('extracts imports, constants and calls without guessing bare identifiers', () => {
    const r = extract(`require 'json'
require_relative 'helpers'
KEY = 'APP_STORE_KEY'
def run(args)
  ambiguous
  puts args
  x.work(*args, key: 1)
  Foo.new(args)
end`);
    expect(r.hasErrors).toBe(false);
    expect(r.imports.map((i) => i.module)).toEqual(['json', 'helpers']);
    expect(r.symbols[0]).toMatchObject({ name: 'KEY', kind: 'constant' });
    expect(r.calls.map((c) => c.calleeText)).toEqual(['require', 'require_relative', 'puts', 'x.work', 'Foo.new']);
    expect(r.calls[3]).toMatchObject({ hasSpread: true, keywordArgs: ['key'], argCount: 1 });
    expect(r.calls[4]).toMatchObject({ isNew: true });
    expect(r.literals[0]).toMatchObject({ kind: 'env', value: 'APP_STORE_KEY' });
  });

  it('handles empty, invalid and non-ASCII source', () => {
    expect(extract('').symbols).toEqual([]);
    expect(extract('def broken(').hasErrors).toBe(true);
    const source = '# 😀\ndef good; 1; end';
    const s = extract(source).symbols[0]!;
    expect(source.slice(s.startByte, s.endByte)).toBe('def good; 1; end');
  });
});
