import { fstatSync, openSync, closeSync, constants, readSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { toPosix } from './paths.js';

function inside(root: string, file: string): boolean {
  const rel = path.relative(root, file);
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

export function repoRelative(root: string, value: string, cwd = root): string | null {
  const abs = path.resolve(cwd, value);
  return inside(root, abs) ? toPosix(path.relative(root, abs)) : null;
}

/** Require a regular in-repo file and bound the read even if the file grows. */
export function readRepoFile(root: string, rel: string, maxBytes: number): Buffer | null {
  if (!rel || repoRelative(root, rel) !== rel) return null;
  const realRoot = realpathSync(root);
  const file = realpathSync(path.join(root, rel));
  if (!inside(realRoot, file) || !statSync(file).isFile()) return null;
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > maxBytes) return null;
    const bytes = Buffer.allocUnsafe(before.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const n = readSync(fd, bytes, size, bytes.length - size, null);
      if (!n) break;
      size += n;
    }
    const after = fstatSync(fd);
    if (size !== before.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return null;
    return bytes.subarray(0, size);
  } finally {
    closeSync(fd);
  }
}
