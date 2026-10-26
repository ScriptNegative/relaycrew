import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEvents} from '../src/parse.mjs';
import {summarize} from '../src/summarize.mjs';
import {makeReport} from '../src/report.mjs';

test('empty inputs', () => {
  assert.deepEqual(parseEvents(' \r\n\n'), {events:[],errors:[]});
  assert.deepEqual(summarize([]), {total:0,failed:0,totalLatencyMs:0,byType:[]});
});
test('normalization and tolerant errors preserve source line numbers', () => {
  const result=parseEvents('\n{"type":" api ","ok":false,"latencyMs":2,"extra":3}\r\nnope\r\n{"type":"ui","ok":true,"latencyMs":1}');
  assert.deepEqual(result.events,[{type:'api',ok:false,latencyMs:2},{type:'ui',ok:true,latencyMs:1}]);
  assert.equal(result.errors.length,1);assert.equal(result.errors[0].line,3);assert.equal(typeof result.errors[0].message,'string');
});
test('invalid event shapes are rejected', () => {
  const lines=['[]','null','1','{}','{"type":"x","ok":1,"latencyMs":2}','{"type":" ","ok":true,"latencyMs":0}','{"type":"x","ok":true,"latencyMs":-1}'];
  const result=parseEvents(lines.join('\n'));assert.equal(result.events.length,0);assert.equal(result.errors.length,lines.length);
});
test('strict errors identify the first bad line', () => {
  assert.throws(()=>parseEvents('\nnope\n{}',{strict:true}), /2/);
  assert.throws(()=>parseEvents(null), TypeError);
});
test('summary uses deterministic ordering and treats dangerous property names as data', () => {
  const events=[{type:'z',ok:true,latencyMs:1},{type:'__proto__',ok:false,latencyMs:2},{type:'a',ok:true,latencyMs:3},{type:'z',ok:false,latencyMs:4}];
  assert.deepEqual(summarize(events),{total:4,failed:2,totalLatencyMs:10,byType:[{type:'__proto__',count:1},{type:'a',count:1},{type:'z',count:2}]});
});
test('summary preserves frozen inputs', () => {
  const events=Object.freeze([Object.freeze({type:'x',ok:true,latencyMs:1})]);
  assert.equal(summarize(events).total,1);
});
test('integration combines results and parsing errors', () => {
  const text='{"type":"api","ok":false,"latencyMs":5}\ninvalid';
  const result=makeReport(text);
  assert.deepEqual(result.summary,{total:1,failed:1,totalLatencyMs:5,byType:[{type:'api',count:1}]});
  assert.deepEqual(result.errors,parseEvents(text).errors);
  assert.throws(()=>makeReport(text,{strict:true}), /2/);
});
