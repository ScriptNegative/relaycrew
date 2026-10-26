# Parallel AI coding. Clear ownership.

Your coding agents can work in parallel. Help them finish one coherent change.

RelayCrew turns a coding request into focused handoffs, explicit file ownership, and a plan you can inspect. Keep the assistant you already use. Add the skill when coordination is the hard part.

**Primary action: Try the 30-second example**

**Secondary action: Download the skill**

## When more agents create more cleanup

Two workers change the same lockfile. An implementation misses a shared decision. Documentation starts before the API works. You spend the last part of the task reconciling work that should have fit together.

Starting workers is easy. Giving them compatible work and a reliable handoff takes more care.

## A small coordination layer for your existing workflow

RelayCrew helps the coordinating agent decide what can run together, what should wait, and what evidence is needed before moving on. Small tasks stay solo. Independent tasks can use a small native team. Failed prerequisites hold the work that depends on them.

The core is a portable Markdown skill. The optional planner runs offline with Node.js built-ins. There is no RelayCrew service account, API key, server, or background process.

## See the boundary before the conflict

```text
API dependency update ─┐
                      ├─ shared lockfile → separate waves
UI dependency update ─┘

Documentation with separate files → can proceed alongside API work
```

The planner explains the declared overlap before dispatch. It does not lock files or discover side effects you did not declare.

## Try it now

```sh
git clone https://github.com/ScriptNegative/relaycrew.git
cd relaycrew
node skills/relaycrew/scripts/plan.mjs examples/shared-lockfile.plan.json --format markdown
```

Want to use the workflow with your assistant? Copy the complete `skills/relaycrew` folder into the host's supported skill directory and ask RelayCrew to coordinate a task you already need to finish.

**Get started on GitHub → https://github.com/ScriptNegative/relaycrew**

## Choose the workflow the task needs

- **Automatic:** stay solo or create a small team based on the actual task.
- **Team:** use native workers with separate ownership when the host permits it.
- **Review:** separate implementation from an independent read-only review when available.
- **Solo:** keep the handoff and verification discipline without spawning workers.
- **Resume:** record verified progress, hold failed dependencies, and continue unrelated work.

## Built to fit, with clear limits

Use the same Agent Skills package across compatible hosts. Codex and Claude Code have documented project installation paths; ChatGPT skill and plugin availability depends on the surface and account. Other agents need Agent Skills support or a manual instruction-loading workflow. Native tools remain a host capability.

Planner tests and the published coding fixtures provide concrete starting evidence. They do not prove faster execution, lower cost, or better results on every repository. See the evaluation report and run your own task before relying on it.

## Make the next workflow better

Try a real task. Tell us the task split, assistant version, checks, and what became easier or harder. Small reproducible reports and useful workflow examples help more than a vague endorsement.

**Try the example. Bring back one useful observation.**
