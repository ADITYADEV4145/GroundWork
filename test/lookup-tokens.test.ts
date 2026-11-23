import { describe, expect, it } from 'vitest';
import { countTokens, grepTopN, groundworkLookup, isSupportPath, loadManifest, mean, reduction } from '../bench/lookup-tokens/run.js';

describe('tokens-per-lookup benchmark', () => {
  it('pins three repositories and five queries', () => {
    const m = loadManifest();
    expect(m.repos.map((r) => r.id)).toEqual(['expressjs/express', 'fastapi/fastapi', 'gin-gonic/gin']);
    expect(m.queries).toHaveLength(5);
  });

  it('counts cl100k_base tokens', () => {
    expect(countTokens('hello world')).toBe(2);
  });

  it('grep baseline lists every matching path and reads the most-matching files whole', () => {
    const files = [
      { path: 'a.js', text: 'route\nRoute\nnothing\n' },
      { path: 'b.js', text: 'a handler and a route on one line\n' },
      { path: 'c.js', text: 'unrelated\n' },
      { path: 'd.js', text: 'ROUTE\nhandler\n' },
    ];
    const g = grepTopN(files, 'route handler', 2);
    expect(g.filesMatched).toBe(3);
    expect(g.filesRead).toEqual(['a.js', 'd.js']);
    expect(g.listTokens).toBe(countTokens('a.js\nd.js\nb.js\n'));
    expect(g.readTokens).toBe(countTokens(files[0]!.text) + countTokens(files[3]!.text));
    expect(g.tokens).toBe(g.listTokens + g.readTokens);
  });

  it('follows read_symbol paging and counts every page', async () => {
    const calls: string[] = [];
    const pages: Record<string, string[]> = {
      aa: ['[aa] one (function) — lib/x.js:1 (definition lines 1-40; source offset 0)\nbody\n… 9 more characters. Next: read_symbol({"symbol":"aa","offset":5})', '[aa] one (function) — lib/x.js:1 (definition lines 1-40; source offset 5)\nrest'],
      bb: ['[bb] two (function) — test/x.js:3 (definition lines 3-4; source offset 0)\nb'],
    };
    const call = async (tool: string, args: Record<string, unknown>) => {
      calls.push(`${tool}:${JSON.stringify(args)}`);
      if (tool === 'search_code') return '[aa] one (function) lib/x.js:1 — · lexical: name\n[bb] two (function) test/x.js:3 — · lexical: name\n[cc] three (function) lib/y.js:1 — · lexical: name';
      return pages[String(args.symbol)]![args.offset ? 1 : 0]!;
    };
    const r = await groundworkLookup(call, 'q', 5, 2);
    expect(r.toolCalls).toBe(4);
    expect(calls).toHaveLength(4);
    expect(r.symbols.map((s) => [s.id, s.pages, s.complete, s.file, s.lines])).toEqual([['aa', 2, true, 'lib/x.js', 40], ['bb', 1, true, 'test/x.js', 2]]);
    expect(r.fetchTokens).toBe(pages.aa!.concat(pages.bb!).reduce((n, t) => n + countTokens(t), 0));
    expect(r.firstPageOnlyTokens).toBeLessThan(r.tokens);
  });

  it('marks unavailable source as incomplete and no hits as zero symbols', async () => {
    const r = await groundworkLookup(async (tool) => tool === 'search_code' ? '[aa] one (function) x.js:1 — · lexical: name' : 'Source is unavailable or changed after indexing. Retry read_symbol or use a ranged Read.', 'q', 5, 3);
    expect(r.symbols[0]!.complete).toBe(false);
    const none = await groundworkLookup(async () => 'No matches.', 'q', 5, 3);
    expect(none.hits).toBe(0);
    expect(none.toolCalls).toBe(1);
  });

  it('classifies support paths and computes reductions', () => {
    expect(['tests/test_a.py', 'docs_src/x/t.py', 'gin_test.go', 'examples/a/index.js', 'src/a.test.ts'].every(isSupportPath)).toBe(true);
    expect(['lib/router/index.js', 'fastapi/routing.py', 'context.go', 'latest/contest.go'].some(isSupportPath)).toBe(false);
    expect(reduction(25, 100)).toBe(0.75);
    expect(mean([0.5, 1])).toBe(0.75);
  });
});
