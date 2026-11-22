import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { once } from 'node:events';
import { readFile, access } from 'node:fs/promises';

test('all page assets resolve within a static host subdirectory', async () => {
  const html = (await Promise.all(['index.html', 'benchmarks.html'].map(file => readFile(new URL(`./dist/${file}`, import.meta.url), 'utf8')))).join('\n');
  const base = new URL('https://example.com/GroundWork/');
  for (const [, relative] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^https?:/.test(relative)) continue;
    const resolved = new URL(relative, base);
    assert.ok(resolved.pathname.startsWith('/GroundWork/'), relative);
    await access(new URL(`./dist/${relative === './benchmarks' ? 'benchmarks.html' : relative}`, import.meta.url));
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

test('built benchmark page separates completed v7 from post-hoc and original historical results', async () => {
  const html = await readFile(new URL('./dist/benchmarks.html', import.meta.url), 'utf8');
  const section = html.match(/<!-- stable-protocol:start -->([\s\S]*?)<!-- stable-protocol:end -->/)[1];
  assert.match(section, /Stable protocol \(v7\)/);
  assert.ok(html.indexOf('<!-- stable-protocol:end -->') < html.indexOf('<h2>Pre-fix results</h2>'));
  const primary = section.match(/aria-label="Stable protocol v7 primary results"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert.equal([...primary.matchAll(/<tr>/g)].length, 6);
  assert.doesNotMatch(primary, /Pending/);
  assert.match(section, /no confirmatory latency win/);
  const historical = section.match(/aria-label="Post-hoc historical session analysis, not v7"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert.equal([...historical.matchAll(/<tr>/g)].length, 12);
  assert.doesNotMatch(historical, /Pending/);
  assert.match(section, /95% whole-session bootstrap/);
  assert.match(section, /50%[\s\S]*11%/);
  assert.match(section, /Historical tool-side time is unavailable/);
  assert.match(html, /-153\.3% \[-209\.8, -66\.4\]/);
});

test('built benchmark page places measured-not-shipped v8 above preserved v7', async () => {
  const html = await readFile(new URL('./dist/benchmarks.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="stable-protocol-v8"') < html.indexOf('id="stable-protocol-v7"'));
  const primary = html.match(/aria-label="Stable protocol v8 primary results"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert.equal([...primary.matchAll(/<tr>/g)].length, 6);
  assert.match(html, /434 to 285ms/);
  assert.match(html, /616 to 337ms/);
  assert.match(html, /measured and not shipped on main/);
  assert.match(html, /significantly slower in both suites/);
  assert.doesNotMatch(primary, /Pending/);
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
  const benchmarks = await fetch(base + '/benchmarks');
  assert.equal(benchmarks.status, 200);
  assert.match(await benchmarks.text(), /Less copied code/);
  const homeHtml = await (await fetch(base)).text();
  assert.doesNotMatch(homeHtml, /class="benchmarks"|bench\/.*\.svg/);
  assert.equal([...homeHtml.matchAll(/href="\.\/benchmarks"/g)].length, 2);
  for (const name of ['token-reduction', 'copied-code', 'success', 'wall-time', 'before-after-output', 'before-after-wall', 'before-after-success']) {
    const chart = await fetch(`${base}/bench/${name}.svg`);
    assert.equal(chart.status, 200);
    assert.equal(chart.headers.get('content-type'), 'image/svg+xml');
    assert.match(await chart.text(), /<svg/);
  }
  for (const path of ['/package.json', '/server.mjs', '/.git/config', '/%2e%2e/package.json']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);
});
