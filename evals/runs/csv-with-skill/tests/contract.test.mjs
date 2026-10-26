import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeCsv} from '../src/csv.mjs';
import {buildDownload} from '../src/download.mjs';

const columns = [{key:'name',label:'Name'}, {key:'value',label:'Value'}];
test('header and empty dataset', () => assert.equal(encodeCsv([], columns), 'Name,Value\r\n'));
test('column order and Unicode', () => assert.equal(encodeCsv([{value:3,name:'Zoë'}], columns), 'Name,Value\r\nZoë,3\r\n'));
test('null values and false', () => assert.equal(encodeCsv([{name:null,value:false},{name:'x'}], columns), 'Name,Value\r\n,false\r\nx,\r\n'));
test('quotes commas and embedded newlines', () => assert.equal(encodeCsv([{name:'a,"b"',value:'x\ny'}], columns), 'Name,Value\r\n"a,""b""","x\ny"\r\n'));
test('labels follow the same quoting rules', () => assert.equal(encodeCsv([], [{key:'x',label:'a,b'}]), '"a,b"\r\n'));
test('inputs are unchanged', () => {
  const rows=[{name:'A',value:2}]; const before=JSON.stringify({rows,columns});
  encodeCsv(rows,columns); assert.equal(JSON.stringify({rows,columns}),before);
});
test('CSV data is preserved without changing formulas', () => assert.equal(encodeCsv([{name:'=1+1',value:0}], columns), 'Name,Value\r\n=1+1,0\r\n'));
test('download response body and headers', () => {
  const rows=[{name:'A',value:2}]; const r=buildDownload(rows,columns);
  assert.equal(r.status,200); assert.equal(r.body,encodeCsv(rows,columns));
  assert.equal(r.headers['content-type'],'text/csv; charset=utf-8');
  assert.equal(r.headers['content-disposition'],'attachment; filename="report.csv"');
});
