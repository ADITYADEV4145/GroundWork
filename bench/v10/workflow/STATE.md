Phase A state (for post-summary):
- main run wfr-85346423... COMPLETE 64/64; URLs in v9-urls.txt
- compliant run wfr-0f44a3bb... 15/16, resumed (throttled script workflow_v9c_throttled.py) for v9c-nav-groundwork-12; URLs partial in v9c-urls-partial.txt; final list from completion notification
- relaunch history: stuck-unstarted sessions terminated & resumed (no data); concurrency cap added (8/4) only to launch scripts -> disclose in report
- Next: when v9c done, sidekick downloads all 80 captures, verifies pin 36f54a0, runs stable analysis (as v8) incl turns/session; report to Chief + speed session devin-161cefdcd3e647299404f6f3cc357fd1; then launch Phase B workflow_reuse.py (64 sessions, pin 831fca4) — consider throttling similarly.
UPDATE: Phase A done & reported; results PR #47 (captures) + #46 (publication, 0 findings) ready, unmerged.
Phase B running: wfr-6ddd04278ae246719065199d61f1a453 (workflow_reuse_throttled.py, Sem 8). When done: report to Chief, grade with preregistered grader, report normal/fusion separately.
v10 (PR #48 e3bdc74) prepared: workflow_v10_throttled.py (64 official) + workflow_v10d_throttled.py (32 deviation); arms note PR #49. Launch ONLY after Phase B collection done. Report to speed session devin-161cefdcd3e647299404f6f3cc357fd1 with LH per-task action counts.
Phase B: reuse-normal-click-values-{baseline,groundwork}-2 never started (0 ACU, never updated since 11:25 UTC); terminated ~12:40 UTC. After workflow finishes, RESUME wfr-6ddd0427 with workflow_reuse_throttled.py to rerun only those (disclose: never-started units relaunched, no data collected). Then launch v10.
Also terminated never-started reuse-fusion-click-summary-groundwork-5 (devin-7b5140, no response 45m). Rerun on resume.
Also terminated never-started reuse-fusion-pytest-async-groundwork-16 (devin-2bef07, no response 50m). 4 units to rerun.
Phase B collected 64/64 (4 reruns ~5min, verify). v10 launched: official wfr-7a0797465ec24beabb153454b6a6e659, deviation wfr-8b85522f66dd42d1b4fe58f47e3a6154. Sidekick grading Phase B -> /home/ubuntu/bench-diagnosis/phaseB-results.md
Phase B graded: gate FAIL (0% dup both arms both modes). Reported to Chief w/ phaseB-results.md. Offered results PR. Awaiting Chief; v10 collecting.
v10: terminated 7 never-started sessions (0 ACU, no update since 13:21 UTC): v10d nav-gw-1,2 lh-gw-1; v10 nav-gw-1,2 lh-baseline-2 lh-gw-2. Resume workflows to relaunch fresh; disclose.
v10: also terminated never-started v10-lh-baseline-4 (devin-95b12fca, no update since 13:37:49).
v10: terminated never-started v10-nav-groundwork-6 (devin-60765298; no reply to 40-min self-check, no update since creation).
v10: terminated never-started (created ~14:01-14:02, no update 40+ min): v10-nav-baseline-7, v10-nav-baseline-8, v10-nav-groundwork-7, v10-lh-groundwork-7, v10d-nav-groundwork-6. Total stuck so far: 13.
v10: terminated never-started v10d-nav-groundwork-10 (19a4cf), v10-nav-baseline-10 (9aa47a). Total 15. Note v10d-lh-gw-13 reported a malformed wrapper invocation (printed usage) - check schema.
v10: terminated never-started v10-nav-groundwork-9 (35085d). Total 16.
v10d run finished 27/32; resumed to relaunch 5 never-started (nav-gw-1,2,6,10; lh-gw-1).
v10 official finished 52/64; resumed to relaunch 12 never-started.
v10: terminated never-started v10-nav-baseline-10 rerun (7b4e4f); last missing official unit. v10d complete 32/32 (output saved v10d-final-output.txt).
v10 collected 96/96 (18 relaunches). Schema: 95/96; v10-lh-groundwork-11 lh-04 action=outline rejected. Asked Chief re LH (official no verdict+exploratory; deviation LH graded). Sidekick grading nav.
v10 graded & reported to Chief + speed session. Offered v10 results PR; awaiting Chief.
