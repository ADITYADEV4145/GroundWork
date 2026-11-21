import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const suiteFile = (file) => fileURLToPath(new URL(file, import.meta.url));
const execute = (file, cwd, args = []) => spawnSync(process.execPath, [suiteFile(file), ...args], {
  cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
});

export async function grade(task, observation, { withWorkspace }) {
  if (!Number.isInteger(task.step) || task.step < 1 || task.step > 10 || task.id !== `lh-${String(task.step).padStart(2, '0')}`) {
    throw new Error(`Unknown long-horizon task ${task.id}`);
  }
  if (!observation.patch?.trim()) return false;
  return withWorkspace((root) => {
    let success = true;
    // Later features must not break previously accepted contracts.
    for (let step = 1; step <= task.step; step++) {
      const result = execute(`acceptance/step-${String(step).padStart(2, '0')}.mjs`, root);
      if (result.error && result.error.code !== 'ETIMEDOUT') throw result.error;
      if (result.status !== 0) success = false;
    }
    const result = execute('metrics.mjs', root, [root]);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Groundwork metrics unavailable (not zero): ${result.stderr || result.stdout}`);
    const metrics = JSON.parse(result.stdout);
    for (const name of ['duplicatesAdded', 'inventedCalls']) {
      if (!Number.isInteger(metrics[name]) || metrics[name] < 0) throw new Error(`Invalid ${name} metric`);
    }
    return { success, metrics };
  });
}
