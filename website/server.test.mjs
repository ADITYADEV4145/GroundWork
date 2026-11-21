import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { once } from 'node:events';

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
  assert.match(await home.text(), /Great agents/);
  for (const path of ['/package.json', '/server.mjs', '/.git/config', '/%2e%2e/package.json']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);
});
