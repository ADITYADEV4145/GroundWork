# Git-scripted reuse checks

`src/reuse/scenarios.ts` copies `base/` into a temporary directory, initializes Git,
commits the base, and applies one selected worktree change. No fixture requires an
existing index or Git history. The same scripts drive Vitest and the Phase 3
selftest: planted duplicate, clean edit, abandoned implementation, constants,
versioned duplicate file, specific/vague exemptions, and individual noise skips.

The constant scenario covers paths, URLs, environment keys, config keys,
configuration numbers and strings. The getter fixture intentionally exceeds
the tiny-body cutoff, so accessor suppression is tested independently.
