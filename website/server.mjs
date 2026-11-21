import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// An explicit public-file map keeps repository files out of the web root.
const types = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/icon-192.png', ['icon-192.png', 'image/png']],
  ['/icon-512.png', ['icon-512.png', 'image/png']],
  ['/site.webmanifest', ['site.webmanifest', 'application/manifest+json']],
  ...['hero', 'navigate', 'reuse', 'ground'].map(name => [`/${name}-art.webp`, [`${name}-art.webp`, 'image/webp']]),
]);
const port = Number(process.env.PORT || 4173);
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = types.get(path);
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end();
  }
  if (!file) {
    response.writeHead(404);
    return response.end('Not found');
  }
  try {
    const body = await readFile(new URL(`./dist/${file[0]}`, import.meta.url));
    response.writeHead(200, {
      'Content-Type': file[1],
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'",
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end('Run npm run build before starting the site.');
  }
}).listen(port, '0.0.0.0', () => console.log(`Groundwork website listening on ${port}`));
