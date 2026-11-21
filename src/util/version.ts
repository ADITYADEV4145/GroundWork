import { readFileSync } from 'node:fs';

// src/util and dist/util both sit two levels below package.json.
export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
