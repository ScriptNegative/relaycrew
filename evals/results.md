# Evaluation results

Recorded on 26 October 2026. These are small exploratory checks, not a statistical benchmark or a universal compatibility claim.

## What was actually run

| Run | Skill and execution | Result | What it establishes |
| --- | --- | --- | --- |
| CSV export with skill | RelayCrew 0.1.0 instructions; one Codex evaluator, no extra workers | Original 8 acceptance tests passed; 3 added tests passed | A small dependent task completed in solo mode |
| CSV export baseline | Same frozen contract and original tests, no RelayCrew | Original 8 acceptance tests passed; 4 added tests passed | The task was also solved without the skill |
| Offline event report team | RelayCrew 0.1.0; one coordinating evaluator and 2 native workers | Original 7 acceptance tests and 16 added tests passed | A real two-worker split integrated successfully under explicit ownership |
| Read-only resume | Current 0.2.0 instructions; plan and text access only, no project execution or workers | Checkpoint claims were qualified; UI independence and downstream holds were preserved | The updated workflow produced a bounded plan without claiming execution |
| Planner/package checks | Current 0.2.0 source, Node v22.14.0 on Windows | 22 tests passed | Scheduling, recovery state, CLI behavior, references, and copied-folder execution satisfy the checked invariants |
| Independent local review | Current planner, references, and tests; bounded local probes | No confirmed material defect reported; same 22 tests passed | A second inspection found no reproducible defect in the reviewed scope |

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
