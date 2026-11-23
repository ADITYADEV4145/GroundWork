import { initSqlBackend, openDb } from '../store/db.js';
import { indexDbPath } from '../index/store.js';
import { refreshIndex } from '../index/refresh.js';
import { changeImpact } from './index.js';
import type { GroundworkConfig } from '../config/schema.js';

process.once('message', async (request: { root: string; sessionId?: string; config: GroundworkConfig }) => {
  try {
    await initSqlBackend();
    await refreshIndex(request.root, { config: request.config, lockTimeoutMs: 25 });
    const db = openDb(indexDbPath(request.root), { readonly: true });
    try { process.send?.(await changeImpact(db, request.root, { config: request.config, sessionId: request.sessionId })); }
    finally { db.close(); }
  } catch (error) { process.send?.({ error: (error as Error).message }); }
  finally { process.disconnect(); }
});
