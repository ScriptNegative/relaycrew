# CSV export contract

Implement `encodeCsv(rows, columns)` in `src/csv.mjs` and `buildDownload(rows, columns)` in `src/download.mjs`. The modules are used by an existing reporting tool; the public function names and contract below are frozen.

`columns` is an ordered array of objects with `key` and `label` strings. `rows` is an array of objects. `encodeCsv` returns a UTF-8 JavaScript string with the column labels as the first record. Records use CRLF, including a trailing CRLF. Encode null and undefined cell values as empty strings. Convert other values using String. Quote a field if it contains comma, double quote, CR, or LF, doubling embedded quotes. Do not mutate inputs. No formula rewriting is requested; this module exports data without silently changing values.

`buildDownload` returns `{status: 200, headers, body}`. The body must be exactly `encodeCsv(rows, columns)`. Headers must include `content-type: text/csv; charset=utf-8` and `content-disposition: attachment; filename="report.csv"`. There is no HTTP framework dependency. The CSV module and response module have separate file ownership, and both must satisfy the frozen contract after integration.

Node.js 18+ only. Do not install packages or access external services. Tests may be added under tests/. Keep all task edits inside this fixture directory.
