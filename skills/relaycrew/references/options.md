# Options and task patterns

These are workflow preferences expressed in the user's prompt, not new host settings or guaranteed runtime controls. Use the defaults unless the task benefits from a change. The coordinator must still respect actual tool availability, permissions, and usage limits.

| Preference | Default | When to change |
| --- | --- | --- |
| Mode | auto | `solo` prevents delegation; `team` requests native workers where permitted; `review` separates implementation from a read-only review |
| Active workers | at most 2 | A larger independent queue can use more only within the host's capacity and the user's expressed budget |
| Brief target | 2,400 Unicode characters | Increase for a complex interface or essential constraints; never drop requirements just to meet a cap |
| Writer isolation | assume shared checkout | Use overlapping write claims only after verifying genuinely separate checkouts and planning integration |
| Review | proportional to the change | Add an independent reviewer for behavior that merits another perspective, or when requested |
| Checkpoint | conversation for short tasks | Use a local checkpoint for long work, interruption, or multiple waves |
| Model | host/user selection | Do not change models or providers unless requested or required by the host |

## Useful prompts

**Automatic team sizing**

> Use RelayCrew to implement this feature. Start by checking whether the work actually benefits from parallel workers. Preserve the existing stack and verify the finished result.

**Low coordination overhead**

> Use RelayCrew in solo mode. Keep a short task list and run the existing acceptance checks. Do not spawn workers.

**Two parallel workstreams**

> Use RelayCrew in team mode with at most two workers. Freeze the API contract before splitting server and interface work. Give the shared lockfile one owner, then check the integrated feature.

**Independent review**

> Use RelayCrew in review mode. Have the reviewer read the requirement and diff without the implementer's conclusions. Report concrete failures with evidence; if native delegation is unavailable, disclose that the review is a second pass by the same agent.

**Read-only investigation**

> Use RelayCrew to investigate two plausible causes of this bug. Workers may inspect source and run permitted read-only checks, but must not edit files. Combine the evidence before proposing a fix.

**Resume**

> Resume the verified tasks from this checkpoint. Hold work that depends on failed tasks. Stop and rebrief any worker before changing its file ownership.

## Checkpoint minimum

Store one small local artifact only when persistence helps. Record the original goal, immutable interface decisions, task IDs and ownership, verified completed tasks with evidence, failed tasks and useful partial edits, and the next acceptance check. Do not dump transcripts or credentials. In a planner JSON, `completed` and `failed` are task-ID arrays; see [planner format](planner.md). Treat state as a claim to verify against the actual workspace before resuming.

## When to stay solo

A single small edit, a chain whose next step needs the previous output, a shared mutable file with no sensible split, or a task dominated by one slow external operation can make coordination overhead larger than the benefit. An explicit user request for team mode still matters, but it cannot create missing capabilities or override host permissions.
