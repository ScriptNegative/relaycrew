# Contributing

Start with a concrete workflow or reproducible failure. For a planner bug, include a minimal JSON plan, expected waves, actual result, Node version, and operating system. For skill behavior, include the assistant/version, relevant prompt, available delegation tools, actual ownership assignments, and observable result. Remove credentials and private source.

Keep the core skill short. Add host-specific guidance to the relevant reference instead of requiring every user to load it. Preserve solo fallback and existing host permissions. Avoid unmeasured claims about speed, cost, or token savings.

For changes, run `node --test tests/plan.test.mjs tests/package.test.mjs` with Node.js 18+ and include a regression test when it demonstrates a real planner failure. Explain whether you tested the planner, model behavior, or both. Distinguish the recorded exploratory runs from proposed evaluation cases and larger benchmarks.

For a larger feature, discuss the specific problem in an issue first so the project can stay lightweight.
