# Optional planner

Node.js 18+; no package installation, API key, network call, or agent runtime. The CLI reads one JSON file and prints a proposed plan as JSON. It does not execute task checks, access project files, launch workers, or write state.

```sh
node skills/relaycrew/scripts/plan.mjs examples/feature.plan.json
```

```json
{
  "max_workers": 2,
  "max_brief_chars": 2400,
  "tasks": [
    {
      "id": "api",
      "goal": "Implement the agreed API contract",
      "context": "The response schema is already approved.",
      "reads": ["docs/api.md"],
      "writes": ["src/api", "tests/api"],
      "resources": [],
      "after": [],
      "checks": ["Run the API contract tests"]
    }
  ]
}
```

`id`, `goal`, and a non-empty `checks` array are required. Other task fields default to empty. `max_workers` defaults to 2 and must be an integer from 1 to 64; the host's lower limit still applies. `max_brief_chars` defaults to 2400. Oversized rendered capsules cause an error instead of truncation. Characters are Unicode code points, not model tokens, and exclude any history or host instructions.

Use literal repository-relative file or directory paths, with no glob syntax. A directory conflicts with its descendants; `.` claims the entire repository. Windows separators normalize to `/`, and comparisons ignore case conservatively. Absolute paths, parent traversal, URI-like paths, and wildcard claims are rejected. The planner does not resolve symlinks, hardlinks, mounts, or other aliases: declare the same canonical path or an exclusive resource name for aliased state. Resources are exclusive, case-insensitive names for shared mutable systems such as `test-database`.

Add `after` dependencies for semantic order. An overlap only prevents concurrent execution; it does not establish the intended order. Independent tasks keep their input order during a deterministic greedy schedule. A wave starts only after the coordinator verifies that required tasks succeeded. The static planner assumes completion to show later waves; after any failure, stop dependent work and replan from the verified state.

The output includes compatible `waves`, `briefs`, and conflicting task pairs with reasons. It rejects duplicate IDs, missing dependencies, self-dependencies, dependency cycles, malformed claims, and unknown fields. Claims are advisory, not a sandbox or locking mechanism. Safety depends on complete, honest claims and the coordinator enforcing them.
