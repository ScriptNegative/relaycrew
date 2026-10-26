# Answer to the requested read-only resume

This is a recovery plan, not a resumed implementation. The checkpoint reports that `contract` completed and `api` failed. Neither result is verified in this session: the supplied files contain no requirement, schema content, implementation diff, failure output, or live test evidence. I have not changed the checkpoint or promoted any task to verified completion.

| Task | What the checkpoint supports | Next gate |
| --- | --- | --- |
| `contract` | Reported completed; writes `docs/api.md` | Verify the approved schema against the original requirement and the actual file before relying on it. |
| `api` | Reported failed; depends on `contract`; writes `src/api` | Inspect the failed check and partial changes, identify a supported cause, then make a targeted repair. Do not retry the unchanged failure. |
| `ui` | Depends only on `contract`; reads `docs/api.md`; writes `src/ui`. Its actual progress is unknown. | After verifying the contract and the frozen fixtures, assess existing UI work and continue it as needed. The API failure alone does not block this task under the declared dependencies. |
| `docs` | Depends on `api`; reads `src/api`; writes `docs/quickstart.md` | Hold until the API's acceptance check passes and its actual behavior can be inspected. |
| `review` | Depends on `api`, `ui`, and `docs`; reads their outputs | Hold until those prerequisites have evidence and the integrated result is available. |

The useful next sequence, once source inspection and execution are permitted, is:

1. **Reconcile the checkpoint.** Obtain the original requirement, the actual `docs/api.md` and its approval evidence, the current API diff and useful partial edits, and the exact failed API test command, output, and exit status. Confirm the relevant workspace revision. Locate the existing API and UI acceptance checks and frozen fixtures; their paths and commands are not supplied here. Record which checkpoint claims the evidence supports. Do not infer a failure cause from the task name.
2. **Repair the API after its contract gate.** Keep reads on `docs/api.md` and writes within `src/api` as declared. Preserve useful partial work and change only what the diagnosed failure warrants. If tests, configuration, generated files, or a lockfile need edits outside that claim, revise ownership before editing. Completion requires actual passing API contract-test evidence against the approved schema.
3. **Assess and continue the UI after its contract and fixture gates.** Keep the declared `docs/api.md` read and `src/ui` write claims. It can proceed independently of the API repair if the verified interface remains stable. An interface change invalidates affected UI assumptions and requires rebriefing. Completion requires actual passing UI fixture-test evidence. No parallel work is launched here.
4. **Write the quickstart from the working API.** Once the API gate passes, inspect its behavior, update `docs/quickstart.md`, and verify the documented request. A passing contract test alone does not demonstrate that the quickstart request works.
5. **Check the combined result and review it against the requirement.** When API, UI, and documentation have passed their checks, inspect their integrated diff and reproduce the relevant combined behavior. Review findings must point to a concrete failure or missing check. Update the checkpoint with evidence, remaining failures, useful partial edits, and the next acceptance check.

Current execution mode is solo, read-only planning. `max_workers: 2` is a ceiling in the supplied plan, not evidence that workers exist or authorization to launch them. This session cannot justify a patch, a root-cause diagnosis, passing tests, or a completed review. The next handoff needs the artifacts in step 1 and permission for the corresponding source inspection and checks; until then the plan remains provisional.

# Actions and tools used

- Read `outputs/relaycrew/skills/relaycrew/SKILL.md` and `outputs/relaycrew/examples/failure-resume.plan.json` using a `functions.exec` call wrapping `tools.exec_command` with PowerShell `Get-Content -LiteralPath ... -Raw` for each file.
- Read `outputs/relaycrew/skills/relaycrew/references/options.md` using a second `functions.exec` / `tools.exec_command` call. Its checkpoint guidance explicitly says to treat state as a claim to verify against the actual workspace before resuming.
- Created only this evaluation file with `tools.apply_patch` through `functions.exec`, then reread it with `tools.exec_command` / `Get-Content` to verify the saved response.
- Did not inspect implementation source, run the planner, run tests, execute project code, modify the package or a project, launch workers, or access services. No task-state JSON was changed. No runtime, token, cost, savings, or cross-host claims were made.
