# RelayCrew positioning

## The problem worth owning

Developers can already start multiple coding agents. The frustrating part is making those agents finish one coherent change: a shared file gets edited twice, a worker misses an interface decision, or a downstream task proceeds after its prerequisite failed. The target user is a developer already using an assistant on a repository, not someone shopping for a new autonomous-agent platform.

RelayCrew's job is to make a small team's boundaries and handoffs explicit. The portable skill guides execution; an optional offline planner turns declared dependencies, file ownership and failure state into inspectable waves. The user keeps their existing coding assistant and workflow.

## Recommended public message

**Parallel AI coding. Clear ownership.**

Turn one coding request into focused handoffs and a coordinated result. RelayCrew is a portable Agent Skill with an optional offline planner for overlapping edits, dependencies, and interrupted work.

GitHub description:

> Coordinate parallel AI coding with clear file ownership, focused handoffs, and failure-aware task plans. A portable Agent Skill with an optional offline planner.

This is the best initial positioning hypothesis because it names a familiar problem, describes a concrete outcome, and can be demonstrated with a lockfile conflict in under a minute. It does not require a speed claim we have not measured. It should be tested against real visitor behavior, not treated as proven market demand.

## Ten alternatives

| # | Positioning | Best audience | Growth potential and weakness |
| --- | --- | --- | --- |
| 1 | Parallel AI coding. Clear ownership. | Existing multi-agent users | Strong initial hypothesis: specific and demonstrable; must explain advisory ownership |
| 2 | Keep your coding agents on the same page. | Developers trying teams for the first time | Clear and approachable; less specific in search |
| 3 | A small team for one coherent code change. | Solo developers | Outcome is understandable; needs a tangible demonstration |
| 4 | Better handoffs between coding agents. | Teams losing context | Focused pain point; less obvious why an offline planner matters |
| 5 | Coordinate agents without adding another framework. | Developers avoiding orchestration stacks | Low switching cost; can sound like a features comparison |
| 6 | Make parallel code changes easier to integrate. | Maintainers and reviewers | Direct result; integration quality needs more real-world evidence |
| 7 | Pause the dependent work, keep the rest moving. | Developers debugging failed agent runs | Distinctive recovery story; narrower entry point |
| 8 | One task. A clear plan for every agent. | New agent users | Easy to understand; risks resembling a generic planning prompt |
| 9 | Focused context for AI software teams. | Context-conscious power users | Good technical audience; cannot imply measured token savings |
| 10 | Ship a coordinated change with the assistant you already use. | Cross-tool users | Broad appeal and low switching cost; weaker concrete search intent |

Use #1 for the hero, #5 to explain the small footprint, and #7 for the most distinctive demo. Avoid rotating all ten across channels at once; that would make the project harder to recognize.

## Honest critique

1. **The moat is not "agents working together."** Hosts already provide native subagents. RelayCrew must earn its place through dependable ownership, recovery behavior, and examples users can reproduce.
2. **The first demo looked like a planner library.** A JSON schedule alone does not show a coding skill improving a task. Keep the planner demo, but also show a real repository change and the final acceptance tests.
3. **The benefit is not yet quantitatively established.** The small CSV task also passed without the skill. A successful team run establishes feasibility, not superiority. Publish that distinction.
4. **"Works with any agent" is too broad.** Standard-compatible packaging is different from native delegation, installation, shell access, and runtime verification. Keep a capability and evidence matrix.
5. **Installation is a conversion cost.** Offer the small ZIP and a precise copy destination. Do not require a new framework, account, MCP server, or background service.
6. **A character cap is not a spending limit.** Remove any implication that a short capsule guarantees lower usage. Measure actual host usage before making savings claims.
7. **A declaration is not a filesystem lock.** Explain that the planner sees only declared claims. Do not market it as a mechanism that makes races impossible.
8. **Too many options can bury the default.** Default to automatic team sizing, two workers, and no planner for simple tasks. Keep advanced preferences in a reference.
9. **Stars are an outcome, not the product.** A visitor needs one useful result before an invitation to star. Avoid reward loops, reciprocal stars, badges, or contributor activity created for appearances.
10. **Maintenance can overwhelm a solo author.** Favor small reproducible reports, explicit scope, and a narrow release promise. A rapid stream of unrelated features will make the core less trustworthy.

## What to emphasize and cut

Emphasize the lockfile example, verified prerequisite holds, focused briefs, unchanged host setup, and public evaluation limitations. Cut unsupported superlatives, imagined adoption numbers, fixed role rosters, mandatory team creation, fabricated time savings, and claims of universal host testing. Keep the public repository English-only.
