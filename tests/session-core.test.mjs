import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, sessionNext, transition, previewMigration, migrateSession } from '../skills/relaycrew/scripts/session-core.mjs';

const task = (id, extra = {}) => ({ id, goal: `Complete ${id}`, writes: [`src/${id}`], checks: [`Verify ${id}`], ...extra });
const fixture = (tasks = [task('a'), task('b'), task('c', { after: ['a'] })], extra = {}) => ({ tasks, ...extra });
const copy = value => structuredClone(value);
const act = (plan, state, event) => transition(plan, state, event, state.revision);
const start = (plan, state, id, worker = `${id}-worker`) => act(plan, state, { type: 'start', task_id: id, worker });
const record = (state, id) => state.tasks.find(task => task.id === id);
const evidence = (plan, id, extra = {}) => ({ summary: `Completed ${id}`, changed_paths: [`src/${id}/index.js`], checks: plan.tasks.find(task => task.id === id).checks.map(check => ({ check, outcome: 'passed', evidence: 'Command exited 0; inspect the saved output before accepting' })), ...extra });
const report = (plan, state, id, extra = {}) => act(plan, state, { type: 'report', task_id: id, attempt_id: record(state, id).attempt_id, report: evidence(plan, id, extra) });
const accept = (plan, state, id) => act(plan, state, { type: 'accept', task_id: id, attempt_id: record(state, id).attempt_id, worker_stopped: true, review: 'Inspected the changes and reran the declared check' });
const stop = (plan, state, id) => act(plan, state, { type: 'fail', task_id: id, attempt_id: record(state, id).attempt_id, worker_stopped: true, reason: 'Confirmed the worker stopped; partial output inspected' });

test('new sessions bind a normalized definition and retain no worker state', () => {
  const plan = fixture();
  const before = copy(plan);
  const state = createSession(plan);
  assert.match(state.session_id, /^[0-9a-f-]{36}$/);
  assert.match(state.plan_hash, /^[0-9a-f]{64}$/);
  assert.equal(state.format, 1);
  assert.equal(state.revision, 0);
  assert.ok(state.tasks.every(task => task.status === 'pending' && task.attempt === 0 && task.attempt_id === null));
  assert.deepEqual(plan, before);
  assert.deepEqual(sessionNext(plan, state).task_ids, ['a', 'b']);
  const second = createSession(plan);
  assert.notEqual(second.session_id, state.session_id);
  assert.equal(second.plan_hash, state.plan_hash);
});

test('hash accepts equivalent defaults and key order but fences every definition change', () => {
  const plan = fixture();
  const state = createSession(plan);
  const equivalent = { max_brief_chars: 2400, max_workers: 2, tasks: plan.tasks.map(task => ({ checks: task.checks, writes: task.writes, goal: ` ${task.goal} `, id: task.id, reads: [], after: task.after ?? [], resources: [], context: '' })) };
  assert.equal(createSession(equivalent).plan_hash, state.plan_hash);
  assert.doesNotThrow(() => sessionNext(equivalent, state));
  for (const mutate of [
    plan => { plan.tasks[0].goal += ' differently'; },
    plan => { plan.tasks[0].context = 'A new requirement'; },
    plan => { plan.tasks[0].reads = ['README.md']; },
    plan => { plan.tasks[0].writes = ['other']; },
    plan => { plan.tasks[0].resources = ['db']; },
    plan => { plan.tasks[1].after = ['a']; },
    plan => { plan.tasks[0].checks.push('Another check'); },
    plan => { plan.tasks.reverse(); },
    plan => { plan.max_workers = 3; },
    plan => { plan.max_brief_chars = 2500; }
  ]) {
    const changed = copy(plan); mutate(changed);
    assert.throws(() => sessionNext(changed, state), /Plan definition changed/);
  }
});

test('session input rejects legacy state instead of silently adopting or overriding it', () => {
  const plan = fixture();
  const state = createSession(plan);
  for (const key of ['completed', 'failed', 'in_progress']) {
    const input = { ...plan, [key]: ['a'] };
    assert.throws(() => createSession(input), /without legacy/);
    assert.throws(() => sessionNext(input, state), /without legacy/);
  }
  assert.doesNotThrow(() => createSession({ ...plan, completed: [], failed: [], in_progress: [] }));
});

