import { rmSync } from 'node:fs';
import { expect, it } from 'vitest';
import { tempDir } from '../src/selftest/fixtures.js';
import { scenarioGit, writeScenarioFile } from '../src/reuse/scenarios.js';
import { checkRepository } from '../src/reuse/check.js';
import { defaultConfig } from '../src/config/load.js';

it.each([
  ['java', 'interface Original { String ENDPOINT = "https://example.org/api"; }'],
  ['rb', 'module Original\n ENDPOINT = "https://example.org/api"\nend'],
  ['rb', 'class Original\n ENDPOINT = "https://example.org/api"\nend'],
] as const)('accepts container-level %s constants as reuse targets: %s', async (extension, original) => {
  const root = tempDir('gw-container-constant-');
  try {
    writeScenarioFile(root, '.gitignore', '.groundwork/\n');
    writeScenarioFile(root, `original.${extension}`, original);
    scenarioGit(root, 'init', '-q');
    scenarioGit(root, 'add', '.gitignore', `original.${extension}`);
    scenarioGit(root, 'commit', '-qm', 'container baseline');
    writeScenarioFile(root, `draft.${extension}`, original.replace('Original', 'Draft').replace('ENDPOINT', 'DRAFT_ENDPOINT'));
    const config = defaultConfig(); config.reuse.embeddings.enabled = false;
    const result = await checkRepository(root, { config });
    expect(result.findings.filter((f) => f.kind === 'duplicate-constant').map((f) => f.existing?.symbol)).toContain('ENDPOINT');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
