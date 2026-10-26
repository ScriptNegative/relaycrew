import { createHash, randomUUID } from 'node:crypto';
import { validate, next } from './plan.mjs';

const fail = message => { throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const states = ['pending', 'running', 'reported', 'completed', 'failed'];
const active = task => task.status === 'running' || task.status === 'reported';

function fields(value, allowed, label) {
  if (!object(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Unknown ${label} field: ${key}`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`Missing ${label} field: ${key}`);
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
  return value.trim();
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function definition(input) {
  const normalized = validate(input);
  if (normalized.completed.length || normalized.failed.length || normalized.in_progress.length) {
    fail('Sessions require a plan without legacy completed, failed or in_progress state; use the checkpoint for session state');
  }
  const { tasks, max_workers, max_brief_chars } = normalized;
  const plan = { tasks, max_workers, max_brief_chars };
  return { plan, hash: createHash('sha256').update(canonical(plan)).digest('hex') };
}

function literalPath(value) {
  const input = text(value, 'changed path');
  const normalized = input.replaceAll('\\', '/').replace(/\/+$/, '') || '/';
  if (normalized.startsWith('/') || /[:*?\[\]{}\x00-\x1f]/.test(normalized)) fail(`Invalid changed path: ${input}`);
  const parts = normalized.split('/');
  if (parts.includes('..')) fail(`Parent traversal is not allowed in changed path: ${input}`);
  return parts.filter(part => part && part !== '.').join('/') || '.';
}

function within(file, scope) {
  const a = file.toLowerCase();
  const b = scope.toLowerCase();
  return b === '.' || a === b || a.startsWith(`${b}/`);
}

function receipt(value, task) {
  fields(value, ['summary', 'changed_paths', 'checks'], `${task.id} report`);
  const summary = text(value.summary, `${task.id} report.summary`);
  if (!Array.isArray(value.changed_paths)) fail(`${task.id} changed_paths must be an array`);
  const changed_paths = value.changed_paths.map(literalPath);
  if (new Set(changed_paths.map(item => item.toLowerCase())).size !== changed_paths.length) fail(`${task.id} duplicate changed paths`);
  for (const file of changed_paths) if (!task.writes.some(scope => within(file, scope))) {
    fail(`${task.id} changed path outside declared writes: ${file}`);
  }
  if (!Array.isArray(value.checks) || value.checks.length !== task.checks.length) fail(`${task.id} report must cover every declared check exactly once`);
  const seen = new Set();
  const checks = value.checks.map(item => {
    fields(item, ['check', 'outcome', 'evidence'], `${task.id} reported check`);
    const check = text(item.check, `${task.id} reported check`);
    if (!task.checks.includes(check) || seen.has(check)) fail(`${task.id} report must cover every declared check exactly once`);
    seen.add(check);
    if (!['passed', 'failed'].includes(item.outcome)) fail(`${task.id} check outcome must be passed or failed`);
    return { check, outcome: item.outcome, evidence: text(item.evidence, `${task.id} check evidence`) };
  });
  return { summary, changed_paths, checks };
}

function derived(plan, checkpoint) {
  return {
    ...plan,
    completed: checkpoint.tasks.filter(task => task.status === 'completed').map(task => task.id),
    failed: checkpoint.tasks.filter(task => task.status === 'failed').map(task => task.id),
    in_progress: checkpoint.tasks.filter(active).map(task => task.id)
  };
}

function inspect(input, checkpoint) {
  const { plan, hash } = definition(input);
  fields(checkpoint, ['format', 'session_id', 'plan_hash', 'revision', 'tasks'], 'checkpoint');
  if (checkpoint.format !== 1) fail('Unsupported checkpoint format');
  if (!uuid(checkpoint.session_id)) fail('Invalid checkpoint session_id');
  if (checkpoint.plan_hash !== hash) fail('Plan definition changed or checkpoint plan_hash is invalid; use the plan matching this checkpoint. For an intentional change, resolve active work and review compare/migrate with the old and new plans.');
  integer(checkpoint.revision, 'checkpoint revision');
  if (!Array.isArray(checkpoint.tasks) || checkpoint.tasks.length !== plan.tasks.length) fail('Checkpoint tasks must match the plan exactly and in order');
  const attempts = new Set();
  checkpoint.tasks.forEach((record, index) => {
    const task = plan.tasks[index];
    fields(record, ['id', 'status', 'attempt', 'attempt_id', 'worker', 'report', 'failure', 'review'], `checkpoint task ${index}`);
    if (record.id !== task.id) fail('Checkpoint tasks must match the plan exactly and in order');
    if (!states.includes(record.status)) fail(`${task.id}: invalid checkpoint status`);
    integer(record.attempt, `${task.id} attempt`);
    if (record.status === 'pending') {
      if (['attempt_id', 'worker', 'report', 'failure', 'review'].some(key => record[key] !== null)) fail(`${task.id}: pending task must have null attempt details`);
      return;
    }
    if (record.attempt < 1 || !uuid(record.attempt_id)) fail(`${task.id}: invalid attempt identity`);
    const attemptKey = record.attempt_id.toLowerCase();
    if (attempts.has(attemptKey)) fail('Duplicate checkpoint attempt_id');
    attempts.add(attemptKey);
    text(record.worker, `${task.id} worker`);
    if (record.status === 'running') {
      if (record.report !== null || record.failure !== null || record.review !== null) fail(`${task.id}: running task cannot contain report, failure or review`);
    } else {
      if (record.report !== null) receipt(record.report, task);
      if (record.status === 'reported' || record.status === 'completed') {
        if (record.report === null) fail(`${task.id}: ${record.status} task requires a report`);
        if (record.failure !== null) fail(`${task.id}: ${record.status} task cannot contain a failure`);
      }
      if (record.status === 'completed') {
        text(record.review, `${task.id} review`);
        if (record.report.checks.some(check => check.outcome !== 'passed')) fail(`${task.id}: completed task requires all checks passed`);
      } else if (record.review !== null) fail(`${task.id}: only completed tasks may contain a review`);
      if (record.status === 'failed') text(record.failure, `${task.id} failure`);
    }
  });
  const completed = new Set(checkpoint.tasks.filter(task => task.status === 'completed').map(task => task.id));
  for (const task of plan.tasks) {
    const record = checkpoint.tasks.find(item => item.id === task.id);
    if (record.status !== 'pending' && task.after.some(id => !completed.has(id))) fail(`${task.id}: attempted task has an incomplete prerequisite`);
  }
  validate(derived(plan, checkpoint));
  return plan;
}

export function createSession(input) {
  const { plan, hash } = definition(input);
  return {
    format: 1,
    session_id: randomUUID(),
    plan_hash: hash,
    revision: 0,
    tasks: plan.tasks.map(task => ({ id: task.id, status: 'pending', attempt: 0, attempt_id: null, worker: null, report: null, failure: null, review: null }))
  };
}

export function sessionNext(input, checkpoint) {
  const plan = inspect(input, checkpoint);
  return {
    ...next(derived(plan, checkpoint)),
    session_id: checkpoint.session_id,
    revision: checkpoint.revision,
    plan_hash: checkpoint.plan_hash,
    active: checkpoint.tasks.filter(active).map(record => ({ task_id: record.id, attempt_id: record.attempt_id, worker: record.worker, status: record.status, report: record.report === null ? null : structuredClone(record.report) }))
  };
}

function pendingRecord(id, attempt = 0) {
  return { id, status: 'pending', attempt, attempt_id: null, worker: null, report: null, failure: null, review: null };
}

function migrationAnalysis(oldInput, newInput, checkpoint) {
  const oldPlan = inspect(oldInput, checkpoint);
  const { plan: newPlan, hash } = definition(newInput);
  const running = checkpoint.tasks.filter(active).map(task => task.id);
  if (running.length) fail(`Cannot compare or migrate with active or reported work: ${running.join(', ')}. Confirm workers stopped, then accept or fail their current attempts using the old plan.`);

  const previous = new Map(oldPlan.tasks.map(task => [task.id, task]));
  const records = new Map(checkpoint.tasks.map(task => [task.id, task]));
  const current = new Map(newPlan.tasks.map(task => [task.id, task]));
  const changed = new Set(newPlan.tasks.filter(task => previous.has(task.id) && canonical(task) !== canonical(previous.get(task.id))).map(task => task.id));
  const affected = new Set([...changed, ...newPlan.tasks.filter(task => !previous.has(task.id)).map(task => task.id)]);
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const task of newPlan.tasks) if (!affected.has(task.id) && task.after.some(id => affected.has(id))) {
      affected.add(task.id);
      progressed = true;
    }
  }

  // Completion survives only through a chain of retained completed prerequisites.
  // This deliberately compares definitions, not actual source or test freshness.
  const retained = new Set();
  progressed = true;
  while (progressed) {
    progressed = false;
    for (const task of newPlan.tasks) {
      if (!retained.has(task.id) && !changed.has(task.id) && records.get(task.id)?.status === 'completed' && task.after.every(id => retained.has(id))) {
        retained.add(task.id);
        progressed = true;
      }
    }
  }

  const keptFailed = [];
  const reset = [];
  const tasks = newPlan.tasks.map(task => {
    const record = records.get(task.id);
    if (!record) return pendingRecord(task.id);
    if (retained.has(task.id)) return structuredClone(record);
    const reasons = [];
    if (changed.has(task.id)) reasons.push('Task definition changed');
    const missing = task.after.filter(id => !retained.has(id));
    if (record.status !== 'pending' && missing.length) reasons.push(`Prerequisite completion not retained: ${missing.join(', ')}`);
    if (!changed.has(task.id) && affected.has(task.id)) reasons.push('A prerequisite definition changed');
    if (!reasons.length && record.status === 'failed') {
      keptFailed.push(task.id);
      return structuredClone(record);
    }
    if (!reasons.length && record.status === 'pending') return structuredClone(record);
    reset.push({ id: task.id, reasons });
    return pendingRecord(task.id, record.attempt);
  });
  const preview = {
    session_id: checkpoint.session_id,
    revision: checkpoint.revision,
    old_plan_hash: checkpoint.plan_hash,
    new_plan_hash: hash,
    kept_completed: newPlan.tasks.filter(task => retained.has(task.id)).map(task => task.id),
    kept_failed: keptFailed,
    reset,
    added: newPlan.tasks.filter(task => !previous.has(task.id)).map(task => task.id),
    removed: oldPlan.tasks.filter(task => !current.has(task.id)).map(task => task.id),
    plan_changed: checkpoint.plan_hash !== hash
  };
  return { preview, tasks };
}

export function previewMigration(oldInput, newInput, checkpoint) {
  return migrationAnalysis(oldInput, newInput, checkpoint).preview;
}

export function migrateSession(oldInput, newInput, checkpoint, request, expectedRevision) {
  const { preview, tasks } = migrationAnalysis(oldInput, newInput, checkpoint);
  integer(expectedRevision, 'expected revision');
  if (checkpoint.revision !== expectedRevision) fail(`Stale revision: expected ${expectedRevision}, current ${checkpoint.revision}`);
  fields(request, ['new_plan_hash', 'workers_stopped', 'review'], 'migration request');
  if (request.new_plan_hash !== preview.new_plan_hash) fail('Migration target hash does not match the proposed new plan; compare and review the current plans again');
  if (request.workers_stopped !== true) fail('workers_stopped must be true after confirming all old workers stopped');
  const review = text(request.review, 'migration review');
  if (!preview.plan_changed) fail('Plan definition is unchanged; no migration is needed');
  integer(checkpoint.revision + 1, 'next revision');
  const updated = {
    format: checkpoint.format,
    session_id: checkpoint.session_id,
    plan_hash: preview.new_plan_hash,
    revision: checkpoint.revision + 1,
    tasks
  };
  inspect(newInput, updated);
  return { checkpoint: updated, migration: { ...preview, review } };
}

export function transition(input, checkpoint, event, expectedRevision) {
  const plan = inspect(input, checkpoint);
  integer(expectedRevision, 'expected revision');
  if (checkpoint.revision !== expectedRevision) fail(`Stale revision: expected ${expectedRevision}, current ${checkpoint.revision}`);
  if (!object(event) || !['start', 'report', 'accept', 'fail', 'retry'].includes(event.type)) fail('Unknown session event type');
  const allowed = {
    start: ['type', 'task_id', 'worker'],
    report: ['type', 'task_id', 'attempt_id', 'report'],
    accept: ['type', 'task_id', 'attempt_id', 'worker_stopped', 'review'],
    fail: ['type', 'task_id', 'attempt_id', 'worker_stopped', 'reason'],
    retry: ['type', 'task_id', 'attempt_id']
  };
  fields(event, allowed[event.type], `${event.type} event`);
  const updated = structuredClone(checkpoint);
  const record = updated.tasks.find(task => task.id === event.task_id);
  if (!record) fail(`Unknown session task: ${event.task_id}`);
  const task = plan.tasks.find(task => task.id === record.id);
  if (event.type === 'start') {
    if (record.status !== 'pending') fail(`${record.id}: task is ${record.status}, not pending`);
    if (!next(derived(plan, checkpoint)).task_ids.includes(record.id)) fail(`${record.id}: task is not currently dispatchable`);
    integer(record.attempt + 1, `${record.id} next attempt`, 1);
    Object.assign(record, { status: 'running', attempt: record.attempt + 1, attempt_id: randomUUID(), worker: text(event.worker, `${record.id} worker`) });
  } else {
    if (!uuid(event.attempt_id) || event.attempt_id !== record.attempt_id) fail(`${record.id}: obsolete or unknown attempt_id`);
    if (event.type === 'report') {
      if (record.status !== 'running') fail(`${record.id}: only a running attempt can report`);
      Object.assign(record, { status: 'reported', report: receipt(event.report, task) });
    } else if (event.type === 'accept') {
      if (record.status !== 'reported') fail(`${record.id}: only a reported attempt can be accepted`);
      if (event.worker_stopped !== true) fail(`${record.id}: worker_stopped must be true after confirming the worker stopped`);
      if (record.report.checks.some(check => check.outcome !== 'passed')) fail(`${record.id}: cannot accept a report with failed checks`);
      Object.assign(record, { status: 'completed', review: text(event.review, `${record.id} review`) });
    } else if (event.type === 'fail') {
      if (!active(record)) fail(`${record.id}: only a running or reported attempt can fail`);
      if (event.worker_stopped !== true) fail(`${record.id}: worker_stopped must be true after confirming the worker stopped`);
      Object.assign(record, { status: 'failed', failure: text(event.reason, `${record.id} reason`) });
    } else {
      if (record.status !== 'failed') fail(`${record.id}: only a failed attempt can retry. Confirm the worker stopped, inspect partial work, then record fail before retry.`);
      Object.assign(record, { status: 'pending', attempt_id: null, worker: null, report: null, failure: null, review: null });
    }
  }
  integer(checkpoint.revision + 1, 'next revision');
  updated.revision++;
  inspect(input, updated);
  return updated;
}
