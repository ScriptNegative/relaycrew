# Optional planner

Node.js 18+; no package installation, API key, network call, or agent runtime. The CLI reads one JSON file and prints a proposed plan as JSON. UTF-8 input may include one leading byte-order mark, as produced by some Windows tools. It does not execute task checks, access project files, launch workers, or write state.

```sh
node skills/relaycrew/scripts/plan.mjs examples/feature.plan.json
node skills/relaycrew/scripts/plan.mjs examples/feature.plan.json --format markdown
node skills/relaycrew/scripts/plan.mjs examples/feature.plan.json --brief ui
node skills/relaycrew/scripts/plan.mjs examples/feature.plan.json --next --format markdown
```

```json
{
  "max_workers": 2,
  "max_brief_chars": 2400,
  "tasks": [
    {
      "id": "api",
      "goal": "Implement the agreed API contract",
      "context": "The response schema is already approved.",
      "reads": ["docs/api.md"],
      "writes": ["src/api", "tests/api"],
      "resources": [],
      "after": [],
      "checks": ["Run the API contract tests"]
    }
  ]
}
```

`id`, `goal`, and a non-empty `checks` array are required. Other task fields default to empty. `max_workers` defaults to 2 and must be an integer from 1 to 64; the host's lower limit still applies. `max_brief_chars` defaults to 2400. Oversized rendered capsules cause an error instead of truncation. Characters are Unicode code points, not model tokens, and exclude any history or host instructions.

Use literal repository-relative file or directory paths, with no glob syntax. A directory conflicts with its descendants; `.` claims the entire repository. Windows separators normalize to `/`, and comparisons ignore case conservatively. Absolute paths, parent traversal, URI-like paths, and wildcard claims are rejected. The planner does not resolve symlinks, hardlinks, mounts, or other aliases: declare the same canonical path or an exclusive resource name for aliased state. Resources are exclusive, case-insensitive names for shared mutable systems such as `test-database`.

Add `after` dependencies for semantic order. An overlap only prevents concurrent execution; it does not establish the intended order. Independent tasks keep their input order during a deterministic greedy schedule. A wave starts only after the coordinator verifies that required tasks succeeded. The static planner assumes completion to show later waves; after any failure, stop dependent work and replan from the verified state.

The output includes compatible `waves`, `briefs`, and conflicting task pairs with reasons. It rejects duplicate IDs, missing dependencies, self-dependencies, dependency cycles, malformed claims, and unknown fields. Claims are advisory, not a sandbox or locking mechanism. Safety depends on complete, honest claims and the coordinator enforcing them.

## Resume and failure holds

Add top-level `completed`, `failed`, and optional `in_progress` arrays of known task IDs. Only mark a task completed after inspecting its actual result and acceptance checks. A completed task's prerequisites must also be completed. State arrays must be disjoint. Failed tasks and all their transitive dependents are held out of scheduling; unrelated work remains eligible. Cycles are rejected even if their tasks are marked failed.

`in_progress` reserves worker slots, file claims, and exclusive resources. Active tasks need completed prerequisites, must fit within `max_workers`, and must be mutually compatible. The planner rejects contradictory active state rather than ignoring it. `--next` can fill remaining slots with compatible ready tasks without redispatching a still-running peer. Unknown worker status remains active until the coordinator confirms it stopped. For durable task/attempt tracking and reviewable completion, use [session checkpoints](sessions.md) instead of editing these state arrays.

The output lists `completed`, `failed`, and `blocked` tasks. Briefs and conflict explanations cover only eligible pending work, so historical or held capsules do not consume its briefing budget. `--brief ID` prints a capsule only for a task in the next runnable wave; update verified state before requesting later work. Its error distinguishes a genuinely unknown ID from a completed, failed, blocked, or later-wave task. Remove a failed ID only when intentionally retrying it after inspecting partial edits and resolving ownership. A JSON state record is not proof that tests passed.

`--format markdown` prints a compact human-readable schedule; JSON is the default. `--brief` and `--format` are mutually exclusive. `--help` prints usage. Invalid inputs exit nonzero with no plan on stdout. The CLI only reads the specified input; it never executes strings in the goal, context, or checks fields.

## Retrieve the next handoff

`--next` returns a single bundle containing only the first pending compatible wave. Add `--format markdown` to read the capsules directly, or keep the default JSON for a host integration. `--format` may come before or after `--next`; `--next` and `--brief` are mutually exclusive.

The JSON fields are `status`, `max_workers`, `max_brief_chars`, `task_ids`, `completed`, `failed`, `blocked`, and `briefs`. Task IDs and capsules preserve next-wave order. The status is:

- `ready`: at least one task is eligible for the next wave, even if unrelated failed work is held.
- `waiting`: no new task can start while recorded active work reserves capacity, claims, or prerequisites.
- `held`: no task can proceed and failed or blocked tasks remain.
- `complete`: the recorded plan state marks every task completed.

These labels describe the supplied checkpoint and declared plan. They do not independently verify the workspace or dispatch a worker. Recheck the state and ownership before handing off the capsules.

The pure `next(input)` export returns the same JSON bundle. `validate(input)` validates without rendering capsules and returns normalized tasks, limits, and all three state arrays. JSON result schemas stay unchanged when `in_progress` is absent; supplying it adds `in_progress` to both plan and next results.

Ordinary `plan(input)` returns a projection of future waves and all eligible pending briefs. Active tasks never appear as new dispatches or briefs; conflict diagnostics still include their declared claims. With active work, its first wave contains only additional dispatches allowed **now**, possibly an empty array meaning wait. Later waves assume active work and those first dispatches succeeded. Always use `--next` with fresh state for actual dispatch; projected waves are not a runtime queue.

Capsule caps apply to what you request: every pending brief for a full plan, the next wave for `--next`, and only the selected current-wave capsule for `--brief ID`. A long future brief does not prevent retrieving a valid current handoff; nothing is silently truncated.
