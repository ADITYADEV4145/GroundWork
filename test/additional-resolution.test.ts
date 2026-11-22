import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdditionalResolver, type AdditionalImport, type AdditionalSymbol } from '../src/resolve/additional.js';
import type { FileInfo } from '../src/resolve/imports.js';

const im = (module: string, name: string, alias: string | null = null, kind = 'named'): AdditionalImport => ({ module, name, alias, kind });
const file = (id: number, path: string, language: string): FileInfo => ({ id, path, language });
const symbol = (id: string, fileId: number, name: string, parentId: string | null = null): AdditionalSymbol => ({ id, fileId, name, qualifiedName: name, kind: parentId ? 'method' : 'function', parentId });

describe('additional language resolution', () => {
  it('does not use sibling methods for chained receivers', () => {
    const from = file(1, 'App.java', 'java');
    const resolver = new AdditionalResolver('/missing', [from]);
    const syms = [symbol('caller', 1, 'Call', 'app'), symbol('run', 1, 'Run', 'app')];
    expect(resolver.resolveCall(from, 'caller', 'this.worker.Run', 'Run', [], syms)).toBeNull();
    expect(resolver.resolveCall(from, 'caller', 'this.Run', 'Run', [], syms)).toEqual({ id: 'run', conf: 'exact' });
  });
  it('does not resolve external Go imports to local suffixes', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gw-module-'));
    const from = file(1, 'main.go', 'go');
    const files = [from, file(2, 'store/store.go', 'go')];
    try {
      writeFileSync(path.join(root, 'go.mod'), 'module example.org/app\n');
      expect(new AdditionalResolver(root, files).targets(from, im('example.org/library/store', 'store'))).toEqual([]);
      expect(new AdditionalResolver(root, files).targets(from, im('example.org/app/store', 'store'))).toHaveLength(1);
      rmSync(path.join(root, 'go.mod'));
      for (const spec of ['example.org/library/store', 'net/store', 'store'])
        expect(new AdditionalResolver(root, files).targets(from, im(spec, 'store'))).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('resolves Go packages across multiple files and rejects external or ambiguous package paths', () => {
    const from = file(1, 'main.go', 'go');
    const files = [from, file(2, 'store/types.go', 'go'), file(3, 'store/format.go', 'go')];
    const resolver = new AdditionalResolver('/missing', files);
    const imported = im('./store', 'store', 'storage', 'module');
    expect(resolver.resolveImport(from, imported).fileId).not.toBeNull();
    expect(resolver.resolveCall(from, null, 'storage.Format', 'Format', [imported], [symbol('format', 3, 'Format')])).toEqual({ id: 'format', conf: 'import-resolved' });
    expect(resolver.resolveCall(from, null, 'other.Format', 'Format', [], [symbol('format', 3, 'Format')])).toBeNull();
    const ambiguous = new AdditionalResolver('/missing', [...files, file(4, 'app/store/other.go', 'go')]);
    expect(ambiguous.resolveImport(from, imported).fileId).not.toBeNull();
    expect(ambiguous.resolveCall(from, null, 'storage.Format', 'Format', [imported], [symbol('format', 3, 'Format')])?.id).toBe('format');
  });

  it('resolves Java class/static imports and refuses ambiguous suffixes', () => {
    const from = file(1, 'src/demo/App.java', 'java');
    const target = file(2, 'src/demo/Store.java', 'java');
    const resolver = new AdditionalResolver('/missing', [from, target]);
    const syms = [symbol('normalize', 2, 'normalize', 'store')];
    expect(resolver.resolveCall(from, null, 'Store.normalize', 'normalize', [im('demo', 'Store')], syms)?.id).toBe('normalize');
    expect(resolver.resolveCall(from, null, 'normalize', 'normalize', [im('demo.Store', 'normalize')], syms)?.id).toBe('normalize');
    expect(new AdditionalResolver('/missing', [from, target, file(3, 'other/demo/Store.java', 'java')]).resolveImport(from, im('demo', 'Store')).fileId).toBeNull();
    expect(resolver.resolveCall(from, null, 'Missing.normalize', 'normalize', [im('external', 'Missing')], syms)).toBeNull();
  });

  it('resolves Rust crate/self/super paths and rejects competing module layouts', () => {
    const from = file(1, 'src/nested/mod.rs', 'rust');
    const files = [from, file(2, 'src/helpers.rs', 'rust'), file(3, 'src/nested/local.rs', 'rust')];
    const resolver = new AdditionalResolver('/missing', files);
    const syms = [symbol('helper', 2, 'clean'), symbol('local', 3, 'run')];
    for (const prefix of ['crate', 'super']) expect(resolver.resolveCall(from, null, prefix + '::helpers::clean', 'clean', [], syms)?.id).toBe('helper');
    expect(resolver.resolveCall(from, null, 'self::local::run', 'run', [], syms)?.id).toBe('local');
    expect(resolver.resolveCall(from, null, 'alias', 'alias', [im('crate::helpers', 'clean', 'alias')], syms)?.id).toBe('helper');
    const ambiguous = new AdditionalResolver('/missing', [...files, file(4, 'src/helpers/mod.rs', 'rust')]);
    expect(ambiguous.resolveCall(from, null, 'crate::helpers::clean', 'clean', [], syms)).toBeNull();
  });

  it('distinguishes Ruby require_relative from require and avoids ambiguous suffixes', () => {
    const from = file(1, 'app/run.rb', 'ruby');
    const files = [from, file(2, 'app/helpers.rb', 'ruby'), file(3, 'lib/helpers.rb', 'ruby')];
    const resolver = new AdditionalResolver('/missing', files);
    expect(resolver.resolveImport(from, im('helpers', 'helpers', null, 'side-effect')).fileId).toBe(2);
    expect(resolver.resolveImport(from, im('helpers', 'helpers', null, 'module')).fileId).toBe(3);
    const ambiguous = new AdditionalResolver('/missing', [from, file(4, 'a/utils.rb', 'ruby'), file(5, 'b/utils.rb', 'ruby')]);
    expect(ambiguous.resolveImport(from, im('utils', 'utils')).fileId).toBeNull();
    expect(resolver.resolveImport(from, im('missing', 'missing')).fileId).toBeNull();
  });

  it.each(['go', 'rust', 'java', 'csharp', 'ruby'])('prefers same-directory %s definitions, rejects ambiguity and excludes other languages', (language) => {
    const from = file(1, 'pkg/caller', language);
    const files = [from, file(2, 'pkg/helper', language), file(3, 'else/helper', language), file(4, 'pkg/other', 'python')];
    const resolver = new AdditionalResolver('/missing', files);
    const syms = [symbol('local', 2, 'work'), symbol('remote', 3, 'work'), symbol('python', 4, 'work')];
    expect(resolver.resolveCall(from, null, 'work', 'work', [], syms)?.id).toBe('local');
    expect(resolver.resolveCall(from, null, 'work', 'work', [], [...syms, symbol('duplicate', 2, 'work')])).toBeNull();
    expect(resolver.resolveCall(from, null, 'absent', 'absent', [], syms)).toBeNull();
    expect(resolver.resolveCall(from, null, 'work', 'work', [], syms.slice(1))?.id).toBe('remote');
    expect(resolver.resolveCall(from, null, 'work', 'work', [], [])).toBeNull();
  });
});
