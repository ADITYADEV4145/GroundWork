import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// An explicit public-file map keeps repository files out of the web root.
const types = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/icon-192.png', ['icon-192.png', 'image/png']],
  ['/icon-512.png', ['icon-512.png', 'image/png']],
  ['/site.webmanifest', ['site.webmanifest', 'application/manifest+json']],
  ...['poster', 'workflow'].map(name => [`/groundwork-${name}.webp`, [`groundwork-${name}.webp`, 'image/webp']]),
]);
const port = Number(process.env.PORT || 4173);
createServer(async (request, response) => {
  let path;
  try {
    path = new URL(request.url, 'http://localhost').pathname;
  } catch {
    response.writeHead(400);
    return response.end('Bad request');
  }
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
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://d2ol7oe51mr4n9.cloudfront.net; media-src https://d8j0ntlcm91z4.cloudfront.net; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'",
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end('Run npm run build before starting the site.');
  }
}).listen(port, '0.0.0.0', () => console.log(`Groundwork website listening on ${port}`));