test('starting reserves capacity before launch and repeat next calls cannot redispatch it', () => {
  const plan = fixture();
  const initial = createSession(plan);
  const initialCopy = copy(initial);
  const state = start(plan, initial, 'a');
  assert.deepEqual(initial, initialCopy);
  assert.equal(state.revision, 1);
  assert.equal(record(state, 'a').status, 'running');
  assert.equal(record(state, 'a').attempt, 1);
  assert.equal(record(state, 'a').worker, 'a-worker');
  const bundle = sessionNext(plan, state);
  assert.deepEqual(bundle.task_ids, ['b']);
  assert.deepEqual(bundle.in_progress, ['a']);
  assert.equal(bundle.active[0].attempt_id, record(state, 'a').attempt_id);
  assert.equal(bundle.active[0].report, null);
  assert.equal(bundle.revision, 1);
  assert.deepEqual(sessionNext(plan, state), bundle);
  assert.throws(() => start(plan, state, 'a'), /not pending/);
  assert.throws(() => start(plan, state, 'c'), /not currently dispatchable/);
  const full = start(plan, state, 'b');
  assert.equal(sessionNext(plan, full).status, 'waiting');
  assert.deepEqual(sessionNext(plan, full).task_ids, []);
});

test('active writes and exclusive resources remain reserved while independent work progresses', () => {
  const plan = fixture([task('a', { writes: ['src'] }), task('reader', { reads: ['SRC/a.js'], writes: [] }), task('independent', { writes: ['docs'] })]);
  const state = start(plan, createSession(plan), 'a');
  assert.deepEqual(sessionNext(plan, state).task_ids, ['independent']);
  assert.throws(() => start(plan, state, 'reader'), /not currently dispatchable/);
  const resourcePlan = fixture([task('a', { resources: ['DB'] }), task('b', { resources: ['db'] })]);
  const resourceState = start(resourcePlan, createSession(resourcePlan), 'a');
  assert.equal(sessionNext(resourcePlan, resourceState).status, 'waiting');
});

test('reported work still holds claims and dependencies until reviewed and stopped', () => {
  const plan = fixture();
  const state = report(plan, start(plan, createSession(plan), 'a'), 'a');
  assert.equal(record(state, 'a').status, 'reported');
  assert.deepEqual(sessionNext(plan, state).task_ids, ['b']);
  assert.equal(sessionNext(plan, state).active[0].report.summary, 'Completed a');
  assert.throws(() => report(plan, state, 'a'), /only a running/);
  assert.throws(() => act(plan, state, { type: 'accept', task_id: 'a', attempt_id: record(state, 'a').attempt_id, worker_stopped: false, review: 'Checked' }), /worker_stopped/);
  const accepted = accept(plan, state, 'a');
  assert.deepEqual(sessionNext(plan, accepted).completed, ['a']);
  assert.deepEqual(sessionNext(plan, accepted).task_ids, ['b', 'c']);
  assert.deepEqual(sessionNext(plan, accepted).active, []);
});

test('completing one worker releases a slot without redispatching its still active peer', () => {
  const plan = fixture();
  let state = start(plan, createSession(plan), 'a');
  state = start(plan, state, 'b');
  state = accept(plan, report(plan, state, 'a'), 'a');
  assert.deepEqual(sessionNext(plan, state).task_ids, ['c']);
  assert.deepEqual(sessionNext(plan, state).in_progress, ['b']);
  state = start(plan, state, 'c');
  assert.equal(sessionNext(plan, state).status, 'waiting');
  assert.equal(sessionNext(plan, JSON.parse(JSON.stringify(state))).status, 'waiting');
});

test('failed checks can be reported but cannot be accepted', () => {
  const plan = fixture();
  const state = report(plan, start(plan, createSession(plan), 'a'), 'a', { checks: [{ check: 'Verify a', outcome: 'failed', evidence: 'Command exited 1 with a failed assertion' }] });
  assert.equal(record(state, 'a').status, 'reported');
  assert.throws(() => accept(plan, state, 'a'), /failed checks/);
  assert.equal(record(stop(plan, state, 'a'), 'a').status, 'failed');
});

