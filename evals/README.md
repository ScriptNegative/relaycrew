# Try RelayCrew on a real coding task

Use a disposable copy of a fixture, then give the prompt below to your assistant with the skill loaded. The modules start unimplemented. The frozen contract and supplied tests make the result observable. Preserve the supplied tests and add focused tests if useful.

## Small task: CSV export

Copy `fixtures/csv-export` into a scratch project. Load RelayCrew and ask:

> The reporting tool in this fixture needs working CSV export and a download response builder. Implement docs/contract.md, preserve the public interfaces, and verify the integrated result. Use RelayCrew to choose an appropriate workflow. Do not install dependencies or use external services. Keep all task edits in this fixture.

Run `node --test` from the copied fixture directory after implementation. A small dependent task may reasonably stay solo.

## Team task: offline event report

Copy `fixtures/event-report` into a scratch project. Load RelayCrew and ask:

> Implement the offline event report toolkit according to docs/contract.md. Use RelayCrew in team mode with two native implementers for separate workstreams if this host permits it. Keep integration and final verification with the coordinator. Assign separate source and test files to each worker. Do not install dependencies or use external services. Keep all edits in this fixture.

Run `node --test` in the fixture after integration. Record actual tools and ownership, rather than merely asking the model whether it complied.

## Evidence already recorded

See [results](results.md) and the saved [team run](runs/event-team/evaluation.md), [CSV skill run](runs/csv-with-skill/evaluation.md), and [CSV baseline](runs/csv-baseline/evaluation.md). Their source and added tests are included so the recorded artifacts can be replayed without invoking a model. From one of those run directories, `node --test` checks the saved implementation. Replaying saved code does not rerun or revalidate the original agent behavior.

Fixtures are deliberately incomplete and should fail before the task is implemented. The root automated test command targets `tests/` explicitly so it does not mistake those expected failures for product regressions.

The [0.4 recovery evaluation](runs/session-recovery/evaluation.md) records public-CLI behavior with synthetic worker evidence. Its plan, checkpoint, results, and sanitized transcript are included. It is separate from the real coding runs above and does not establish native worker recovery or performance gains.

## Further evaluation

[`evals.json`](evals.json) defines output scenarios and [`triggers.json`](triggers.json) defines labeled activation queries. The labels are proposed expectations, not completed trigger metrics. Use independent clean sessions, preserve raw results, and compare against the same task without the skill or with a pinned previous version.

Test failure recovery, a worker requesting new ownership, inherited history, missing delegation, and absent execution tools. Record host/version, actual worker count, acceptance outcomes, failures, and available usage data. Do not infer token usage from characters or claim savings from a successful task alone. The [growth playbook](../docs/growth-playbook.md) includes a fuller benchmark design.
