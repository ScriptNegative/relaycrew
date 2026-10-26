# Evaluation results

Recorded on 26 October 2026. These are small exploratory checks, not a statistical benchmark or a universal compatibility claim.

## What was actually run

| Run | Skill and execution | Result | What it establishes |
| --- | --- | --- | --- |
| CSV export with skill | RelayCrew 0.1.0 instructions; one Codex evaluator, no extra workers | Original 8 acceptance tests passed; 3 added tests passed | A small dependent task completed in solo mode |
| CSV export baseline | Same frozen contract and original tests, no RelayCrew | Original 8 acceptance tests passed; 4 added tests passed | The task was also solved without the skill |
| Offline event report team | RelayCrew 0.1.0; one coordinating evaluator and 2 native workers | Original 7 acceptance tests and 16 added tests passed | A real two-worker split integrated successfully under explicit ownership |
| Read-only resume | 0.2.0 instructions; plan and text access only, no project execution or workers | Checkpoint claims were qualified; UI independence and downstream holds were preserved | The updated workflow produced a bounded plan without claiming execution |
| Planner/package checks | 0.2.0 source, Node v22.14.0 on Windows | 22 tests passed | Scheduling, recovery state, CLI behavior, references, and copied-folder execution satisfy the checked invariants |
| Independent local review | 0.2.0 planner, references, and tests; bounded local probes | No confirmed material defect reported; same 22 tests passed | A second inspection found no reproducible defect in the reviewed scope |

The original CSV acceptance-test files have the same SHA-256 in both conditions: `01ec16cfc5cb375df98255d3ff63716294db2956fbaa9984cd76b69127b4a576`. The supplied event acceptance tests were also left unchanged. Added test counts are not comparable quality scores; different evaluators chose different edge cases.

## Team behavior observed

The parser worker owned its source and tests; the summary worker owned separate source and tests. Both were dispatched before either completed, with fresh contexts and focused capsules. The evaluation coordinator retained integration, inspected the returned artifacts, and ran the combined suite after the workers finished. The outer project coordinator independently reran that combined suite: 23 passed, zero failed.

The run used native Codex collaboration tools in a shared Windows workspace. There were no dependency installs, external calls, publication, or skill edits during those evaluations. The planner was not needed for the simple two-workstream coding split; it was tested separately. Saved records include tool and ownership details.

## Important limits

- One run per coding condition. Model randomness, task order, and a larger sample were not controlled sufficiently for a performance comparison.
- Exact model identifier, aggregate tokens, billed cost, and end-to-end timings were not captured. No savings are claimed.
- The team run did not exercise live worker failure, stale ownership transfer, large queues, or independent reviewer behavior. Static recovery and scheduling cases are covered by planner tests, not by a live failure-recovery agent run.
- The native coding runs loaded a supplied skill file directly. Automatic discovery and installation registration were not tested.
- Claude Code, ChatGPT-specific surfaces, Copilot, OpenCode, and other hosts were not run. Their setup guidance is based on primary documentation; native capabilities still vary.
- Later CI checks can replay the saved code on other Node/OS combinations. That verifies the artifacts there, not a new live agent session.

## Reproduce and extend

Start from the incomplete [fixtures](fixtures), not the saved solutions. Preserve the same acceptance contract for both conditions and keep the baseline session independent. Publish failures alongside successes. Use the [evaluation prompts](evals.json) and [benchmark method](../docs/growth-playbook.md) to extend coverage.

The saved [read-only resume record](runs/resume-readonly/evaluation.md) documents the 0.2.0 capability-limited case. It is a manual instruction-following observation, not a live failure-recovery benchmark.

## 0.3.0 update checks

The next-wave handoff update was checked on Windows with Node v22.14.0:

- All 32 planner/package tests passed, including `next(input)`, JSON/Markdown handoffs, empty held versus complete states, state-aware brief errors, current-only capsule caps, UTF-8 BOM handling, malformed inputs, and copied-folder execution.
- The full `plan(input)` output matched the published 0.2.0 implementation across 200 deterministic graph/checkpoint cases. This checks compatibility for those cases, not every possible input.
- A separate read-only review passed 17 local assertions covering wave membership, conflict exclusion, state labels, capsule caps, and global validation. No concrete defect was reported.
- The skill format validator and whitespace checks passed. No new live model, host-installation, or performance benchmark is claimed for this CLI-focused update.

## 0.4.0 update checks

- The root suite contains 65 tests: 38 planner, 18 session-core, 6 session-CLI, and 3 package checks. On Windows with Node v22.14.0, 64 passed and the file-symlink case skipped because this host did not permit creating the fixture. There were no failures. CI runs the same suite on Node 18/22 on Linux and Node 22 on Windows; consult the matching workflow run for platform-specific outcomes.
- Tests cover active slot/path/resource reservations, independently ready work after partial completion, reported versus accepted evidence, failed checks, explicit stopped confirmations, replacement attempt IDs, stale results, plan definition changes, malformed state, stale revisions, competing file writers, exclusive initialization, and copied-skill execution without installation.
- Both `plan(input)` and `next(input)` JSON matched 0.3.0 across 200 deterministic graph/state cases without `in_progress`. This is bounded compatibility evidence, not an exhaustive input proof.
- A separate code/storage review found no reproducible consequential defect in its scope.
- An independent evaluator used only public skill instructions and references for [22 actual CLI invocations](runs/session-recovery/evaluation.md). It recorded API acceptance, docs dispatch while UI stayed active, fresh-process recovery reads, rejection of unconfirmed-stop retry/failure, a replacement attempt, and rejection of the old attempt's late report without changing the checkpoint. That observation led to a more actionable retry error.

The recovery evaluation's worker reports, stopping confirmations, partial work, and review evidence were synthetic. It did not launch workers, execute project checks, terminate the coordinator driver, reconnect a native host, or simulate power loss. It exercises persisted coordination state and instruction usability. No time, cost, or token improvement is claimed.

## 0.5.0: reviewed plan migration

The root suite now contains 78 cases. On Windows with Node v22.14.0, 77 passed and the file-symlink fixture skipped because this host did not permit creating it. Added checks cover task-definition changes, transitive completion invalidation, retained failure holds, reordered plans, new/removed tasks, obsolete attempt IDs, read-only previews, atomic persistence, stale approvals/revisions, competing migrations, and copied-skill execution.

A fresh-context evaluator used only the skill, references, and public CLI for [36 actual commands](runs/migration-forward/evaluation.md). From a synthetic completed API/UI/docs checkpoint, it revised API requirements, retained UI, reset API/docs, removed a failed spike, and added review. Revision advanced from 12 to 13 exactly once for migration. Readiness then progressed API → docs → review. Seven expected rejection cases preserved checkpoint bytes and revision, including an active task that the new plan removed and old attempt results after restart. The saved transcript includes a preliminary evaluator harness mistake, which is separately labelled rather than presented as a product failure.

The worker evidence, stop confirmations, and coordinator reviews were synthetic; the CLI operations and file checks actually ran. No native worker termination, workspace/test freshness, or performance gain is established. The two observed diagnostic wording gaps were corrected before release, while the transcript preserves the messages originally observed.

A bounded comparison against 0.4.0 matched `sessionNext`, report, and acceptance behavior across 40 synthetic legacy sessions. A separate cross-review found no consequential reproducible defect in migration state or persistence, including reordered dependency chains, returning to an earlier plan hash, pending retry counters, and removal of active tasks. Retention remains a conservative bookkeeping decision based on explicit dependencies and coordinator review; unchanged definitions alone do not establish valid project results.
