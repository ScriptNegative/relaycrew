# Optional session checkpoints

Use this when work must survive a coordinator restart, tasks finish at different times, or a failed task needs a new attempt. For a short run, the instruction workflow or planner state arrays are sufficient. Requires Node.js 18+, built-ins only. No server, account, network, agent runtime, or package installation.

The helper writes only the explicitly selected checkpoint and temporary sibling files. It never starts, stops, or watches a worker, inspects project changes, or executes a check. Native delegation and verification remain the coordinator's job.

## Start with an unchanged plan

Use the [planner task schema](planner.md), leaving `completed`, `failed`, and `in_progress` absent or empty. A checkpoint owns its task state; mixing legacy state arrays with it is rejected. Existing planner commands remain independent.

```sh
node <skill-dir>/scripts/session.mjs init plan.json checkpoint.json
node <skill-dir>/scripts/session.mjs next plan.json checkpoint.json
```

`init` creates a new checkpoint without overwriting an existing file. `next` is read-only and returns the next handoff bundle, plan hash, session ID, current revision, and active attempts. Calling it repeatedly does not reserve work: record `start` before launching each worker. Keep a single authoritative checkpoint per run; copying it forks the coordination state. Keep private checkpoints out of version control; the helper does not change your project's ignore rules.

The definition fingerprint covers normalized tasks (including goals, context, dependencies, claims, and checks), their order, and planner limits. Changed definitions are rejected even when task IDs are unchanged. The fingerprint does **not** detect source edits, changed environments, or stale test evidence. After a plan change, confirm all old workers stopped, inspect partial work, and create a new checkpoint at a new path with a deliberately revised plan. There is no automatic import of completed work or reconciliation in v0.4.

## Reserve before dispatch

Save an event as JSON, for example `event.json`:

```json
{"type":"start","task_id":"api","worker":"api-worker-1"}
```

```sh
node <skill-dir>/scripts/session.mjs apply plan.json checkpoint.json event.json --revision 0
```

Use the revision you just read; each successful mutation increases it by one. `apply` returns the updated checkpoint. Retrieve the task's generated `attempt_id`, then dispatch its handoff plus task ID and attempt ID through your actual host. `worker` is your label, not a verified host identity. A failed native launch still holds its reservation until you confirm it never started and record a failure.

If another coordinator changes the checkpoint, your old revision is rejected. Read the current state and reassess the event; do not blindly retry it with a new revision.

Running and reported attempts reserve both a worker slot and their declared paths/resources. Independent work can fill remaining slots as soon as accepted prerequisites permit it. `next` returns `waiting` when active reservations prevent further work; it never redispatches them. A missing worker or timeout does not release ownership.

## Report, inspect, accept

Require a concise result associated with its current attempt:

```json
{
  "type": "report",
  "task_id": "api",
  "attempt_id": "COPY_THE_CURRENT_ATTEMPT_UUID",
  "report": {
    "summary": "Implemented the agreed API contract",
    "changed_paths": ["src/api/index.mjs"],
    "checks": [
      {"check":"Run the API contract tests","outcome":"passed","evidence":"Include the actual command and observed result here"}
    ]
  }
}
```

Replace the example values with the actual task, attempt, paths, and evidence. Every declared check must appear exactly once with outcome `passed` or `failed` and nonempty evidence. Changed paths must be literal repository-relative paths within declared writes. These validations only check the report's shape and claims. They cannot discover unreported edits, hidden side effects, path aliases, or false evidence. Avoid storing credentials, full logs, or private transcripts.

Apply the report using the current revision. A returned report remains `reported`, keeping its reservation. Inspect the real diff, reproduce the acceptance checks, and confirm the worker stopped before recording:

```json
{"type":"accept","task_id":"api","attempt_id":"COPY_THE_CURRENT_ATTEMPT_UUID","worker_stopped":true,"review":"Describe the diff and checks you actually verified"}
```

Acceptance requires a reported attempt, all reported checks passed, explicit stopped confirmation, and review text. It records `completed` and releases ownership; dependents may then become ready. `worker_stopped: true` is the coordinator's assertion, not an operating-system check.

## Interrupted or failed attempts

An interrupted process can still be writing. Keep its reservation until the native host confirms it stopped. Once stopped, inspect its partial work and record:

```json
{"type":"fail","task_id":"api","attempt_id":"COPY_THE_CURRENT_ATTEMPT_UUID","worker_stopped":true,"reason":"Explain the observed failure or confirmed cancellation"}
```

This holds failed dependents while unrelated work can proceed. After fixing the cause and deciding how to reuse or remove partial work, make the task pending with:

```json
{"type":"retry","task_id":"api","attempt_id":"COPY_THE_FAILED_ATTEMPT_UUID"}
```

The next `start` generates a new attempt UUID. A late report from the previous attempt is rejected. This fences checkpoint updates; it does not stop an old process from changing files. Always stop the old writer before retrying.

## Filesystem recovery and limits

Checkpoint updates use an exclusive sibling `.lock`, an expected revision, a flushed temporary file, and atomic replacement. Initialization publishes a completed file through an exclusive same-directory hard link; unsupported filesystems fail rather than overwriting. Read-only `next` can run while a writer holds the lock. These safeguards coordinate cooperating processes on a filesystem with normal exclusive-create, hard-link, and rename semantics; they are not a distributed lock or a power-loss durability guarantee. Do not use synchronized copies as independent authorities.

If the CLI itself crashes during an update, the checkpoint remains old or new complete JSON; a `.lock` or `.tmp-UUID` may remain. Confirm **all checkpoint writers** stopped before removing the exact stale lock or temporary file. Do not remove an active writer's lock. Read the checkpoint and its revision again; do not assume an interrupted event failed. Removing a lock does not release running task reservations. The CLI does not automatically expire locks or workers. Symlink checkpoints are rejected; manual edits and noncooperating writers can bypass the protocol.

## API and states

`session-core.mjs` exports in-memory `createSession(plan)`, `sessionNext(plan, checkpoint)`, and immutable `transition(plan, checkpoint, event, expectedRevision)`. None performs file I/O. `session.mjs` exports `initFile(planPath, checkpointPath)`, `nextFile(planPath, checkpointPath)`, and `applyFile(planPath, checkpointPath, eventPath, expectedRevision)`.

| Current state | Event | Result |
| --- | --- | --- |
| pending and dispatchable | start | running, new attempt UUID, reservation held |
| running, matching attempt | report | reported, reservation still held |
| reported with passed checks | accept + stopped confirmation | completed, reservation released |
| running or reported | fail + stopped confirmation | failed, reservation released, dependents held |
| failed, matching attempt | retry | pending, old attempt rejected |

All other transitions, unknown fields, malformed state, stale revisions, and mismatched attempts fail without a checkpoint update. This is a local coordination aid, not an authentication boundary: anyone able to edit a checkpoint can invent state.
