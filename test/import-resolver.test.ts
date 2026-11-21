import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportResolver, type FileInfo } from '../src/resolve/imports.js';

const roots: string[] = [];
const root = () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'gw-import-resolver-')); roots.push(dir); return dir; };
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('import resolver indexes', () => {
  it('does not build Python suffix tables for TS or relative Python imports', () => {
    let inspected = 0;
    const files: FileInfo[] = [
      { id: 1, path: 'src/helper.ts', get language() { inspected++; return 'typescript'; } },
      { id: 2, path: 'pkg/helper.py', get language() { inspected++; return 'python'; } },
      { id: 3, path: 'pkg/__init__.py', get language() { inspected++; return 'python'; } },
    ];
    const resolver = new ImportResolver(root(), files);
    expect(resolver.resolveTs('src/use.ts', './helper.js')).toEqual({ fileId: 1, reason: null });
    expect(resolver.resolvePy('pkg/use.py', '.helper', null)).toEqual({ fileId: 2, reason: null });
    expect(resolver.resolvePy('pkg/use.py', '.', 'helper')).toEqual({ fileId: 2, reason: null });
    expect(resolver.resolvePy('pkg/use.py', '.missing', null)).toEqual({ fileId: null, reason: 'not-found' });
    expect(inspected).toBe(0);
    expect(resolver.resolvePy('use.py', 'pkg.helper', null)).toEqual({ fileId: 2, reason: null });
    expect(inspected).toBe(files.length);
    expect(resolver.resolvePy('use.py', 'helper', null)).toEqual({ fileId: 2, reason: null });
    expect(inspected).toBe(files.length);
  });

  it('retains absolute package, suffix precedence, stub and missing-module behavior', () => {
    const files = [
      { id: 1, path: 'longer/pkg/helper.py', language: 'python' },
      { id: 2, path: 'pkg/helper.py', language: 'python' },
      { id: 3, path: 'pkg/__init__.py', language: 'python' },
      { id: 4, path: 'pkg/stub.pyi', language: 'python' },
      { id: 5, path: 'src/internal.ts', language: 'typescript' },
    ];
    const resolver = new ImportResolver(root(), files);
    expect(resolver.resolvePy('use.py', 'pkg', 'helper')).toEqual({ fileId: 2, reason: null });
    expect(resolver.resolvePy('use.py', 'helper', null)).toEqual({ fileId: 2, reason: null });
    expect(resolver.resolvePy('use.py', 'pkg', null)).toEqual({ fileId: 3, reason: null });
    expect(resolver.resolvePy('use.py', 'pkg.stub', null)).toEqual({ fileId: 4, reason: null });
    expect(resolver.resolvePy('use.py', 'pkg.missing', null)).toEqual({ fileId: null, reason: 'not-found' });
    expect(resolver.resolvePy('use.py', 'src.missing', null)).toEqual({ fileId: null, reason: 'not-found' });
    expect(resolver.resolvePy('use.py', 'external', null)).toEqual({ fileId: null, reason: 'external' });
    expect(new ImportResolver(root(), []).resolvePy('use.py', 'empty', null)).toEqual({ fileId: null, reason: 'external' });
  });
});
