import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Stamp = [string, number, number, number, number];
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const stamp = (file: string): Stamp => {
  const st = statSync(file);
  return [file, st.mtimeMs, st.ctimeMs, st.size, st.ino];
};

export function runtimeFingerprint(code: string, packageFile: string, runtime: string): string {
  const file = path.join(runtime, 'version-' + digest(code + packageFile).slice(0, 24) + '.json');
  try {
    const st = lstatSync(file);
    if (!st.isFile() || st.uid !== process.getuid!() || st.mode & 0o077 || st.size > 4 * 1024 * 1024) throw new Error('Invalid runtime fingerprint');
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(cached.entries) || !cached.entries.length || cached.entries.length > 20000 || !/^[a-f0-9]{64}$/.test(cached.version)) throw new Error('Invalid runtime fingerprint');
    if (digest(JSON.stringify([cached.version, cached.entries])) !== cached.checksum) throw new Error('Corrupt runtime fingerprint');
    if (cached.entries.every((entry: Stamp) => JSON.stringify(stamp(entry[0])) === JSON.stringify(entry))) return cached.version as string;
  } catch { /* Changed, absent or corrupt cache: hash the runtime again. */ }
  const hash = createHash('sha256');
  const entries: Stamp[] = [];
  const visit = (dir: string) => {
    entries.push(stamp(dir));
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(js|ts|cjs|json)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        const before = stamp(file);
        hash.update(file).update(readFileSync(file));
        if (JSON.stringify(before) !== JSON.stringify(stamp(file))) throw new Error('Runtime changed during fingerprinting');
        entries.push(before);
      }
    }
  };
  visit(code);
  const before = stamp(packageFile);
  hash.update(readFileSync(packageFile));
  entries.push(before);
  if (!entries.every((entry) => JSON.stringify(stamp(entry[0])) === JSON.stringify(entry))) throw new Error('Runtime changed during fingerprinting');
  const version = hash.digest('hex');
  const temporary = file + '.' + randomUUID();
  try {
    writeFileSync(temporary, JSON.stringify({ version, entries, checksum: digest(JSON.stringify([version, entries])) }), { flag: 'wx', mode: 0o600 });
    renameSync(temporary, file);
  } catch { /* A disposable cache must not prevent service startup. */ }
  finally { try { unlinkSync(temporary); } catch { /* Already renamed or never created. */ } }
  return version;
}
