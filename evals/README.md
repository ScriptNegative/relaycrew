# Behavioral evaluation cases

These are proposed manual evaluation scenarios, not claims of completed live-agent benchmarks. Use a disposable repository, preserve raw outcomes locally, and record host/version, actual worker count, checks, failures, and elapsed time. Measure token use only when the host exposes it. Compare the same task and acceptance criteria against a solo baseline before reporting savings.

| Scenario | Observable expectation |
| --- | --- |
| Fix a typo in one file | Completes directly; no worker ceremony |
| Build API and UI against a frozen schema | Separate write ownership; integrated check after both complete |
| Two tasks change the same lockfile | Serialized work or a single owner for the lockfile |
| One task writes a directory another reads | No concurrent execution in a shared checkout |
| Implementation fails its acceptance check | Dependent review is held; affected work is replanned |
| Delegation tools are unavailable or forbidden | Sequential execution with an honest solo-mode report |
| A worker needs an unclaimed file | Ownership is revised before an edit |
| Host inherits the full conversation | Brief size is not presented as a total-context limit |

Before publishing a model-behavior comparison, include the actual prompt, fixture, model/version, native tools used, repetitions, acceptance results, and usage data. Redact sensitive material and avoid presenting this test matrix as executed evidence.
