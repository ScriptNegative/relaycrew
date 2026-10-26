import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeCsv} from '../src/csv.mjs';
import {buildDownload} from '../src/download.mjs';

test('CR, LF, quotes, and CRLF are quoted in labels and data', () => {
  const columns = [
    {key: 'cr', label: 'Carriage\rreturn'},
    {key: 'lf', label: 'Line\nfeed'},
    {key: 'quote', label: '"Quote"'},
    {key: 'both', label: 'Both\r\nlines'},
  ];
  const rows = [{cr: 'a\rb', lf: 'c\nd', quote: '"e"', both: 'f\r\ng'}];
  assert.equal(encodeCsv(rows, columns),
    '"Carriage\rreturn","Line\nfeed","""Quote""","Both\r\nlines"\r\n' +
    '"a\rb","c\nd","""e""","f\r\ng"\r\n');
});

test('values use String conversion and empty values remain empty', () => {
  const columns = ['zero', 'true', 'bigint', 'array', 'object', 'symbol', 'empty', 'nil', 'missing']
    .map(key => ({key, label: key}));
  const rows = [{
    zero: 0, true: true, bigint: 42n, array: ['a', 'b'],
    object: {toString() { return 'custom'; }}, symbol: Symbol('x'), empty: '', nil: null,
  }];
  assert.equal(encodeCsv(rows, columns),
    'zero,true,bigint,array,object,symbol,empty,nil,missing\r\n' +
    '0,true,42,"a,b",custom,Symbol(x),,,\r\n');
});

test('zero columns still produce a header record and one record per row', () => {
  assert.equal(encodeCsv([], []), '\r\n');
  assert.equal(encodeCsv([{}, {}], []), '\r\n\r\n\r\n');
});

test('download preserves special data and supports frozen inputs', () => {
  const columns = Object.freeze([
    Object.freeze({key: 'formula', label: 'Formula'}),
    Object.freeze({key: 'text', label: 'Text'}),
  ]);
  const rows = Object.freeze([
    Object.freeze({formula: '=SUM(1,2)', text: '日本語\r\n"quoted"'}),
    Object.freeze({formula: '+42', text: '@value'}),
    Object.freeze({formula: '-1', text: '\t=2'}),
  ]);
  assert.deepEqual(buildDownload(rows, columns), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="report.csv"',
    },
    body: 'Formula,Text\r\n"=SUM(1,2)","日本語\r\n""quoted"""\r\n+42,@value\r\n-1,\t=2\r\n',
  });
});
