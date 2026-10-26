![RelayCrew: small teams, focused context](assets/banner.svg)

# RelayCrew

**A lightweight coding skill for small AI teams, focused handoffs, and fewer file conflicts.**

Give the API and UI work to separate agents. Keep edits to the same file in sequence. Send a short brief to each worker, then verify the combined result. RelayCrew brings that workflow to Codex and Claude Code without a new agent framework.

The core skill is plain Markdown. The optional offline planner uses Node.js built-ins only. No package install, service account, API key, hooks, or background process is required by RelayCrew. Your coding assistant still uses its normal subscription or API allowance.

## Try the planner in 30 seconds

```sh
git clone https://github.com/ScriptNegative/relaycrew.git
cd relaycrew
node skills/relaycrew/scripts/plan.mjs examples/feature.plan.json
```

The example describes a search feature. Its proposed waves are:

```text
Wave 1   api + ui       Separate writes, shared frozen contract
Wave 2   docs           Reads the completed API
Wave 3   review         Reads the integrated result
```

The JSON output also explains conflicting claims and renders a compact brief for each task. The example is a planning fixture; it does not implement a search application or launch agents.

## Install the skill

Copy the **entire** [`skills/relaycrew`](skills/relaycrew) directory into your project's skill directory:

| Assistant | Destination | Invoke |
| --- | --- | --- |
| Codex | `.agents/skills/relaycrew/` | `$relaycrew` |
| Claude Code, local project | `.claude/skills/relaycrew/` | `/relaycrew` |

For example, from the target project on macOS or Linux, after cloning RelayCrew alongside it:

```sh
mkdir -p .agents/skills
cp -R ../relaycrew/skills/relaycrew .agents/skills/
```

PowerShell, for Codex:

```powershell
New-Item -ItemType Directory -Force .agents/skills | Out-Null
Copy-Item -Recurse ../relaycrew/skills/relaycrew .agents/skills/
```

For Claude Code, replace `.agents/skills` with `.claude/skills`. If the destination already exists, review and replace that folder deliberately; do not nest another copy inside it. Restart or reload skills as required by your host. Cloud sessions may use different loading rules; see [host notes](skills/relaycrew/references/hosts.md).

Then ask:

```text
Use RelayCrew to implement this feature. Use at most two workers when native
delegation is available and permitted. Agree on shared interfaces first,
assign exclusive write paths, and verify the integrated result.
```

## What makes it useful

- **A team sized to the work.** Small fixes stay solo. Larger queues run in bounded waves.
- **Context capsules.** Workers receive relevant paths, decisions, and acceptance checks, rather than copied transcripts.
- **Read/write awareness.** The planner separates conflicting file claims, including directory descendants, and exclusive shared resources.
- **Evidence at handoff.** Dependent tasks resume after verified results; failures require replanning.
- **Portable fallback.** The same workflow runs sequentially if native delegation is unavailable.

There are no fixed personas, model recommendations, or recursive swarms. Workers are defined by the task they need to complete.

## Limits and validation

RelayCrew is an instruction workflow with an optional static planner. It does **not** provide filesystem locks, an agent runtime, or a hard token budget. The planner trusts declared claims, cannot detect undeclared side effects or path aliases, and does not execute checks. File overlap determines concurrency, while `after` determines semantic order. The coordinator must enforce ownership and verify success before dispatching dependent tasks.

The default two-worker ceiling and 2,400-character capsules are adjustable guidance. They do not prove lower token use, lower cost, or faster execution. No comparative model benchmark or live Claude Code delegation run is claimed for this release.

Run the dependency-free tests with Node.js 18+:

```sh
node --test tests/plan.test.mjs
```

Tests cover scheduling, dependency cycles, read/write conflicts, directory claims, shared resources, Windows path normalization, malformed inputs, capsule limits, and the CLI example. These validate the planner, not model behavior. See the [planner format](skills/relaycrew/references/planner.md) and [behavioral evaluation cases](evals/README.md).

## Contribute a real workflow

Try it on a task you already need to do. Open an issue with the assistant and version, task split, observed result, and a minimal example. Remove private source and credentials. Useful early contributions include reproducible scheduling bugs, examples where solo execution was better, and measured comparisons with a stated baseline.

If it helps your workflow, a star makes the project easier to find again. Feedback and usable examples matter more than a badge.

## En español

RelayCrew coordina equipos pequeños de asistentes de programación: reparte tareas independientes, limita el contexto de cada encargo y evita ediciones simultáneas incompatibles. Funciona con Codex y Claude Code cuando el entorno permite delegar; si no, trabaja de forma secuencial. La skill principal es Markdown y el planificador opcional no necesita dependencias ni claves API.

## License and references

MIT · [ScriptNegative](https://github.com/ScriptNegative).

Packaging follows the [Agent Skills specification](https://agentskills.io/specification). Host installation follows the official [Codex skills](https://learn.chatgpt.com/docs/build-skills) and [Claude Code skills](https://code.claude.com/docs/en/skills) documentation. RelayCrew is an independent project, with no affiliation or endorsement implied.
