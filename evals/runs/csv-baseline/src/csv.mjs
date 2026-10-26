function encodeField(value) {
  const field = value == null ? '' : String(value);
  return /[,"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

export function encodeCsv(rows, columns) {
  const records = [columns.map(column => encodeField(column.label)).join(',')];
  for (const row of rows) {
    records.push(columns.map(column => encodeField(row[column.key])).join(','));
  }
  return records.join('\r\n') + '\r\n';
}
