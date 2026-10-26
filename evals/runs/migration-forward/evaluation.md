# Public CLI evaluation: reviewed plan migration

The requested workflow succeeded in a synthetic local session. The reviewed migration retained the unrelated accepted UI receipt, invalidated the revised API and its dependent documentation, removed the failed spike, and added the review task. Stale revision requests and obsolete API reports were rejected without modifying the checkpoint. A separate copy with a recorded running spike refused both comparison and migration.

## Scope and method

This evaluation used RelayCrew skill metadata version 0.5.0, `SKILL.md`, `references/planner.md`, `references/sessions.md`, and the public `scripts/session.mjs` CLI. Node.js was v22.14.0. No implementation, project README, or product tests were read. No network, installation, publication, actual workers, or real project work was used.

Every worker label, report, check outcome/evidence, coordinator review, and stopped assertion in these fixtures is explicitly **SYNTHETIC**. The CLI executed; the reported project acceptance checks did not. This establishes bookkeeping behavior, not actual implementation correctness or worker termination.

`old-plan.json` defines independent `api`, `ui`, and `spike` tasks, with `docs` after `api`. At baseline revision 12, API, UI, and docs have synthetic accepted receipts; spike has a synthetic failed report and failure. `new-plan.json` changes the API goal, contract read path, and checks; leaves UI and docs definitions unchanged; removes spike; and adds review after both API and docs.

## Observed adoption

| Task | Baseline | Immediately after migration | Receipt/counter behavior |
| --- | --- | --- | --- |
| api | completed, attempt 1 | pending, attempt 1 | Old UUID, report, worker, failure, and review cleared |
| ui | completed, attempt 1 | completed, attempt 1 | Entire task record retained identically |
| docs | completed, attempt 1 | pending, attempt 1 | Reset because API prerequisite changed; old receipt cleared |
| spike | failed, attempt 1 | absent | Removed from checkpoint |
| review | absent | pending, attempt 0 | New task without a receipt |

The read-only `compare` at revision 12 exited 0 and preserved the checkpoint SHA-256. It returned `kept_completed: ["ui"]`, `kept_failed: []`, resets for API and docs, `added: ["review"]`, and `removed: ["spike"]`. Its doc reset reasons explicitly identified API prerequisite retention and definition changes. The reviewed `migrate` exited 0, retained the session ID and format 1, bound the new plan hash, and advanced revision exactly once to 13.

The current API could run next at revision 13. After its second synthetic attempt was reported and accepted, docs could run at revision 16. After docs' second synthetic attempt was accepted, review could run at revision 19. UI was not redispatched. The final main checkpoint intentionally stops at review readiness; no review worker was launched.

## Rejections and checkpoint integrity

All seven negative CLI commands exited **1**, emitted no JSON result, and preserved both revision and exact checkpoint SHA-256. Full before/after digests and stderr are in `results.json` under `failure_integrity`, with command-level records in `transcript.json`.

| Command label | Revision before/after | Observed error |
| --- | --- | --- |
| direct-new-plan-rejected | 12 / 12 | Plan definition changed or checkpoint hash invalid |
| stale-revision-rejected | 12 / 12 | Stale revision: expected 11, current 12 |
| active-copy-compare-rejected | 14 / 14 | Cannot migrate active or reported work: spike |
| active-copy-migrate-rejected | 14 / 14 | Cannot migrate active or reported work: spike |
| old-plan-rejected-after-migration | 13 / 13 | Plan definition changed or checkpoint hash invalid |
| old-api-report-rejected-before-restart | 13 / 13 | api: obsolete or unknown attempt_id |
| old-api-report-rejected-after-restart | 14 / 14 | api: obsolete or unknown attempt_id |

The stale migration used the preview's matching new-plan hash and a reviewed request, but supplied expected revision 11 while the actual checkpoint was at 12. The valid request at revision 12 then succeeded; the stale failure did not consume a revision.