test('failure releases reservations only after stopped confirmation and holds dependent work', () => {
  const plan = fixture();
  const state = start(plan, createSession(plan), 'a');
  const attempt_id = record(state, 'a').attempt_id;
  assert.throws(() => act(plan, state, { type: 'fail', task_id: 'a', attempt_id, worker_stopped: false, reason: 'Lost contact' }), /worker_stopped/);
  assert.equal(sessionNext(plan, state).active.length, 1);
  const failed = stop(plan, state, 'a');
  const bundle = sessionNext(plan, failed);
  assert.deepEqual(bundle.failed, ['a']);
  assert.deepEqual(bundle.blocked, [{ id: 'c', after: ['a'] }]);
  assert.deepEqual(bundle.task_ids, ['b']);
  assert.deepEqual(bundle.active, []);
});

test('retry replaces an attempt identity and rejects delayed results from the old worker', () => {
  const plan = fixture();
  let state = start(plan, createSession(plan), 'a');
  const old = record(state, 'a').attempt_id;
  state = stop(plan, state, 'a');
  state = act(plan, state, { type: 'retry', task_id: 'a', attempt_id: old });
  assert.equal(record(state, 'a').status, 'pending');
  assert.equal(record(state, 'a').attempt, 1);
  assert.equal(record(state, 'a').attempt_id, null);
  assert.throws(() => act(plan, state, { type: 'report', task_id: 'a', attempt_id: old, report: evidence(plan, 'a') }), /obsolete/);
  state = start(plan, state, 'a', 'replacement');
  assert.equal(record(state, 'a').attempt, 2);
  assert.notEqual(record(state, 'a').attempt_id, old);
  assert.throws(() => act(plan, state, { type: 'report', task_id: 'a', attempt_id: old, report: evidence(plan, 'a') }), /obsolete/);
  assert.throws(() => act(plan, state, { type: 'fail', task_id: 'a', attempt_id: old, worker_stopped: true, reason: 'Late message' }), /obsolete/);
  assert.equal(record(report(plan, state, 'a'), 'a').status, 'reported');
});

test('stale revisions reject concurrent updates and neither successful nor rejected transitions mutate inputs', () => {
  const plan = fixture();
  const state = createSession(plan);
  const event = { type: 'start', task_id: 'a', worker: 'worker' };
  const before = copy({ plan, state, event });
  const updated = transition(plan, state, event, 0);
  assert.deepEqual({ plan, state, event }, before);
  assert.throws(() => transition(plan, updated, { type: 'start', task_id: 'b', worker: 'another' }, 0), /Stale revision/);
  assert.equal(updated.revision, 1);
  for (const value of [undefined, null, -1, 0.1, '1', NaN, Infinity]) assert.throws(() => transition(plan, updated, event, value), /expected revision/);
});

test('report validation covers exactly the declared checks and requires evidence', () => {
  const plan = fixture([task('a', { checks: ['Build', 'Test'] })]);
  const state = start(plan, createSession(plan), 'a');
  for (const checks of [
    [],
    [{ check: 'Build', outcome: 'passed', evidence: 'OK' }],
    [{ check: 'Build', outcome: 'passed', evidence: 'OK' }, { check: 'Build', outcome: 'passed', evidence: 'OK' }],
    [{ check: 'Build', outcome: 'passed', evidence: 'OK' }, { check: 'Other', outcome: 'passed', evidence: 'OK' }],
    [{ check: 'Build', outcome: 'passed', evidence: 'OK' }, { check: 'Test', outcome: 'pending', evidence: 'OK' }],
    [{ check: 'Build', outcome: 'passed', evidence: 'OK' }, { check: 'Test', outcome: 'passed', evidence: ' ' }]
  ]) assert.throws(() => report(plan, state, 'a', { checks }), /check|evidence/);
  assert.throws(() => report(plan, state, 'a', { summary: ' ' }), /summary/);
  const accepted = report(plan, state, 'a', { checks: [{ check: ' Test ', outcome: 'passed', evidence: ' Exit 0 ' }, { check: 'Build', outcome: 'passed', evidence: 'Exit 0' }] });
  assert.deepEqual(record(accepted, 'a').report.checks[0], { check: 'Test', outcome: 'passed', evidence: 'Exit 0' });
});

