import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPatch, git, unpackWorkspace } from '../workspace.mjs';
import { manifest } from './repositories.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(directory, '../..');
const python = process.env.GW_REUSE_PYTHON ?? 'python3';

function sources(root) {
  const result = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['.git', '__pycache__', '.groundwork'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink source is not supported by reuse grading');
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.py')) result[path.relative(root, file).split(path.sep).join('/')] = readFileSync(file, 'utf8');
    }
  };
  walk(root);
  return result;
}

export function gradeChain(capture, scratch) {
  const chain = manifest.chains.find(c => c.id === capture.chain);
  if (!chain) throw new Error('Unknown reuse chain');
  const tasks = JSON.parse(readFileSync(path.join(directory, 'tasks.json'), 'utf8')).tasks.filter(t => t.sequence === chain.id);
  if (JSON.stringify(capture.observations.map(o => o.task)) !== JSON.stringify(tasks.map(t => t.id))) throw new Error('Require five complete ordered turns');
  const root = path.join(scratch, 'workspace');
  unpackWorkspace(source, capture.revision, 'reuse-' + chain.repo, root);
  const initial = git(root, 'rev-parse', 'HEAD').trim();
  const baseline = sources(root);
  const snapshots = [];
  try {
    for (let i = 0; i < 5; i++) {
      const observation = capture.observations[i];
      let applicable = true;
      try { applyPatch(root, observation.patch); }
      catch { applicable = false; }
      const files = git(root, 'diff', '--name-only', initial).split('\n').filter(Boolean);
      const allowed = files.every(file => file.startsWith('src/' + chain.package + '/'));
      const acceptance = spawnSync(python, [path.join(directory, 'hidden/acceptance.py'), root, chain.id, String(i + 1)],
        { cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
      if (acceptance.error && acceptance.error.code !== 'ETIMEDOUT') throw acceptance.error;
      snapshots.push({ success: applicable && allowed && acceptance.status === 0,
        sources: sources(root), acceptanceError: acceptance.status === 0 ? null : acceptance.stderr });
      git(root, 'add', '-A');
      git(root, '-c', 'user.name=Groundwork benchmark', '-c', 'user.email=benchmark@example.invalid', 'commit', '--allow-empty', '-qm', 'Grade turn ' + (i + 1));
    }
    const data = execFileSync(python, [path.join(directory, 'grade.py')], {
      input: JSON.stringify({ chain: chain.id, baseline, snapshots }), encoding: 'utf8',
      timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    });
    const report = JSON.parse(data);
    return { ...report, condition: capture.condition, run: capture.run, agent: capture.agent,
      captureRevision: capture.captureRevision,
      inputSha256: createHash('sha256').update(JSON.stringify(capture)).digest('hex'),
      sessionElapsedMs: capture.sessionEndedAt - capture.sessionStartedAt,
      toolSideMs: capture.observations.reduce((n,o) => n + o.tools.reduce((n,t) => n + t.durationMs,0),0),
      emittedBytes: capture.observations.reduce((n,o) => n + o.tools.reduce((n,t) => n + t.bytes,0),0),
      acceptanceErrors: snapshots.map(s => s.acceptanceError),
    };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