The obsolete API report was first submitted after migration reset the task, then submitted again after starting API attempt 2. Both were rejected. Attempt 2 had a different generated UUID. The second rejection happened with the current revision and current plan, isolating the obsolete attempt ID from stale-revision and plan-mismatch failures.

For the separate fork, the baseline copy retried and started spike under the old plan, reaching revision 14 with spike recorded running. `next` using the old plan exited 0 and returned `waiting`, no new task IDs, and spike in `in_progress`/`active`. Both `compare` and `migrate` rejected the proposed plan even though it removes spike and the request contains the synthetic `workers_stopped: true` assertion. The copy remains at revision 14 with its reservation intact. It was not merged back into the main authority. No real worker was running; this was a deliberate checkpoint-state simulation.

## Observed usability findings

1. **Changed-plan error omits the migration route and suggests starting a new session.** Both trying the proposed plan before migration and the old plan afterward produced: `Plan definition changed or checkpoint plan_hash is invalid; reconcile stopped workers before starting a new session`. The main checkpoint had no active attempts in either case, and a reviewed migration successfully retained UI immediately afterward. The message does not name `compare`/`migrate` or explain that an already migrated checkpoint requires the new plan. This makes the preservation workflow harder to discover from the CLI. Suggested improvement: point to the reviewed migration commands and distinguish a supplied-plan mismatch from actual checkpoint hash invalidity.

2. **The read-only compare failure is worded as a migration failure.** `compare` with the active spike copy emitted `Cannot migrate active or reported work: spike`. The remainder correctly instructs the coordinator to confirm stopped workers and accept/fail their current attempts using the old plan. The opening wording obscures why a preview was refused. Suggested improvement: explicitly say that comparison is blocked until active state is resolved. This refusal is documented behavior; this finding concerns the diagnostic wording, not a discovered safety failure.

No functional defect was observed in this scenario. The evaluated guards matched the public session reference. Workspace freshness, actual stopped status, hidden edits, false evidence, and competing operating-system processes were not tested or implied by the synthetic receipts.

## Evidence and reproduction

The complete scenario contains 36 public CLI calls: 29 exit 0 and seven expected exit 1. `transcript.json` records their ordered argument arrays, relative working directory, actual exit codes, stdout/stderr, parsed results, before/after checkpoint digests, and revisions. `results.json` contains the baseline, preview, migration output, immediate and final state, active copy, attempt IDs, and failure integrity summary. `outputs/` contains one record per call. `events/` contains the synthetic event/request inputs; the reviewed migration request is `migration-request.json`. `snapshots/` preserves baseline, immediate migration, active held copy, and final checkpoint. The two plan files and current checkpoint files are also retained.

All saved paths are relative or use the public `<skill-dir>` placeholder. To reproduce, place `run-evaluation.mjs` in an empty output directory, set `RELAYCREW_SKILL_DIR` to the skill directory, and run `node run-evaluation.mjs`. The driver uses public CLI subprocesses only, generates all synthetic inputs, and refuses unexpected exit codes or a changed checkpoint after a rejection. Run `node verify-evidence.mjs` alongside its outputs to check retained records, cleared receipts, readiness, rejection integrity, and saved-artifact path sanitization.

An initial evaluator setup mistake assumed `checkpoint.tasks` was an object; the CLI output showed it is an array. Four CLI calls had succeeded before that harness exception. Those preliminary artifacts are preserved under `preflight/`, and `preflight-notes.json` records the correction. This was an evaluator error, not a RelayCrew failure. The complete scenario above was then executed independently from a fresh checkpoint.

## Publication note

The two diagnostic wording findings were addressed before release: changed-plan errors now point to the matching plan and reviewed `compare`/`migrate` route, and active-work errors explicitly name both comparison and migration. The transcript preserves the messages actually observed during this run. The underlying state transitions were not changed by those wording corrections.
