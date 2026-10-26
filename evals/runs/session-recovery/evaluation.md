# Independent public-CLI evaluation: coordinator recovery

The documented recovery flow worked in this evaluation. No functional failure was observed in the covered path. The CLI maintained reservations across fresh process reads, admitted docs after API acceptance, required failure before retry, required explicit stopped confirmation for failure, and rejected the former UI attempt's late report.

## Scope and evidence

Read only `SKILL.md`, `references/planner.md`, and `references/sessions.md`; did not read implementation or tests. Used Node v22.14.0 and the public `plan.mjs` / `session.mjs` CLI. The plan has two slots: api writes `src/api`; ui writes `src/ui`; docs reads `src/api`, writes `docs/api.md`, depends on api; review reads both source directories, depends on api/ui. Check names match the request.

Executed 22 CLI commands. All reports, review claims, worker labels, stop confirmations, and partial work were **synthetic fixtures**. No actual worker was launched, no source was changed or inspected, and no API/UI/integrated tests were run. The coordinator restart was simulated by discarding contact knowledge and re-reading the checkpoint in fresh CLI processes; the driver itself was not terminated. This tests durable bookkeeping, not native host recovery.

## Observable commands and results

These examples use repository-relative paths. `E` stands for `evals/runs/session-recovery`; the complete argument arrays, output, exit codes, and per-command checkpoint snapshots are saved locally.

```text
node skills/relaycrew/scripts/plan.mjs E/plan.json --next
node skills/relaycrew/scripts/session.mjs init E/plan.json E/checkpoint.json
node skills/relaycrew/scripts/session.mjs next E/plan.json E/checkpoint.json
node skills/relaycrew/scripts/session.mjs apply E/plan.json E/checkpoint.json E/<event>.event.json --revision <current>
```

| Observation | Actual result |
|---|---|
| Initial next | `ready`, tasks `[api, ui]`; both starts succeeded, revision 2 |
| Synthetic API report | Success, revision 3; next remained `waiting`, active api=`reported`, ui=`running` |
| Synthetic API review + accept | Success, revision 4; next `ready`, tasks `[docs]`, active ui=`running` |
| Start docs | Success, revision 5; next `waiting`, active `[ui, docs]` |
| Restart read | Preserved session ID, plan hash, revision 5, and both active attempts; no redispatch |
| Retry ui while stopping unconfirmed | Exit 1: `RelayCrew: ui: only a failed attempt can retry`; checkpoint unchanged |
| Fail ui with `worker_stopped:false` | Exit 1: `RelayCrew: ui: worker_stopped must be true after confirming the worker stopped`; checkpoint unchanged |
| Synthetic host stop + partial-work inspection, then fail | Success, revision 6; ui failed, review blocked on ui, docs still active |
| Retry ui, then next | Success, revision 7; next `ready`, tasks `[ui]`, docs still active |
| Start replacement ui | Success, revision 8; attempt number 2, fresh UUID |
| Late report from former ui attempt | Exit 1: `RelayCrew: ui: obsolete or unknown attempt_id`; checkpoint unchanged |
| Final next | `waiting`; api completed, replacement ui and docs running, review pending |

The synthetic UI partial-work fixture was retained and its disposition recorded before failure/retry. No source files were needed for this fixture-only scenario.

## Usability observations

- `session.mjs --help` is only a one-line syntax reference. The public session document was sufficient to complete the scenario, but users need it for event schemas and correct recovery order.
- The retry error accurately rejects the running attempt, but does not explain the next steps (confirm stop, inspect partial work, record `fail`, then `retry`). That sequence is available in the documentation.
- Resuming requires reading `next` plus checkpoint state and manually carrying revision / attempt IDs into event files. There is no automatic worker reconnection or proof of stop; the docs correctly describe those limits.
- `next` remains `waiting` while unrelated docs is active even when ui has failed; the `failed` and `blocked` fields expose the held work. Consumers should inspect these fields, not just the top-level status.
- Successful synthetic acceptance demonstrates that the helper checks evidence structure and coordinator assertions. It does not validate the real diff, tests, or native host state, as documented.

## Published artifacts

- [Declared plan](plan.json) and [final checkpoint](checkpoint.json).
- [Machine-readable results](results.json).
- [Sanitized command transcript](transcript.json), containing actual arguments, stdout, stderr, and exit codes. Machine-specific paths have been replaced with repository-relative locations; the individual stdout/stderr filenames are source-record identifiers, not separately distributed files.

Event inputs, per-command snapshots, synthetic context, and evaluation drivers were retained in the local evaluation workspace; only the artifacts linked above are distributed here. The retry rejection message was subsequently expanded with the documented recovery sequence; the transcript preserves the message actually observed before that wording improvement.
