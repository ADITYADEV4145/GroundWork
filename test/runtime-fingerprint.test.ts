import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runtimeFingerprint } from '../src/mcp/fingerprint.js';
import { tempDir } from '../src/selftest/fixtures.js';

it('invalidates cached runtime versions on changes, additions, removals and corruption', () => {
  const root = tempDir('gw-fingerprint-'), code = path.join(root, 'code'), cache = path.join(root, 'cache'), pkg = path.join(root, 'package.json');
  try {
    mkdirSync(code); mkdirSync(cache);
    writeFileSync(pkg, '{}'); writeFileSync(path.join(code, 'app.js'), 'first');
    const fingerprint = () => runtimeFingerprint(code, pkg, cache);
    const first = fingerprint();
    expect(fingerprint()).toBe(first);
    writeFileSync(path.join(code, 'app.js'), 'other');
    const changed = fingerprint(); expect(changed).not.toBe(first);
    writeFileSync(path.join(code, 'new.js'), 'new');
    expect(fingerprint()).not.toBe(changed);
    rmSync(path.join(code, 'new.js'));
    expect(fingerprint()).toBe(changed);
    writeFileSync(pkg, '{"version":"new"}');
    const packaged = fingerprint(); expect(packaged).not.toBe(changed);
    const file = path.join(cache, readdirSync(cache)[0]!);
    writeFileSync(file, 'corrupt');
    expect(fingerprint()).toBe(packaged);
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(packaged);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
