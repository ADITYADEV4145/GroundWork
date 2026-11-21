import { createHash } from 'node:crypto';

export function sha1(data: string | Uint8Array): string {
  return createHash('sha1').update(data).digest('hex');
}

/** FNV-1a 32-bit; cheap stable hash for shingles. */
export function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
