# Wave-4 patch audit and BLOCK comparisons

Agent review is accepted for this gate per Aditya's decision. Every new review
uses `Devin lead review (agent, not Aditya)`; it is not a claim of human review.

## Patch sanity and provenance limits

All 64 input records match the task IDs and baseline arm exactly. All patches
are distinct, nonempty, additions-only unified diffs with valid hunk lengths.
All added Python sources compile. Each adds the exact requested new production
file and symbol: 59 subclasses with the requested base and override, one
standalone factory, and four hard-negative functions. Production files contain
13–95 lines and 41–408 AST nodes; 33 optional test files are also added. There
are no edits to existing modules or unrelated files.

The normalized method-body differences against the exact pinned references
were inspected for all 60 clone-prone tasks, along with the four hard-negative
implementations. Signatures and decorators match their references, except the
explicitly requested `replace=True` default. The original `super()` parent
targets are retained where reference bodies are inlined. Some implementations
instead delegate to their base, including ProbeWithoutHelp,
ReplaceResultDefault, ParameterKindKey, SynopsisUsagePrefix and DoubleCountAction;
NullableSecondaryFlag delegates unaffected branches. These are substantive,
legitimate implementations, not evidence of duplication by themselves.

The reported 195-second run wall time cannot be independently explained or
validated from the supplied records. There are no session IDs, ACUs, execution
logs or timing fields. Agent-reported test claims remain explicitly unverified
in the stored runs. Static code inspection does not establish task success;
the block suite deliberately does not run acceptance tests. Neither missing
provenance nor short wall time alone proves the patches are invalid.

`sanity.json` records per-task files, requested symbols, sizes, patch SHA-256s,
and normalized differences against the pinned references. `summary.json`
records statuses, raw BLOCKs, verdicts, and independent-count exclusions.

## Review conclusions

The two Click nested decorator bodies are exact copies of the named existing
decorators: construct a command/group, register it with `self.add_command`, and
return it. Both are **agree**. Their enclosing methods only have WARN findings,
so neither nested pair is excluded by the existing enclosing-BLOCK rule.

The hard negative `block4-pytest-manifest-suffix-counts` has a **grounding** BLOCK
on test line 42, not a duplication BLOCK, and no matched existing symbol. Its
**disagree** verdict is supported by the actual patched source, Python AST and
runtime reproduction: the call passes a generator as its one required argument.
The current Python extractor records zero arguments because the tree-sitter
arguments node is `generator_expression`, not `argument_list`
(`src/lang/python.ts:321`). This reaches the missing-required-argument branch
in `src/grounding/verify.ts:529–534`; the stored scorer result records that exact
error. See `grounding-reproduction.txt`. Detector code and findings were not
changed to hide this false positive.

No WARN was promoted. No wave-4 duplicate-file rows or enclosing-symbol BLOCKs
cover these three findings. All 12 prior review rows are preserved unchanged.
The unchanged gate counts the grounding row too: cumulative **7/9 independent
reviewed BLOCK entries agree (77.8%)**. Of those, eight are actual duplicate
symbol pairs (**7 agree, 1 disagree**); the ninth is the false-positive grounding
entry (**disagree**, no existing symbol). The preexisting four covered file rows
and two covered nested-function rows remain excluded. The gate still fails
both the >=10 independent-entry and >=90% agreement thresholds.
