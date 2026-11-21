// Bundles the hook runner into one file so each hook process loads one module instead of ~170.
// Native/wasm packages stay external so they keep resolving their own assets.
import { build } from 'esbuild';

await build({
  entryPoints: ['dist/hooks/run.js'],
  outfile: 'dist/hooks/run.bundle.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: true,
  external: ['web-tree-sitter', 'tree-sitter-*', 'sql.js', '@huggingface/*'],
  banner: { js: "import { createRequire as __gwCreateRequire } from 'node:module'; const require = __gwCreateRequire(import.meta.url);" },
  logLevel: 'warning',
});