test('changed paths must be literal declared writes, with no traversal, glob or prefix tricks', () => {
  const plan = fixture([task('a', { writes: ['src/a'] })]);
  const state = start(plan, createSession(plan), 'a');
  for (const changed_paths of [['../secret'], ['/tmp/file'], ['C:\\repo'], ['src/a/../b'], ['src/a/*'], ['src/a2/index.js'], ['src'], ['README.md'], ['src/a/x', 'SRC/A/x'], ['src/a/\nx']]) {
    assert.throws(() => report(plan, state, 'a', { changed_paths }), /path|traversal|writes/);
  }
  assert.deepEqual(record(report(plan, state, 'a', { changed_paths: ['.\\SRC\\a\\index.js'] }), 'a').report.changed_paths, ['SRC/a/index.js']);
  const readOnly = fixture([task('a', { writes: [], reads: ['README.md'] })]);
  const readState = start(readOnly, createSession(readOnly), 'a');
  assert.doesNotThrow(() => report(readOnly, readState, 'a', { changed_paths: [] }));
  assert.throws(() => report(readOnly, readState, 'a', { changed_paths: ['README.md'] }), /outside declared writes/);
});

test('event shape, task state and attempt identifiers are strictly checked', () => {
  const plan = fixture();
  const initial = createSession(plan);
  const running = start(plan, initial, 'a');
  for (const event of [null, {}, { type: 'invented' }, { type: 'start', task_id: 'a', worker: 'x', extra: true }, { type: 'start', task_id: 'a' }, { type: 'start', task_id: 'unknown', worker: 'x' }, { type: 'start', task_id: 'b', worker: '' }]) {
    assert.throws(() => act(plan, running, event));
  }
  const id = record(running, 'a').attempt_id;
  assert.throws(() => act(plan, running, { type: 'accept', task_id: 'a', attempt_id: id, worker_stopped: true, review: 'Checked' }), /only a reported/);
  assert.throws(() => act(plan, running, { type: 'retry', task_id: 'a', attempt_id: id }), /only a failed/);
  const reported = report(plan, running, 'a');
  assert.throws(() => act(plan, reported, { type: 'accept', task_id: 'a', attempt_id: id, worker_stopped: true, review: '' }), /review/);
  const completed = accept(plan, reported, 'a');
  assert.throws(() => stop(plan, completed, 'a'), /only a running or reported/);
});

test('checkpoint corruption cannot bypass state, claim, attempt or prerequisite validation', () => {
  const plan = fixture();
  const running = start(plan, createSession(plan), 'a');
  for (const mutate of [
    state => { state.extra = true; },
    state => { delete state.format; },
    state => { state.format = 2; },
    state => { state.session_id = 'not-a-uuid'; },
    state => { state.plan_hash = 'f'.repeat(64); },
    state => { state.revision = 1.5; },
    state => { state.tasks.reverse(); },
    state => { state.tasks.pop(); },
    state => { record(state, 'a').unknown = true; },
    state => { record(state, 'a').status = 'done'; },
    state => { record(state, 'a').attempt = 0; },
    state => { record(state, 'a').attempt_id = null; },
    state => { record(state, 'a').worker = ''; },
    state => { record(state, 'a').report = evidence(plan, 'a'); },
    state => { record(state, 'a').failure = 'Unexpected'; },
    state => { record(state, 'b').worker = 'Unexpected'; },
    state => { Object.assign(record(state, 'c'), { ...record(state, 'a'), id: 'c' }); }
  ]) {
    const changed = copy(running); mutate(changed);
    assert.throws(() => sessionNext(plan, changed));
  }
  const dependent = copy(running);
  Object.assign(record(dependent, 'c'), { ...record(running, 'a'), id: 'c', attempt_id: createSession(plan).session_id });
  assert.throws(() => sessionNext(plan, dependent), /incomplete prerequisite/);
  const cap = fixture([task('a'), task('b')], { max_workers: 1 });
  const one = start(cap, createSession(cap), 'a');
  Object.assign(record(one, 'b'), { ...record(one, 'a'), id: 'b', attempt_id: createSession(cap).session_id });
  assert.throws(() => sessionNext(cap, one), /max_workers|ceiling/);
});

