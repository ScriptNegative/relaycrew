import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents } from '../src/parse.mjs';
import { summarize } from '../src/summarize.mjs';
import { makeReport } from '../src/report.mjs';

test('report uses parsed records for summary and preserves ordered parser errors', () => {
  const text = [
    '',
    '{"type":" z ","ok":false,"latencyMs":3,"ignored":true}',
    'invalid',
    '{"type":"__proto__","ok":true,"latencyMs":0.5}',
    '{"type":"z","ok":true,"latencyMs":1.5}',
    '[]',
  ].join('\r\n');
  const parsed = parseEvents(text);
  const result = makeReport(text);

  assert.deepEqual(result, { summary: summarize(parsed.events), errors: parsed.errors });
  assert.deepEqual(result.summary, {
    total: 3,
    failed: 1,
    totalLatencyMs: 5,
    byType: [{ type: '__proto__', count: 1 }, { type: 'z', count: 2 }],
  });
  assert.deepEqual(result.errors.map(({ line }) => line), [3, 6]);
});

test('report forwards strict parsing and stops at the first malformed line', () => {
  const text = '\n{"type":"ok","ok":true,"latencyMs":0}\ninvalid\n[]';
  let parserError;
  try {
    parseEvents(text, { strict: true });
  } catch (error) {
    parserError = error;
  }
  assert.ok(parserError instanceof Error);
  assert.throws(() => makeReport(text, { strict: true }), {
    name: parserError.name,
    message: parserError.message,
  });
});

test('report handles blank and wholly invalid sources', () => {
  const zero = { total: 0, failed: 0, totalLatencyMs: 0, byType: [] };
  assert.deepEqual(makeReport(' \r\n\t\n'), { summary: zero, errors: [] });
  const text = 'null\n{"type":" ","ok":true,"latencyMs":0}';
  assert.deepEqual(makeReport(text, { strict: false }), {
    summary: zero,
    errors: parseEvents(text).errors,
  });
});

test('report propagates parser input type errors', () => {
  assert.throws(() => makeReport({}), TypeError);
});
