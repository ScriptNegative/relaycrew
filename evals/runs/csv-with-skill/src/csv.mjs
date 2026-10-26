function encodeField(value) {
  const text = value == null ? '' : String(value);
  return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function encodeCsv(rows, columns) {
  let csv = columns.map(column => encodeField(column.label)).join(',') + '\r\n';
  for (const row of rows) {
    csv += columns.map(column => encodeField(row[column.key])).join(',') + '\r\n';
  }
  return csv;
}
