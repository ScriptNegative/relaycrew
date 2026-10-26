import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../src/summarize.mjs';

test('empty input has zero totals and no types', () => {
  assert.deepEqual(summarize([]), {
    total: 0,
    failed: 0,
    totalLatencyMs: 0,
    byType: [],
  });
});

test('summarizes successful and failed events with repeated types', () => {
  assert.deepEqual(summarize([
    {type: 'read', ok: true, latencyMs: 1.5},
    {type: 'write', ok: false, latencyMs: 2.25},
    {type: 'read', ok: false, latencyMs: 0},
    {type: 'write', ok: true, latencyMs: 4.25},
  ]), {
    total: 4,
    failed: 2,
    totalLatencyMs: 8,
    byType: [{type: 'read', count: 2}, {type: 'write', count: 2}],
  });
});

test('treats special property names as data and sorts by code units', () => {
  const types = ['\uFFFD', 'ä', 'toString', 'a', '😀', '__proto__', 'Z', 'constructor', 'A', '__proto__'];
  const events = types.map(type => ({type, ok: true, latencyMs: 0}));

  assert.deepEqual(summarize(events), {
    total: 10,
    failed: 0,
    totalLatencyMs: 0,
    byType: [
      {type: 'A', count: 1},
      {type: 'Z', count: 1},
      {type: '__proto__', count: 2},
      {type: 'a', count: 1},
      {type: 'constructor', count: 1},
      {type: 'toString', count: 1},
      {type: 'ä', count: 1},
      {type: '😀', count: 1},
      {type: '\uFFFD', count: 1},
    ],
  });
});

test('does not mutate the input array or event records', () => {
  const events = Object.freeze([
    Object.freeze({type: 'z', ok: false, latencyMs: 3}),
    Object.freeze({type: 'a', ok: true, latencyMs: 1}),
    Object.freeze({type: 'z', ok: false, latencyMs: 2}),
  ]);
  const before = structuredClone(events);

  assert.deepEqual(summarize(events), {
    total: 3,
    failed: 2,
    totalLatencyMs: 6,
    byType: [{type: 'a', count: 1}, {type: 'z', count: 2}],
  });
  assert.deepEqual(events, before);
});
