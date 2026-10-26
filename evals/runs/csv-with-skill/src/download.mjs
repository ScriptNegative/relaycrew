import {encodeCsv} from './csv.mjs';

export function buildDownload(rows, columns) {
  return {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="report.csv"',
    },
    body: encodeCsv(rows, columns),
  };
}
