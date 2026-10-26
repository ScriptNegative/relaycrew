# Offline event report contract

Build the three modules under src/ for a small offline audit-log tool. No dependencies or external services. Keep every edit inside this fixture. The interfaces below are frozen so parser and summary work can proceed independently.

## Parser: src/parse.mjs

Export `parseEvents(text, {strict = false} = {})`. Text is newline-delimited JSON; support LF and CRLF, and skip whitespace-only lines. Each nonblank line must be a JSON object with `type` a nonempty string, `ok` a boolean, and `latencyMs` a finite nonnegative number. Trim type. Return `{events, errors}` preserving record order. Each normalized event has exactly those three fields. Errors are `{line, message}` with one-based source line numbers; message wording is free. In tolerant mode skip malformed records and collect errors. In strict mode throw an Error identifying the source line for the first malformed record. A non-string text input must throw TypeError. Do not execute any text or mutate inputs.

## Summary: src/summarize.mjs

Export `summarize(events)`. For normalized events return `{total, failed, totalLatencyMs, byType}`. `failed` counts events with ok false. `byType` is an array of `{type, count}` sorted by JavaScript code-unit comparison of type strings; no locale-dependent order. Handle arbitrary type strings such as `__proto__` as data. Empty input returns zero totals and an empty byType. Do not mutate the events array or its records.

## Integration: src/report.mjs

Export `makeReport(text, options)`. Use the parser and summary modules to return `{summary, errors}`; strict parsing errors must propagate. This layer must use the shared implementations rather than reimplementing either. Preserve parser error records exactly.

Node.js 18+. Add focused tests as appropriate, keeping parser tests, summary tests, and integration tests in separate files so independent implementers do not share a write claim. The coordinator owns integration and the final combined check.
