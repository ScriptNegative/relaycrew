---
name: relaycrew
description: Coordinate coding work with a small, context-bounded agent team. Use for independent investigations, multi-part changes, or implementation followed by independent review; choose solo execution for small or tightly coupled tasks.
license: MIT
metadata:
  author: ScriptNegative
  version: "0.1.0"
---

# RelayCrew

Spend context on the work, and add workers only when they have independent work to do.

## Choose the smallest useful team

Inspect enough of the project to identify the acceptance checks and shared interfaces. Keep a small fix or a dependent chain in the main agent. For separable work, retain one coordinator and start with at most two active workers, within the host's actual capacity and the user's budget. A larger queue can run in waves; more workers are not a quality metric.

Use native delegation only when available and permitted by the host and the user's instructions. Otherwise execute the same tasks sequentially and report solo mode. Never invent agents, tool names, or isolation. This skill does not grant permission to publish, deploy, buy services, alter access, or contact other people.

Read [host notes](references/hosts.md) only when choosing how to delegate in Codex or Claude Code. Do not install an agent runtime to make the skill work.

## Make ownership explicit

Before dispatch, give each task an ID, a concrete outcome, dependencies, read paths, write paths, and observable acceptance checks. Declare shared mutable resources such as a database or generated index too. Resolve interface decisions before splitting their consumers.

Workers sharing a checkout must not overlap write/write or write/read claims. Two readers can overlap. Treat a directory claim as covering descendants; include lockfiles, generated files, tests, and configuration in ownership. Verify actual isolation before allowing overlapping edits in separate checkouts. Combine changes through the coordinator and check the combined result.

For several tasks, optionally run `node <skill-dir>/scripts/plan.mjs <plan.json>`. Read [planner format](references/planner.md) only when using it. It schedules declared claims; it neither launches agents nor enforces filesystem isolation. For a simple split, keep the plan in conversation instead.

## Relay a brief, not the entire conversation

Give each worker this capsule, normally within 2,400 characters. The cap is a briefing target, not a token or spending limit; preserve necessary detail rather than silently truncating it.

```text
Task: ID and outcome
Context: relevant decisions, paths, and interface facts
Read: paths needed to investigate
Write: exclusive paths, or none
Resources: shared mutable resources, or none
Done when: observable checks
Return: changed paths; evidence and checks; blockers; follow-up needed
```

Include relevant repository rules and inherited user constraints. Let workers read permitted source files directly. Prefer a fresh context when the host supports it; if history is inherited, disclose that the briefing cap does not bound total context. Do not copy secrets, full logs, or unrelated history into a capsule. Workers must request an ownership change before editing outside their claim. Keep delegation flat unless deeper delegation is explicitly justified and permitted.

## Integrate evidence before continuing

Run only ready tasks with compatible ownership. A planned wave is not a runtime guarantee: a worker timeout, failed check, partial edit, or changed interface invalidates dependent work. Inspect the actual diff, update the plan, and resume only the affected tasks after prerequisites are verified. Preserve useful partial work; do not retry an unchanged failure repeatedly.

Ask workers for concise evidence with file locations and actual check results. A worker saying "done" is not proof. Reconcile disagreements against source and reproducible behavior. For an independent review, pass the requirement and resulting diff without the implementer's conclusions; findings must identify a concrete failure or missing check.

The coordinator checks the integrated change against the user's original acceptance criteria, then reports the outcome, checks, limitations, and whether delegation was actually used. Report token or cost savings only when measured against a disclosed baseline. The brief cap, worker count, and instruction size do not establish savings.
