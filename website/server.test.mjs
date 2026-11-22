import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { once } from 'node:events';
import { readFile, access } from 'node:fs/promises';

test('all page assets resolve within a static host subdirectory', async () => {
  const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
  const base = new URL('https://example.com/GroundWork/');
  for (const [, relative] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^https?:/.test(relative)) continue;
    const resolved = new URL(relative, base);
    assert.ok(resolved.pathname.startsWith('/GroundWork/'), relative);
    await access(new URL(`./dist/${relative}`, import.meta.url));
  }
  const manifest = JSON.parse(await readFile(new URL('./dist/site.webmanifest', import.meta.url), 'utf8'));
  assert.equal(new URL(manifest.start_url, base).pathname, '/GroundWork/');
  for (const icon of manifest.icons) {
    assert.ok(new URL(icon.src, base).pathname.startsWith('/GroundWork/'));
  }
});

test('built page includes all install commands and accessible package manager tabs', async () => {
  const html = await readFile(new URL('./dist/index.html', import.meta.url), 'utf8');
  for (const command of [
    'npm install -g groundwork-agent',
    'pnpm add -g groundwork-agent',
    'yarn global add groundwork-agent',
    'bun add -g groundwork-agent',
    'brew install ADITYADEV4145/groundwork/groundwork',
    'curl -fsSL https://raw.githubusercontent.com/ADITYADEV4145/GroundWork/main/scripts/install.sh | sh',
  ]) assert.ok(html.includes(command), command);
  assert.match(html, /role="tablist" aria-label="Package manager"/);
  for (const manager of ['npm', 'pnpm', 'yarn', 'bun', 'homebrew', 'curl']) {
    assert.match(html, new RegExp(`id="install-tab-${manager}"[^>]+role="tab"[^>]+aria-selected="(?:true|false)"[^>]+aria-controls="install-panel"`));
  }
  assert.match(html, /id="install-panel" role="tabpanel" tabindex="0" aria-labelledby="install-tab-npm"/);
  assert.match(html, /role="status" aria-live="polite"/);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
  const dialog = html.match(/<dialog id="install"[^>]*>([\s\S]*?)<\/dialog>/)[1];
  assert.match(main, /id="install-picker"/);
  assert.match(main, /role="tablist" aria-label="Package manager"/);
  assert.match(main, /data-copy="install-code"/);
  assert.match(main, /needs Yarn 1 \(Classic\)/);
  assert.doesNotMatch(dialog, /install-picker|role="tab"|data-copy="install-code"/);
  assert.equal([...html.matchAll(/id="install-picker"/g)].length, 1);
});

test('static server contains malformed targets and never exposes repository files', async t => {
  const port = 18000 + Math.floor(Math.random() * 10000);
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(() => server.kill());
  await Promise.race([
    once(server.stdout, 'data'),
    once(server, 'exit').then(() => { throw new Error('Server exited before listening'); }),
  ]);
  const malformed = await new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write('GET //[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    });
    let body = '';
    socket.on('data', chunk => { body += chunk; });
    socket.on('end', () => resolve(body));
    socket.on('error', reject);
  });
  assert.match(malformed, /^HTTP\/1\.1 400 /);
  const base = `http://127.0.0.1:${port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200, 'server stays alive after invalid request');
  assert.match(await home.text(), /Big ideas/);
  for (const path of ['/package.json', '/server.mjs', '/.git/config', '/%2e%2e/package.json']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);
});
