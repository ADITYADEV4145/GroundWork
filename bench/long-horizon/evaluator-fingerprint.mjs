import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function evaluatorFingerprint() {
  const files = [];
  function walk(relative, include) {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.name === '.groundwork' || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) walk(file, include);
      else if (entry.isFile() && include(file)) files.push(file);
      else if (!entry.isFile()) throw new Error(`Unexpected evaluator file type: ${file}`);
    }
  }
  walk('bench/long-horizon', (file) => file.endsWith('.mjs') || file === 'bench/long-horizon/tasks.json');
  walk('fixtures/long-horizon-events', () => true);
  const hashes = Object.fromEntries(files.sort().map((file) => [file, sha256(readFileSync(path.join(root, file)))]));
  return { algorithm: 'sha256', files: hashes, digest: sha256(JSON.stringify(hashes)) };
}
