import path from 'node:path';
import { refreshIndex } from '../../index/refresh.js';
import { toPosix } from '../../util/paths.js';
import type { HookHandler } from '../types.js';
import { EDIT_TOOLS } from '../edit-tools.js';

export { EDIT_TOOLS } from '../edit-tools.js';

/** Keep the index current after the agent edits a file. */
export const refreshOnEdit: HookHandler = {
  name: 'refresh_on_edit',
  events: ['post_tool'],
  tools: EDIT_TOOLS,
  async run(ev, { root, config }) {
    const file = typeof ev.input.file_path === 'string' ? ev.input.file_path : typeof ev.input.path === 'string' ? ev.input.path : null;
    const rel = file ? toPosix(path.relative(root, path.resolve(ev.cwd, file))) : null;
    // Hooks run synchronously inside the agent's turn: never wait long for another writer (the
    // in-process timeout cannot fire while indexing blocks the event loop).
    const lockTimeoutMs = 300;
    await refreshIndex(root, rel && !rel.startsWith('..') ? { config, paths: [rel], lockTimeoutMs } : { config, lockTimeoutMs });
    return null;
  },
};