test('completed and failed checkpoint records retain the required evidence and review', () => {
  const plan = fixture();
  const completed = accept(plan, report(plan, start(plan, createSession(plan), 'a'), 'a'), 'a');
  for (const mutate of [
    state => { record(state, 'a').report = null; },
    state => { record(state, 'a').review = null; },
    state => { record(state, 'a').report.checks[0].outcome = 'failed'; },
    state => { record(state, 'a').failure = 'Unexpected'; }
  ]) { const changed = copy(completed); mutate(changed); assert.throws(() => sessionNext(plan, changed)); }
  const failed = stop(plan, start(plan, createSession(plan), 'a'), 'a');
  record(failed, 'a').failure = null;
  assert.throws(() => sessionNext(plan, failed), /failure/);
});

test('held and complete sessions remain distinct, and active bundle reports do not alias the checkpoint', () => {
  const plan = fixture([task('a'), task('c', { after: ['a'] })]);
  const failed = stop(plan, start(plan, createSession(plan), 'a'), 'a');
  assert.equal(sessionNext(plan, failed).status, 'held');
  let state = report(plan, start(plan, createSession(plan), 'a'), 'a');
  const bundle = sessionNext(plan, state);
  bundle.active[0].report.summary = 'Mutated outside';
  assert.equal(record(state, 'a').report.summary, 'Completed a');
  state = accept(plan, state, 'a');
  state = accept(plan, report(plan, start(plan, state, 'c'), 'c'), 'c');
  const done = sessionNext(plan, state);
  assert.equal(done.status, 'complete');
  assert.deepEqual(done.completed, ['a', 'c']);
  assert.deepEqual(done.task_ids, []);
  assert.deepEqual(done.active, []);
});

test('session creation validates structure without forcing oversized future handoffs to render', () => {
  const plan = fixture([task('a'), task('b', { after: ['a'], context: 'x'.repeat(3000) })]);
  const state = createSession(plan);
  assert.deepEqual(sessionNext(plan, state).task_ids, ['a']);
  const completed = accept(plan, report(plan, start(plan, state, 'a'), 'a'), 'a');
  assert.throws(() => sessionNext(plan, completed), /brief is/);
});

const migrationFixture = () => fixture([
  task('api'), task('ui'), task('docs', {after:['api']}), task('review', {after:['docs']}), task('retired')
]);
const completedFixture = plan => {
  let state=createSession(plan);
  for(const id of ['api','ui','docs','review','retired']) state=accept(plan,report(plan,start(plan,state,id),id),id);
  return state;
};
const migrationRequest = preview => ({new_plan_hash:preview.new_plan_hash,workers_stopped:true,review:'Synthetic fixture: coordinator reviewed the proposed reset and retained evidence.'});

test('migration preserves independent completions while resetting a changed task and its completed descendants',()=>{
  const oldPlan=migrationFixture();
  const state=completedFixture(oldPlan);
  const nextPlan=copy(oldPlan);
  nextPlan.tasks[0].goal='Implement API version 2';
  nextPlan.tasks=nextPlan.tasks.filter(task=>task.id!=='retired');
  nextPlan.tasks.push(task('new-task'));
  const before=copy({oldPlan,nextPlan,state});
  const preview=previewMigration(oldPlan,nextPlan,state);
  assert.deepEqual(preview.kept_completed,['ui']);
  assert.deepEqual(preview.reset.map(task=>task.id),['api','docs','review']);
  assert.deepEqual(preview.added,['new-task']);
  assert.deepEqual(preview.removed,['retired']);
  assert.equal(preview.plan_changed,true);
  const request=migrationRequest(preview);
  const migrated=migrateSession(oldPlan,nextPlan,state,request,state.revision);
  assert.equal(migrated.checkpoint.session_id,state.session_id);
  assert.equal(migrated.checkpoint.format,1);
  assert.equal(migrated.checkpoint.revision,state.revision+1);
  assert.equal(migrated.checkpoint.plan_hash,preview.new_plan_hash);
  assert.deepEqual(Object.keys(migrated.checkpoint),Object.keys(state));
  assert.deepEqual(record(migrated.checkpoint,'ui'),record(state,'ui'));
  assert.equal(record(migrated.checkpoint,'api').attempt,1);
  assert.equal(record(migrated.checkpoint,'api').attempt_id,null);
  assert.equal(record(migrated.checkpoint,'api').report,null);
  assert.equal(record(migrated.checkpoint,'new-task').attempt,0);
  assert.deepEqual(sessionNext(nextPlan,migrated.checkpoint).task_ids,['api','new-task']);
  assert.throws(()=>sessionNext(oldPlan,migrated.checkpoint),/Plan definition changed/);
  assert.deepEqual({oldPlan,nextPlan,state},before);
  assert.deepEqual(migrated.migration,{...preview,review:request.review});
});

