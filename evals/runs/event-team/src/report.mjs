import { parseEvents } from './parse.mjs';
import { summarize } from './summarize.mjs';

export function makeReport(text, options) {
  const { events, errors } = parseEvents(text, options);
  return { summary: summarize(events), errors };
}
