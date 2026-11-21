# Captured failure corpus

50 actual failing executions: five distinct scenarios each for pytest, vitest,
jest, tsc, eslint, ruff, npm install, pnpm install, pip install, and generic Python.
These are deliberately failing small projects, not failures mined from production.
Test runners also execute 100 passing tests to exercise genuine noisy output.
Short diagnostics are retained unchanged; no artificial log padding is added.

Each JSON stores the raw stdout followed by stderr, the project source, command,
tool version, UTC capture time, and nonzero exit code. Paths and durations are real
and will vary across captures. No registry access is needed for failing installs:
they exercise malformed manifests, missing local tarballs, lifecycle failures,
invalid requirements and broken local metadata/build configuration.

Reproduce from the repository root (Node 22+, Python 3.12, npm 10.8.3):

```sh
python3 -m venv "$HOME/groundwork-capture-python"
"$HOME/groundwork-capture-python/bin/pip" install pip==25.0.1 pytest==8.3.5 ruff==0.11.13 setuptools==80.9.0 wheel==0.45.1
npm install --prefix "$HOME/groundwork-capture-node" vitest@3.2.4 jest@29.7.0 typescript@5.9.3 eslint@9.28.0 pnpm@10.11.0
GW_CAPTURE_PYTHON="$HOME/groundwork-capture-python/bin/python" \
GW_CAPTURE_NODE_BIN="$HOME/groundwork-capture-node/node_modules/.bin" \
node --import tsx scripts/capture-failures.mjs
```

`src/guards/failure-evidence.ts` derives expected failure lines from raw output,
independently of the trimmer and its parsers. The gate re-derives that evidence,
rejects mismatching expected lines or missing provenance, requires 50 distinct
failure sets, and asserts every extracted line survives. Corpus-wide byte savings
must exceed 50%; short or all-error logs need not shrink.