test('every task definition category invalidates its completion and dependent evidence',()=>{
  const oldPlan=migrationFixture();
  const state=completedFixture(oldPlan);
  for(const mutate of [
    task=>{task.goal+=' differently';},task=>{task.context='A revised contract';},
    task=>{task.reads=['contract-v2.md'];},task=>{task.writes=['new-api'];},
    task=>{task.resources=['test-db'];},task=>{task.checks=['Verify the new API'];},
    task=>{task.after=['ui'];}
  ]) {
    const nextPlan=copy(oldPlan);mutate(nextPlan.tasks[0]);
    const preview=previewMigration(oldPlan,nextPlan,state);
    assert.deepEqual(preview.kept_completed,['ui','retired']);
    assert.deepEqual(preview.reset.map(task=>task.id),['api','docs','review']);
    assert.ok(preview.reset.every(task=>task.reasons.length));
    const migrated=migrateSession(oldPlan,nextPlan,state,migrationRequest(preview),state.revision).checkpoint;
    for(const id of ['api','docs','review']) {
      assert.equal(record(migrated,id).status,'pending');
      assert.equal(record(migrated,id).report,null);
      assert.equal(record(migrated,id).review,null);
    }
  }
});

test('reordered tasks and changed limits retain valid evidence in the new order',()=>{
  const oldPlan=migrationFixture();
  const state=completedFixture(oldPlan);
  const nextPlan={...copy(oldPlan),max_workers:1,max_brief_chars:2500};
  nextPlan.tasks.reverse();
  const preview=previewMigration(oldPlan,nextPlan,state);
  assert.deepEqual(preview.kept_completed,['retired','review','docs','ui','api']);
  assert.deepEqual(preview.reset,[]);
  const migrated=migrateSession(oldPlan,nextPlan,state,migrationRequest(preview),state.revision).checkpoint;
  assert.equal(sessionNext(nextPlan,migrated).status,'complete');
  assert.deepEqual(migrated.tasks.map(task=>task.id),nextPlan.tasks.map(task=>task.id));
});

test('migration retains unchanged failure holds but resets failures whose prerequisite evidence changed',()=>{
  const oldPlan=fixture([task('api'),task('failed',{after:['api']}),task('dependent',{after:['failed']}),task('unrelated')]);
  let state=accept(oldPlan,report(oldPlan,start(oldPlan,createSession(oldPlan),'api'),'api'),'api');
  state=stop(oldPlan,start(oldPlan,state,'failed'),'failed');
  const nextPlan=copy(oldPlan);nextPlan.tasks.push(task('new-task'));
  const preview=previewMigration(oldPlan,nextPlan,state);
  assert.deepEqual(preview.kept_failed,['failed']);
  const kept=migrateSession(oldPlan,nextPlan,state,migrationRequest(preview),state.revision).checkpoint;
  assert.deepEqual(sessionNext(nextPlan,kept).failed,['failed']);
  assert.deepEqual(sessionNext(nextPlan,kept).blocked,[{id:'dependent',after:['failed']}]);
  nextPlan.tasks[0].goal+=' with a changed contract';
  const reset=previewMigration(oldPlan,nextPlan,state);
  assert.deepEqual(reset.kept_failed,[]);
  const changed=migrateSession(oldPlan,nextPlan,state,migrationRequest(reset),state.revision).checkpoint;
  assert.equal(record(changed,'failed').status,'pending');
  assert.equal(record(changed,'failed').failure,null);
  assert.equal(record(changed,'failed').attempt,1);
});

test('preview and migration reject running or reported workers even when the task will be removed',()=>{
  const oldPlan=fixture([task('a'),task('b')]);
  const nextPlan=fixture([task('b')]);
  const started=start(oldPlan,createSession(oldPlan),'a');
  for(const state of [started,report(oldPlan,started,'a')]) {
    const before=copy(state);
    assert.throws(()=>previewMigration(oldPlan,nextPlan,state),/active or reported/);
    assert.throws(()=>migrateSession(oldPlan,nextPlan,state,{new_plan_hash:'x',workers_stopped:true,review:'Synthetic review'},state.revision),/active or reported/);
    assert.deepEqual(state,before);
  }
});

