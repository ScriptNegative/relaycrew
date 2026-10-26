export function parseEvents(text, { strict = false } = {}) {
  if (typeof text !== 'string') {
    throw new TypeError('Event text must be a string');
  }

  const events = [];
  const errors = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const source = lines[index];
    if (source.trim() === '') continue;

    let event;
    try {
      const record = JSON.parse(source);
      if (record === null || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error('Event must be a JSON object');
      }
      if (typeof record.type !== 'string' || record.type.trim() === '') {
        throw new Error('type must be a nonempty string');
      }
      if (typeof record.ok !== 'boolean') {
        throw new Error('ok must be a boolean');
      }
      if (typeof record.latencyMs !== 'number' || !Number.isFinite(record.latencyMs) || record.latencyMs < 0) {
        throw new Error('latencyMs must be a finite nonnegative number');
      }

      event = {
        type: record.type.trim(),
        ok: record.ok,
        latencyMs: record.latencyMs,
      };
    } catch (error) {
      const line = index + 1;
      const message = error.message;
      if (strict) throw new Error(`Invalid event at line ${line}: ${message}`);
      errors.push({ line, message });
      continue;
    }

    events.push(event);
  }

  return { events, errors };
}
