export function summarize(events) {
  let failed = 0;
  let totalLatencyMs = 0;
  const counts = new Map();

  for (const event of events) {
    if (event.ok === false) failed += 1;
    totalLatencyMs += event.latencyMs;
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }

  const byType = [...counts]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([type, count]) => ({type, count}));

  return {total: events.length, failed, totalLatencyMs, byType};
}
