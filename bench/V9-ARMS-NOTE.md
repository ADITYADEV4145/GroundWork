# v9 Phase A gate: arm definitions (recorded 2026-11-22, before any v9 result was read)

Product under test: PR #41, commit 36f54a0845fe2bf4184549cf5cef8f216a8957ab, for every arm.
Protocol: bench/PROTOCOL.md (stable v1), unchanged. 16 sessions per arm per suite.

| Arm | Suites | GroundWork prompt skill block | Status |
|---|---|---|---|
| baseline (`v9-*-baseline-N`) | nav, LH | n/a | Protocol-compliant |
| GroundWork, protocol text (`v9c-nav-groundwork-N`) | nav | v8 text, unchanged | **Protocol-compliant gate result** |
| GroundWork, regenerated skill line (`v9-nav-groundwork-N`) | nav | step 1 replaced verbatim with SKILL.md step 1 at 36f54a0 | **Disclosed deviation**: PROTOCOL.md says other non-harness instructions remain unchanged. Reported next to the compliant arm, never in place of it |
| GroundWork (`v9-lh-groundwork-N`) | LH | v8 text, unchanged (the LH prompt carries no find_code guidance line) | Protocol-compliant |

Across all arms, only the commit pin, branch name and run labels differ from the v8 prompts; tasks, graders, session counts and analysis are the same.
The deviation arm (`v9-*`) was launched first; the compliant navigation arm (`v9c-*`) was added afterwards, on the same commit, and collected later in time.
