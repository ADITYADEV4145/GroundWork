import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { git } from '../workspace.mjs';

export function snapshot(root) {
  try {
    const files = new Map();
    for (const file of git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)) {
      if (file.split('/').some(part => ['.git', '.groundwork', '__pycache__'].includes(part))) continue;
      const absolute = path.resolve(root, file);
      if (!absolute.startsWith(root + path.sep)) continue;
      try {
        if (!lstatSync(absolute).isFile()) continue;
        if (!realpathSync(absolute).startsWith(realpathSync(root) + path.sep)) continue;
        const content = readFileSync(absolute);
        if (!content.includes(0) && Buffer.from(content.toString('utf8')).equals(content)) files.set(file, content.toString('utf8'));
      } catch { /* Deleted or unreadable files must not prevent the captured command. */ }
    }
    return files;
  } catch { return null; }
}

export function editEvents(root, before, after) {
  if (!before || !after) return [];
  const events = [];
  for (const file of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(file) === after.get(file)) continue;
    const file_path = path.join(root, file);
    events.push(before.has(file)
      ? { tool: 'Edit', input: { file_path, old_string: before.get(file), new_string: after.get(file) ?? '' } }
      : { tool: 'Write', input: { file_path, content: after.get(file) } });
  }
  return events;
}
