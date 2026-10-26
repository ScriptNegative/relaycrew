import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents } from '../src/parse.mjs';

const valid = { type: 'request', ok: true, latencyMs: 12.5 };
const asLine = (record) => JSON.stringify(record);

test('normalizes records, drops extra fields, and preserves order', () => {
  const source = [
    { type: '  first\t', ok: false, latencyMs: 0, extra: { ignored: true } },
    { type: '__proto__', ok: true, latencyMs: 2.5, line: 99 },
    { type: 'last', ok: true, latencyMs: 1e20 },
  ].map(asLine).join('\n');

  assert.deepEqual(parseEvents(source), {
    events: [
      { type: 'first', ok: false, latencyMs: 0 },
      { type: '__proto__', ok: true, latencyMs: 2.5 },
      { type: 'last', ok: true, latencyMs: 1e20 },
    ],
    errors: [],
  });
});

test('accepts LF, CRLF, mixed endings, and whitespace-only lines', () => {
  const record = asLine(valid);
  for (const newline of ['\n', '\r\n']) {
    assert.deepEqual(parseEvents(` \t${newline}${record}${newline}\t${newline}${record}${newline}`), {
      events: [valid, valid],
      errors: [],
    });
  }
  assert.deepEqual(parseEvents(`${record}\r\n\n${record}\n`), {
    events: [valid, valid],
    errors: [],
  });
});

test('empty or blank-only input returns empty results', () => {
  for (const source of ['', '\n', '\r\n \t\r\n\n']) {
    assert.deepEqual(parseEvents(source), { events: [], errors: [] });
  }
});

test('tolerant parsing skips invalid lines with original one-based line numbers', () => {
  const source = `\r\n${asLine(valid)}\r\n{broken\r\n \t\r\n[]\r\n${asLine({ ...valid, type: 'next' })}\r\nnull`;
  const result = parseEvents(source, { strict: false });

  assert.deepEqual(result.events, [valid, { ...valid, type: 'next' }]);
  assert.deepEqual(result.errors.map(({ line }) => line), [3, 5, 7]);
  for (const error of result.errors) {
    assert.deepEqual(Object.keys(error).sort(), ['line', 'message']);
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0);
  }
});

test('rejects non-object JSON records and every invalid field shape', () => {
  const invalid = [
    null, [], [valid], false, 1, 'record', {},
    { ok: true, latencyMs: 1 },
    { ...valid, type: null }, { ...valid, type: 1 },
    { ...valid, type: '' }, { ...valid, type: ' \t\n ' },
    { type: 'request', latencyMs: 1 },
    { ...valid, ok: null }, { ...valid, ok: 1 }, { ...valid, ok: 'true' },
    { type: 'request', ok: true },
    { ...valid, latencyMs: null }, { ...valid, latencyMs: '1' },
    { ...valid, latencyMs: true }, { ...valid, latencyMs: -0.1 },
  ].map(asLine);
  invalid.push('{"type":"request","ok":true,"latencyMs":1e309}');
  invalid.push('{"type":"request","ok":true,"latencyMs":-1e309}');

  const result = parseEvents(invalid.join('\n'));
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors.map(({ line }) => line), invalid.map((_, index) => index + 1));
});

test('strict parsing throws an Error naming the first bad source line', () => {
  for (const bad of ['{broken', 'null', asLine({ ...valid, ok: 'false' })]) {
    assert.throws(
      () => parseEvents(`\n${asLine(valid)}\n${bad}\n[]`, { strict: true }),
      (error) => error instanceof Error && /line 3\b/.test(error.message),
    );
  }
  assert.deepEqual(parseEvents(asLine(valid), { strict: true }), {
    events: [valid],
    errors: [],
  });
});

test('non-string input throws TypeError in either mode without coercion', () => {
  const noCoercion = { toString() { throw new Error('Must not coerce input'); } };
  for (const input of [undefined, null, 1, true, [], {}, new String(''), noCoercion, Symbol('input')]) {
    assert.throws(() => parseEvents(input), TypeError);
    assert.throws(() => parseEvents(input, { strict: true }), TypeError);
  }
});

test('treats executable-looking text as invalid JSON without executing it', () => {
  const key = '__offlineParserExecutionProbe__';
  assert.equal(Object.hasOwn(globalThis, key), false);
  const result = parseEvents(`globalThis.${key} = true;\n${asLine(valid)}`);
  assert.equal(Object.hasOwn(globalThis, key), false);
  assert.deepEqual(result.events, [valid]);
  assert.deepEqual(result.errors.map(({ line }) => line), [1]);
});
