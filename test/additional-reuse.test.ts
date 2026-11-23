import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { adapterFor, initParsers } from '../src/lang/index.js';
import { checkRepository } from '../src/reuse/check.js';
import { scenarioGit, writeScenarioFile } from '../src/reuse/scenarios.js';
import { FIXTURES_DIR, tempDir } from '../src/selftest/fixtures.js';
import type { Language } from '../src/types.js';

const cases: { language: Language; fixture: string; source: string; name: string; existing: string; draft: string; wrap: (s: string) => string }[] = [
  { language: 'go', fixture: 'go-app', source: 'store/store.go', name: 'Normalize', existing: 'Normalize', draft: 'store/draft.go', wrap: (s) => 'package store\nimport "strings"\n' + s },
  { language: 'rust', fixture: 'rust-app', source: 'src/lib.rs', name: 'normalize', existing: 'normalize', draft: 'src/draft.rs', wrap: (s) => 'use crate::helpers::trim_name;\n' + s },
  { language: 'java', fixture: 'java-app', source: 'src/demo/Store.java', name: 'normalize', existing: 'Store.normalize', draft: 'src/demo/Draft.java', wrap: (s) => 'package demo;\nclass Draft {\n' + s + '\n}' },
  { language: 'csharp', fixture: 'csharp-app', source: 'Store.cs', name: 'Normalize', existing: 'Store.Normalize', draft: 'Draft.cs', wrap: (s) => 'class Draft {\n' + s + '\n}' },
  { language: 'ruby', fixture: 'ruby-app', source: 'lib/helpers.rb', name: 'normalize', existing: 'Helpers.normalize', draft: 'lib/draft.rb', wrap: (s) => 'module Draft\n' + s + '\nend' },
];

describe('duplicate gate for additional languages', () => {
  it.each(cases)('flags a renamed near-duplicate of the $language fixture helper', async ({ language, fixture, source, name, existing, draft, wrap }) => {
    const root = tempDir('gw-language-reuse-');
    try {
      cpSync(path.join(FIXTURES_DIR, fixture), root, { recursive: true, filter: (p) => !p.endsWith('expected.json') });
      writeScenarioFile(root, '.gitignore', '.groundwork/\n');
      scenarioGit(root, 'init', '-q');
      const tracked = scenarioGit(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
      scenarioGit(root, 'add', '--', ...tracked);
      scenarioGit(root, 'commit', '-qm', 'fixture baseline');
      await initParsers();
      const text = readFileSync(path.join(root, source), 'utf8');
      const original = adapterFor(language).extract(text, language).symbols.find((s) => s.name === name)!;
      const clone = text.slice(original.startByte, original.endByte).replace(name, 'normalizeDraft').replace(/\bname\b/g, 'input');
      writeScenarioFile(root, draft, wrap(clone));
      const config = defaultConfig();
      config.reuse.embeddings.enabled = false;
      const report = await checkRepository(root, { config });
      expect(report.findings.some((f) => f.kind === 'duplicate' && f.added.file === draft && f.existing?.symbol === existing), JSON.stringify(report.findings)).toBe(true);
      writeFileSync(path.join(root, draft), '');
      expect((await checkRepository(root, { config })).findings.some((f) => f.added.file === draft)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