test('migration requires a matching target hash, fresh revision, explicit stopped assertion and review',()=>{
  const oldPlan=fixture([task('a')]);
  const state=createSession(oldPlan);
  const nextPlan=fixture([task('a'),task('b')]);
  const preview=previewMigration(oldPlan,nextPlan,state);
  const request=migrationRequest(preview);
  const before=copy({oldPlan,nextPlan,state,request});
  for(const changed of [
    {...request,new_plan_hash:'0'.repeat(64)}, {...request,workers_stopped:false},
    {...request,workers_stopped:'true'}, {...request,review:' '}, {...request,extra:true},
    {new_plan_hash:request.new_plan_hash,workers_stopped:true}
  ]) assert.throws(()=>migrateSession(oldPlan,nextPlan,state,changed,state.revision));
  assert.throws(()=>migrateSession(oldPlan,nextPlan,state,request,1),/Stale revision/);
  for(const revision of [undefined,null,-1,0.1,'0',Infinity]) assert.throws(()=>migrateSession(oldPlan,nextPlan,state,request,revision),/expected revision/);
  assert.deepEqual({oldPlan,nextPlan,state,request},before);
});

test('equivalent normalized plans preview as unchanged and migration rejects a no-op',()=>{
  const oldPlan=fixture([task('a')]);
  const state=createSession(oldPlan);
  const nextPlan={max_workers:2,max_brief_chars:2400,tasks:[{...task('a'),goal:' Complete a ',context:'',reads:[],resources:[],after:[]}]};
  const preview=previewMigration(oldPlan,nextPlan,state);
  assert.equal(preview.plan_changed,false);
  assert.equal(preview.old_plan_hash,preview.new_plan_hash);
  assert.throws(()=>migrateSession(oldPlan,nextPlan,state,migrationRequest(preview),0),/unchanged/);
});

test('reset task starts a fresh attempt and rejects results from the old completed or failed attempt',()=>{
  const oldPlan=fixture([task('a')]);
  for(const state of [accept(oldPlan,report(oldPlan,start(oldPlan,createSession(oldPlan),'a'),'a'),'a'),stop(oldPlan,start(oldPlan,createSession(oldPlan),'a'),'a')]) {
    const oldId=record(state,'a').attempt_id;
    const nextPlan=copy(oldPlan);nextPlan.tasks[0].goal+=' version 2';
    const preview=previewMigration(oldPlan,nextPlan,state);
    let migrated=migrateSession(oldPlan,nextPlan,state,migrationRequest(preview),state.revision).checkpoint;
    assert.throws(()=>act(nextPlan,migrated,{type:'report',task_id:'a',attempt_id:oldId,report:evidence(nextPlan,'a')}),/obsolete/);
    migrated=start(nextPlan,migrated,'a','replacement');
    assert.equal(record(migrated,'a').attempt,2);
    assert.notEqual(record(migrated,'a').attempt_id,oldId);
    assert.throws(()=>act(nextPlan,migrated,{type:'report',task_id:'a',attempt_id:oldId,report:evidence(nextPlan,'a')}),/obsolete/);
    assert.equal(record(report(nextPlan,migrated,'a'),'a').status,'reported');
  }
});

test('migration validates both plans and the old checkpoint rather than importing claimed legacy state',()=>{
  const oldPlan=fixture([task('a')]);
  const state=createSession(oldPlan);
  for(const nextPlan of [fixture([task('a'),task('b',{after:['missing']})]),{...oldPlan,completed:['a']},{...oldPlan,in_progress:['a']},{...oldPlan,failed:['a']}]) {
    assert.throws(()=>previewMigration(oldPlan,nextPlan,state));
  }
  const corrupted=copy(state);corrupted.tasks[0].status='completed';
  assert.throws(()=>previewMigration(oldPlan,fixture([task('a'),task('b')]),corrupted),/attempt identity/);
  const wrongOld=copy(oldPlan);wrongOld.tasks[0].goal+=' stale';
  assert.throws(()=>previewMigration(wrongOld,oldPlan,state),/Plan definition changed/);
});
