import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const fail = message => { throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const length = value => [...value].length;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

function fields(value, allowed, label) {
  if (!object(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Unknown ${label} field: ${key}`);
}

function strings(value, label, required = false) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.some(item => !nonempty(item)) || (required && !value.length)) {
    fail(`${label} must be ${required ? 'a non-empty' : 'an'} array of non-empty strings`);
  }
  return [...new Set(value.map(item => item.trim()))];
}

function claim(value) {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '') || '/';
  if (normalized.startsWith('/') || /[:*?\[\]{}\x00-\x1f]/.test(normalized)) fail(`Invalid relative claim: ${value}`);
  const parts = normalized.split('/');
  if (parts.includes('..')) fail(`Parent traversal is not allowed: ${value}`);
  return parts.filter(part => part && part !== '.').join('/') || '.';
}

function overlaps(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === '.' || b === '.' || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function conflictReasons(a, b) {
  const reasons = [];
  for (const resource of a.resources) {
    if (b.resources.some(other => resource.toLowerCase() === other.toLowerCase())) reasons.push(`resource: ${resource}`);
  }
  for (const write of a.writes) {
    for (const other of b.writes) if (overlaps(write, other)) reasons.push(`write/write: ${write} <> ${other}`);
    for (const read of b.reads) if (overlaps(write, read)) reasons.push(`write/read: ${a.id}:${write} <> ${b.id}:${read}`);
  }
  for (const write of b.writes) {
    for (const read of a.reads) if (overlaps(write, read)) reasons.push(`write/read: ${b.id}:${write} <> ${a.id}:${read}`);
  }
  return [...new Set(reasons)];
}

function capsule(task) {
  return [
    `Task: ${task.id} — ${task.goal}`,
    `Context: ${task.context || 'none'}`,
    `Read: ${task.reads.join(', ') || 'none'}`,
    `Write: ${task.writes.join(', ') || 'none'}`,
    `Resources: ${task.resources.join(', ') || 'none'}`,
    `Done when: ${task.checks.join('; ')}`,
    'Return: changed paths; evidence and checks; blockers; follow-up needed'
  ].join('\n');
}

export function plan(input) {
  fields(input, ['tasks', 'max_workers', 'max_brief_chars', 'completed', 'failed'], 'plan');
  const maxWorkers = input.max_workers === undefined ? 2 : input.max_workers;
  const maxBrief = input.max_brief_chars === undefined ? 2400 : input.max_brief_chars;
  if (!Number.isSafeInteger(maxWorkers) || maxWorkers < 1 || maxWorkers > 64) fail('max_workers must be an integer from 1 to 64');
  if (!Number.isSafeInteger(maxBrief) || maxBrief < 1) fail('max_brief_chars must be a positive integer');
  if (!Array.isArray(input.tasks) || !input.tasks.length) fail('tasks must be a non-empty array');
  const tasks = input.tasks.map((task, index) => {
    fields(task, ['id', 'goal', 'context', 'reads', 'writes', 'resources', 'after', 'checks'], `task ${index}`);
    if (!nonempty(task.id) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(task.id)) fail(`Invalid task ID at index ${index}`);
    if (!nonempty(task.goal)) fail(`${task.id}: goal must be a non-empty string`);
    if (task.context !== undefined && typeof task.context !== 'string') fail(`${task.id}: context must be a string`);
    return {
      id: task.id,
      goal: task.goal.trim(),
      context: task.context?.trim() ?? '',
      reads: strings(task.reads, `${task.id}.reads`).map(claim),
      writes: strings(task.writes, `${task.id}.writes`).map(claim),
      resources: strings(task.resources, `${task.id}.resources`),
      after: strings(task.after, `${task.id}.after`),
      checks: strings(task.checks, `${task.id}.checks`, true)
    };
  });
  const ids = new Set(tasks.map(task => task.id));
  if (ids.size !== tasks.length) fail('Duplicate task IDs');
  for (const task of tasks) for (const dependency of task.after) {
    if (!ids.has(dependency)) fail(`${task.id}: unknown dependency ${dependency}`);
    if (dependency === task.id) fail(`${task.id}: self-dependency`);
  }
  const ordered = new Set();
  while (ordered.size < tasks.length) {
    const ready = tasks.filter(task => !ordered.has(task.id) && task.after.every(id => ordered.has(id)));
    if (!ready.length) fail(`Dependency cycle involving: ${tasks.filter(task => !ordered.has(task.id)).map(task => task.id).join(', ')}`);
    ready.forEach(task => ordered.add(task.id));
  }
  const completed = new Set(strings(input.completed, 'completed'));
  const failed = new Set(strings(input.failed, 'failed'));
  for (const id of [...completed, ...failed]) if (!ids.has(id)) fail(`Unknown state task: ${id}`);
  for (const id of completed) {
    if (failed.has(id)) fail(`${id}: cannot be both completed and failed`);
    const task = tasks.find(task => task.id === id);
    if (task.after.some(dependency => !completed.has(dependency))) fail(`${id}: completed task has an incomplete prerequisite`);
  }
  const unavailable = new Set(failed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (!completed.has(task.id) && !unavailable.has(task.id) && task.after.some(id => unavailable.has(id))) {
        unavailable.add(task.id);
        changed = true;
      }
    }
  }
  const blocked = tasks.filter(task => unavailable.has(task.id) && !failed.has(task.id))
    .map(task => ({ id: task.id, after: task.after.filter(id => unavailable.has(id)) }));
  const eligible = tasks.filter(task => !completed.has(task.id) && !unavailable.has(task.id));
  const briefs = eligible.map(task => {
    const text = capsule(task);
    const characters = length(text);
    if (characters > maxBrief) fail(`${task.id}: brief is ${characters} characters; cap is ${maxBrief}. Narrow the task or explicitly raise max_brief_chars.`);
    return { id: task.id, characters, text };
  });
  const conflicts = [];
  for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) {
    const reasons = conflictReasons(eligible[i], eligible[j]);
    if (reasons.length) conflicts.push({ tasks: [eligible[i].id, eligible[j].id], reasons });
  }
  const waves = [];
  const scheduled = new Set(completed);
  while (scheduled.size + unavailable.size < tasks.length) {
    const ready = tasks.filter(task => !scheduled.has(task.id) && !unavailable.has(task.id) && task.after.every(id => scheduled.has(id)));
    const wave = [];
    for (const task of ready) {
      if (wave.length === maxWorkers) break;
      if (wave.every(other => !conflictReasons(task, other).length)) wave.push(task);
    }
    waves.push(wave.map(task => task.id));
    wave.forEach(task => scheduled.add(task.id));
  }
  return { max_workers: maxWorkers, max_brief_chars: maxBrief, completed: [...completed], failed: [...failed], blocked, waves, conflicts, briefs };
}

export function markdown(result) {
  const lines = ['# RelayCrew plan', '', `Worker ceiling: ${result.max_workers}. Brief cap: ${result.max_brief_chars} Unicode characters.`, ''];
  result.waves.forEach((wave, index) => lines.push(`- Wave ${index + 1}: ${wave.join(' + ')}`));
  if (!result.waves.length) lines.push('No runnable tasks remain.');
  if (result.completed.length) lines.push('', `Verified completed: ${result.completed.join(', ')}`);
  if (result.failed.length) lines.push('', `Failed: ${result.failed.join(', ')}`);
  for (const task of result.blocked) lines.push(`- Blocked ${task.id}: requires ${task.after.join(', ')}`);
  if (result.conflicts.length) {
    lines.push('', '## Declared conflicts', '');
    for (const conflict of result.conflicts) lines.push(`- ${conflict.tasks.join(' / ')}: ${conflict.reasons.join('; ')}`);
  }
  lines.push('', 'Dispatch only after prerequisites pass. Claims are advisory; this does not launch or isolate agents.');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const usage = 'Usage: node plan.mjs <plan.json> [--format json|markdown] [--brief task-id]';
    if (args.length === 1 && args[0] === '--help') {
      process.stdout.write(`${usage}\n`);
    } else {
      if (!args.length || args[0].startsWith('--')) fail(usage);
      let format = 'json';
      let brief;
      let formatSet = false;
      for (let i = 1; i < args.length; i += 2) {
        if (args[i] === '--format' && args[i + 1] && !formatSet) {
          format = args[i + 1]; formatSet = true;
        } else if (args[i] === '--brief' && args[i + 1] && brief === undefined) {
          brief = args[i + 1];
        } else fail(usage);
      }
      if (!['json', 'markdown'].includes(format)) fail('format must be json or markdown');
      if (brief !== undefined && formatSet) fail('Use --brief or --format, not both');
      const input = JSON.parse(await readFile(args[0], 'utf8'));
      const result = plan(input);
      if (brief !== undefined) {
        const selected = result.briefs.find(item => item.id === brief);
        if (!selected) fail(`Unknown brief task: ${brief}`);
        if (!result.waves[0]?.includes(brief)) fail(`${brief}: not in the next runnable wave. Verify prerequisites and update completed/failed state first.`);
        process.stdout.write(`${selected.text}\n`);
      } else process.stdout.write(`${format === 'markdown' ? markdown(result) : JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    console.error(`RelayCrew: ${error.message}`);
    process.exitCode = 1;
  }
}
