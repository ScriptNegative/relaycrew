import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeCsv} from '../src/csv.mjs';
import {buildDownload} from '../src/download.mjs';

test('carriage returns, quotes, and line feeds are quoted without rewriting content', () => {
  const columns = [{key: 'value', label: 'a\r"b\nc'}];
  const rows = [{value: 'x\ry'}, {value: '"'}, {value: 'x\r\ny'}];
  assert.equal(encodeCsv(rows, columns), '"a\r""b\nc"\r\n"x\ry"\r\n""""\r\n"x\r\ny"\r\n');
});

test('other values use String and nullish values alone become empty', () => {
  const values = [0, false, NaN, 42n, Symbol('x'), {toString: () => 'a,b'}, null, undefined, ''];
  assert.equal(
    encodeCsv(values.map(value => ({value})), [{key: 'value', label: 'Value'}]),
    'Value\r\n0\r\nfalse\r\nNaN\r\n42\r\nSymbol(x)\r\n"a,b"\r\n\r\n\r\n\r\n',
  );
});

test('download keeps frozen inputs intact and preserves the exact CSV body', () => {
  const columns = Object.freeze([Object.freeze({key: 'value', label: 'Valor'})]);
  const rows = Object.freeze([Object.freeze({value: 'Espa\u00f1a, =1+1\r\n"hola"'})]);
  const expected = 'Valor\r\n"Espa\u00f1a, =1+1\r\n""hola"""\r\n';
  assert.equal(encodeCsv(rows, columns), expected);
  assert.deepEqual(buildDownload(rows, columns), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="report.csv"',
    },
    body: expected,
  });
});
