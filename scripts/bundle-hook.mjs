// Bundles the hook runner and the local MCP service into one file each so a process loads one module instead of ~170.
// Native/wasm packages stay external so they keep resolving their own assets.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist/hooks/run.bundle.js', { force: true });

await build({
  entryPoints: ['dist/mcp/relay.js'],
  outfile: 'dist/mcp/relay.bundle.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  packages: 'external',
  external: ['./server.js', './resume.js'],
  define: { 'import.meta.url': '__gwImportMetaUrl' },
  banner: { js: "const __gwImportMetaUrl = require('node:url').pathToFileURL(require('node:path').join(__dirname, 'relay.js')).href;" },
  logLevel: 'warning',
});

await build({
  entryPoints: ['dist/hooks/client.js'],
  outfile: 'dist/hooks/client.bundle.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  define: { 'import.meta.url': '__gwImportMetaUrl' },
  banner: { js: "const __gwImportMetaUrl = require('node:url').pathToFileURL(require('node:path').join(__dirname, '../mcp/relay.js')).href;" },
  logLevel: 'warning',
});

await build({
  entryPoints: ['dist/hooks/run.js'],
  outfile: 'dist/hooks/run.bundle.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  external: ['web-tree-sitter', 'tree-sitter-*', 'sql.js', '@huggingface/*', 'typescript'],
  define: { 'import.meta.url': '__gwImportMetaUrl', 'import.meta.resolve': '__gwImportMetaResolve' },
  banner: { js: "const __gwImportMetaUrl = require('node:url').pathToFileURL(__filename).href; const __gwImportMetaResolve = id => { const target = require.resolve(id); return require('node:module').isBuiltin(target) ? 'node:' + target.replace(/^node:/, '') : require('node:url').pathToFileURL(target).href; };" },
  logLevel: 'warning',
});

// Paths derived from import.meta.url inside the service resolve as they do for dist/mcp/daemon.js.
await build({
  entryPoints: ['dist/mcp/daemon.js'],
  outfile: 'dist/mcp/daemon.bundle.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  external: ['web-tree-sitter', 'tree-sitter-*', 'sql.js', '@huggingface/*'],
  define: { 'import.meta.url': '__gwImportMetaUrl', 'import.meta.resolve': '__gwImportMetaResolve' },
  banner: { js: "const __gwImportMetaUrl = require('node:url').pathToFileURL(require('node:path').join(__dirname, 'daemon.js')).href; const __gwImportMetaResolve = id => { const target = require.resolve(id); return require('node:module').isBuiltin(target) ? 'node:' + target.replace(/^node:/, '') : require('node:url').pathToFileURL(target).href; };" },
  logLevel: 'warning',
});
