# Host notes

Use the host's documented native delegation capabilities as exposed in the current session. Tool names and availability vary; do not assume that an example API exists.

## Codex

Copy this entire `relaycrew` folder into the target project's `.agents/skills/` directory. Invoke `$relaycrew` with the task. Use native subagents if enabled and authorized. Request fresh worker contexts if supported; inherited history can outweigh a short capsule. Shared working directories need exclusive write ownership. Worktrees help only if the workers are actually attached to separate checkouts. Do not change global agent settings merely to activate this workflow.

Official references: [skills](https://learn.chatgpt.com/docs/build-skills), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Claude Code

Copy this entire `relaycrew` folder into the target project's `.claude/skills/` directory. Invoke `/relaycrew` with the task. Prefer native subagents for bounded work and use the tools currently exposed by the session. A persistent Agent Team is unnecessary for a small finite queue. Do not enable experimental features, add hooks, or create custom agents by default. Cloud sessions may load skills differently; follow the current host documentation instead of assuming local installation applies.

Official references: [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents).

## Other hosts or delegation unavailable

Load `SKILL.md` through the host's supported mechanism. Run the workflow sequentially when native delegation is unavailable or disallowed. Distinguish separate reasoning passes in one agent from independent worker execution. The optional planner works offline, independently of any host.
