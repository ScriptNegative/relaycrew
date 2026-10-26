# Host notes

Use the host's documented native delegation capabilities as exposed in the current session. Tool names and availability vary; do not assume that an example API exists.

## Codex

Copy this entire `relaycrew` folder into the target project's `.agents/skills/` directory. Invoke `$relaycrew` with the task. Use native subagents if enabled and authorized. Request fresh worker contexts if supported; inherited history can outweigh a short capsule. Shared working directories need exclusive write ownership. Worktrees help only if the workers are actually attached to separate checkouts. Do not change global agent settings merely to activate this workflow.

Official references: [skills](https://learn.chatgpt.com/docs/build-skills), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Claude Code

Copy this entire `relaycrew` folder into the target project's `.claude/skills/` directory. Invoke `/relaycrew` with the task. Prefer native subagents for bounded work and use the tools currently exposed by the session. A persistent Agent Team is unnecessary for a small finite queue. Do not enable experimental features, add hooks, or create custom agents by default. Cloud sessions may load skills differently; follow the current host documentation instead of assuming local installation applies.

Official references: [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents).

## ChatGPT

The standard folder is the authoring unit. Standalone skills are supported in the ChatGPT desktop app; skills distributed as plugins can also be available across Chat and Work on web, desktop, and mobile. Follow the account's supported skill/plugin installation flow and select the installed skill with `@`. This GitHub repository is not automatically a published ChatGPT directory plugin, and a ZIP alone does not grant tools or enable background workers. Public plugin-directory availability requires the platform's separate distribution/review process.

When the ChatGPT session can access the project and execute code, use those actual tools. In a session limited to supplied text or files, use the planning or review parts and clearly label execution gaps. Do not claim that a normal chat has spawned independent agents or modified a repository.

Official references: [build skills](https://learn.chatgpt.com/docs/build-skills), [plugins](https://learn.chatgpt.com/docs/plugins).

## VS Code with GitHub Copilot

Project Agent Skills can be placed in `.agents/skills/relaycrew/`. Confirm discovery through the host's skills UI before relying on automatic activation. Delegation remains a separate host capability. See the [Agent Skills quickstart](https://agentskills.io/skill-creation/quickstart).

## OpenCode

Use `.opencode/skills/relaycrew/`, or the documented `.agents/skills/` compatibility location. The native skill mechanism loads `SKILL.md` on demand. Use delegation only if the current session exposes it; otherwise work sequentially. See [OpenCode Agent Skills](https://opencode.ai/docs/skills/).

## Other hosts or delegation unavailable

Load `SKILL.md` through the host's supported mechanism. Run the workflow sequentially when native delegation is unavailable or disallowed. Distinguish separate reasoning passes in one agent from independent worker execution. The optional planner works offline, independently of any host.
