import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { plan, next, markdown, validate } from '../skills/relaycrew/scripts/plan.mjs';

const task = (id, extra = {}) => ({ id, goal: `Complete ${id}`, checks: ['Verify the outcome'], ...extra });
const schedule = (tasks, extra = {}) => plan({ tasks, ...extra });
const script = fileURLToPath(new URL('../skills/relaycrew/scripts/plan.mjs', import.meta.url));
const cli = (file, ...args) => spawnSync(process.execPath, [script, file, ...args], { encoding: 'utf8' });
const withPlanFile = async (input, inspect) => {
  const tempRoot = path.resolve(tmpdir());
  const scratch = await mkdtemp(path.join(tempRoot, 'relaycrew-plan-'));
  try {
    const file = path.join(scratch, 'plan.json');
    await writeFile(file, typeof input === 'string' ? input : JSON.stringify(input));
    await inspect(file);
  } finally {
    const resolved = path.resolve(scratch);
    assert.ok(resolved.startsWith(`${tempRoot}${path.sep}`) && path.basename(resolved).startsWith('relaycrew-plan-'));
    await rm(resolved, { recursive: true, force: true });
  }
};

test('independent writers share a wave up to the worker limit', () => {
  const tasks = ['a', 'b', 'c', 'd', 'e'].map(id => task(id, { writes: [`src/${id}`] }));
  assert.deepEqual(schedule(tasks).waves, [['a', 'b'], ['c', 'd'], ['e']]);
  assert.deepEqual(schedule(tasks, { max_workers: 1 }).waves, [['a'], ['b'], ['c'], ['d'], ['e']]);
});

test('directory writers cannot overlap readers or writers in descendants', () => {
  const result = schedule([task('a', { writes: ['src'] }), task('b', { reads: ['src/a.ts'] }), task('c', { writes: ['src/b.ts'] })]);
  assert.deepEqual(result.waves, [['a'], ['b', 'c']]);
  assert.equal(result.conflicts.length, 2);
});

test('read/read overlap is allowed and adjacent names do not collide', () => {
  assert.deepEqual(schedule([task('a', { reads: ['src'] }), task('b', { reads: ['src/a.ts'] })]).waves, [['a', 'b']]);
  assert.deepEqual(schedule([task('a', { writes: ['src/api'] }), task('b', { writes: ['src/api-client'] })]).waves, [['a', 'b']]);
});

test('dependency order is honored even if consumers precede producers in input', () => {
  assert.deepEqual(schedule([task('c', { after: ['b'] }), task('b', { after: ['a'] }), task('a')]).waves, [['a'], ['b'], ['c']]);
});

test('shared mutable resources serialize otherwise separate tasks', () => {
  assert.deepEqual(schedule([task('a', { resources: ['Test-DB'] }), task('b', { resources: ['test-db'] })]).waves, [['a'], ['b']]);
});

test('Windows separators, case, dot segments and trailing slashes normalize', () => {
  const result = schedule([task('a', { writes: ['SRC\\API\\'] }), task('b', { reads: ['./src//api/index.ts'] })]);
  assert.deepEqual(result.waves, [['a'], ['b']]);
  assert.match(result.briefs[0].text, /Write: SRC\/API/);
});

test('the repository root conflicts with every file', () => {
  assert.deepEqual(schedule([task('a', { writes: ['.'] }), task('b', { reads: ['README.md'] })]).waves, [['a'], ['b']]);
});

test('rejects unsafe or ambiguous path claims', () => {
  for (const value of ['../secret', 'src/../secret', '/etc/passwd', 'C:\\repo', '\\\\host\\share', 'src/*', 'src/?.ts', 'src/[ab]', 'file:thing', 'src/\nfile']) {
    assert.throws(() => schedule([task('a', { writes: [value] })]), /claim|traversal/);
  }
});

test('rejects duplicate, missing, self and cyclic dependencies', () => {
  assert.throws(() => schedule([task('a'), task('a')]), /Duplicate/);
  assert.throws(() => schedule([task('a', { after: ['missing'] })]), /unknown dependency/);
  assert.throws(() => schedule([task('a', { after: ['a'] })]), /self-dependency/);
  assert.throws(() => schedule([task('a', { after: ['b'] }), task('b', { after: ['a'] })]), /cycle/);
});

test('rejects malformed tasks, misspelled fields and invalid limits', () => {
  for (const max_workers of [null, 0, 65, 1.5, '2']) assert.throws(() => schedule([task('a')], { max_workers }), /max_workers/);
  assert.throws(() => schedule([]), /non-empty/);
  assert.throws(() => schedule([task('a', { checks: [] })]), /checks/);
  assert.throws(() => schedule([task('a', { write: ['src'] })]), /Unknown/);
  assert.throws(() => schedule([task('a', { context: 1 })]), /context/);
  assert.throws(() => plan(null), /object/);
});

test('resumes from verified completed tasks and holds transitive dependents of failures', () => {
  const tasks = [task('a'), task('b'), task('c', {after:['b']}), task('d', {after:['c']}), task('e', {after:['a']})];
  const result = schedule(tasks, {completed:['a'], failed:['b']});
  assert.deepEqual(result.waves, [['e']]);
  assert.deepEqual(result.blocked, [{id:'c',after:['b']},{id:'d',after:['c']}]);
  assert.deepEqual(result.completed, ['a']);
  assert.deepEqual(result.failed, ['b']);
  assert.deepEqual(result.briefs.map(item => item.id), ['e']);
  assert.deepEqual(schedule(tasks, {completed:['a','b','c','d','e']}).waves, []);
});

test('irrelevant completed and blocked capsules do not consume the next-wave brief budget', () => {
  const long = 'A'.repeat(4000);
  const result = schedule([task('a',{context:long}),task('b'),task('c',{context:long,after:['b']}),task('d')], {completed:['a'],failed:['b']});
  assert.deepEqual(result.briefs.map(item => item.id), ['d']);
  assert.deepEqual(result.waves, [['d']]);
});

test('human-readable plans expose held work instead of silently calling it runnable', () => {
  const result = schedule([task('a'), task('b',{after:['a']})], {failed:['a']});
  assert.match(markdown(result), /No runnable tasks remain/);
  assert.match(markdown(result), /Failed: a/);
  assert.match(markdown(result), /Blocked b: requires a/);
});

test('rejects contradictory completion state and validates cycles even for failed tasks', () => {
  assert.throws(() => schedule([task('a')], {completed:['missing']}), /Unknown state/);
  assert.throws(() => schedule([task('a')], {completed:['a'],failed:['a']}), /both/);
  assert.throws(() => schedule([task('a'),task('b',{after:['a']})], {completed:['b']}), /incomplete prerequisite/);
  assert.throws(() => schedule([task('a',{after:['b']}),task('b',{after:['a']})], {failed:['a']}), /cycle/);
});

test('oversized capsules fail without silently truncating their contents', () => {
  const t = task('a', { context: 'Important detail. '.repeat(200) });
  assert.throws(() => schedule([t]), /brief is/);
  assert.ok(schedule([t], { max_brief_chars: 6000 }).briefs[0].text.includes(t.context.trim()));
});

test('Unicode characters are counted as code points', () => {
  const result = schedule([task('a', { context: '🤝' })]);
  const brief = result.briefs[0];
  assert.equal(brief.characters, [...brief.text].length);
  assert.equal(brief.text.length, brief.characters + 1);
});

test('does not mutate its input and produces deterministic output', () => {
  const input = { tasks: [task('a', { writes: ['src/a'] }), task('b', { reads: ['src/a'] })] };
  const before = JSON.stringify(input);
  assert.deepEqual(plan(input), plan(input));
  assert.equal(JSON.stringify(input), before);
});

test('all scheduled tasks respect dependencies, claims and capacity across varied DAGs', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const tasks = Array.from({ length: 12 }, (_, n) => task(`t${n}`, {
      writes: [`src/area${(n * seed) % 5}`],
      reads: [`docs/area${(n + seed) % 4}`],
      after: n > 0 && (n + seed) % 3 === 0 ? [`t${n - 1}`] : []
    }));
    const result = schedule(tasks, { max_workers: 3 });
    const waveOf = new Map(result.waves.flatMap((wave, n) => wave.map(id => [id, n])));
    assert.equal(waveOf.size, tasks.length);
    assert.equal(result.waves.flat().length, tasks.length);
    for (const wave of result.waves) assert.ok(wave.length <= 3);
    for (const t of tasks) for (const dep of t.after) assert.ok(waveOf.get(dep) < waveOf.get(t.id));
    for (const conflict of result.conflicts) assert.notEqual(waveOf.get(conflict.tasks[0]), waveOf.get(conflict.tasks[1]));
  }
});

test('the documented example and CLI produce the same valid plan', async () => {
  const example = new URL('../examples/feature.plan.json', import.meta.url);
  const expected = plan(JSON.parse(await readFile(example, 'utf8')));
  assert.deepEqual(expected.waves, [['api', 'ui'], ['docs'], ['review']]);
  const script = fileURLToPath(new URL('../skills/relaycrew/scripts/plan.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, fileURLToPath(example)], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), expected);
  const invalid = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  const human = spawnSync(process.execPath, [script, fileURLToPath(example), '--format', 'markdown'], {encoding:'utf8'});
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /Wave 1: api \+ ui/);
  const capsule = spawnSync(process.execPath, [script, fileURLToPath(example), '--brief', 'ui'], {encoding:'utf8'});
  assert.equal(capsule.status, 0, capsule.stderr);
  assert.equal(capsule.stdout.trim(), expected.briefs.find(item => item.id === 'ui').text);
  const premature = spawnSync(process.execPath, [script, fileURLToPath(example), '--brief', 'review'], {encoding:'utf8'});
  assert.equal(premature.status, 1);
  assert.equal(premature.stdout, '');
  assert.match(premature.stderr, /next runnable wave/);
  for (const args of [['--format','xml'],['--format','json','--brief','ui'],['--unknown','x'],['--brief','missing']]) {
    const bad = spawnSync(process.execPath,[script,fileURLToPath(example),...args],{encoding:'utf8'});
    assert.equal(bad.status,1); assert.equal(bad.stdout,'');
  }
  const help = spawnSync(process.execPath,[script,'--help'],{encoding:'utf8'});
  assert.equal(help.status,0); assert.match(help.stdout,/Usage/);
});

test('next bundles contain only the current compatible handoffs for all demonstrations', async () => {
  const examples = [
    ['feature', ['api', 'ui']],
    ['failure-resume', ['ui']],
    ['shared-lockfile', ['api-deps', 'docs']]
  ];
  for (const [name, taskIds] of examples) {
    const file = fileURLToPath(new URL(`../examples/${name}.plan.json`, import.meta.url));
    const input = JSON.parse(await readFile(file, 'utf8'));
    const before = JSON.stringify(input);
    const result = next(input);
    const full = plan(input);
    assert.deepEqual(Object.keys(result), ['status', 'max_workers', 'max_brief_chars', 'task_ids', 'completed', 'failed', 'blocked', 'briefs']);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.task_ids, taskIds);
    assert.deepEqual(result.briefs, taskIds.map(id => full.briefs.find(brief => brief.id === id)));
    assert.deepEqual(result.completed, full.completed);
    assert.deepEqual(result.failed, full.failed);
    assert.deepEqual(result.blocked, full.blocked);
    assert.equal(result.max_workers, full.max_workers);
    assert.equal(result.max_brief_chars, full.max_brief_chars);
    assert.deepEqual(next(input), result);
    assert.equal(JSON.stringify(input), before);
    const run = cli(file, '--next');
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), result);
  }
});

test('next preserves first-wave order and advances only from recorded completion state', () => {
  const input = { tasks: [task('later', { after: ['first'] }), task('second'), task('first')], max_workers: 1 };
  assert.deepEqual(next(input).task_ids, ['second']);
  assert.deepEqual(next({ ...input, completed: ['second'] }).task_ids, ['first']);
  assert.deepEqual(next({ ...input, completed: ['second', 'first'] }).task_ids, ['later']);
  assert.deepEqual(next({ ...input, max_workers: 2 }).task_ids, ['second', 'first']);
});

test('next distinguishes held work from a fully completed recorded plan', async () => {
  const tasks = [task('a'), task('b', { after: ['a'] })];
  const cases = [
    [{ tasks, failed: ['a'] }, 'held', ['a'], [{ id: 'b', after: ['a'] }]],
    [{ tasks: [task('a')], failed: ['a'] }, 'held', ['a'], []],
    [{ tasks, completed: ['a', 'b'] }, 'complete', [], []]
  ];
  for (const [input, status, failed, blocked] of cases) {
    const result = next(input);
    assert.equal(result.status, status);
    assert.deepEqual(result.task_ids, []);
    assert.deepEqual(result.briefs, []);
    assert.deepEqual(result.failed, failed);
    assert.deepEqual(result.blocked, blocked);
    await withPlanFile(input, file => {
      const run = cli(file, '--next');
      assert.equal(run.status, 0, run.stderr);
      assert.deepEqual(JSON.parse(run.stdout), result);
      const human = cli(file, '--next', '--format', 'markdown');
      assert.equal(human.status, 0, human.stderr);
      assert.match(human.stdout, new RegExp(`Status: ${status}\\.`));
      assert.match(human.stdout, /State comes from the input/);
      assert.match(human.stdout, /does not verify completion or run checks/);
      assert.doesNotMatch(human.stdout, /## Handoff:/);
      if (status === 'held') assert.match(human.stdout, /work remains held/);
      else assert.match(human.stdout, /No pending tasks remain according to the recorded state/);
    });
  }
});

test('next and brief ignore oversized future capsules while full plans retain their cap', async () => {
  const input = { tasks: [task('a'), task('future', { after: ['a'], context: 'x'.repeat(3000) })] };
  assert.throws(() => plan(input), /future: brief is/);
  assert.deepEqual(next(input).task_ids, ['a']);
  assert.deepEqual(next(input).briefs.map(brief => brief.id), ['a']);
  assert.throws(() => next({ ...input, completed: ['a'] }), /future: brief is/);
  await withPlanFile(input, file => {
    const full = cli(file);
    assert.equal(full.status, 1);
    assert.equal(full.stdout, '');
    assert.match(full.stderr, /future: brief is/);
    const handoffs = cli(file, '--next');
    assert.equal(handoffs.status, 0, handoffs.stderr);
    assert.deepEqual(JSON.parse(handoffs.stdout), next(input));
    const brief = cli(file, '--brief', 'a');
    assert.equal(brief.status, 0, brief.stderr);
    assert.equal(brief.stdout, `${next(input).briefs[0].text}\n`);
    const later = cli(file, '--brief', 'future');
    assert.equal(later.status, 1);
    assert.equal(later.stdout, '');
    assert.match(later.stderr, /next runnable wave/);
    assert.doesNotMatch(later.stderr, /brief is/);
  });
});

test('next caps its entire current wave while brief caps only the requested capsule', async () => {
  const input = { tasks: [task('short'), task('large', { context: 'x'.repeat(3000) })] };
  assert.throws(() => next(input), /large: brief is/);
  await withPlanFile(input, file => {
    const handoffs = cli(file, '--next');
    assert.equal(handoffs.status, 1);
    assert.equal(handoffs.stdout, '');
    assert.match(handoffs.stderr, /large: brief is/);
    const brief = cli(file, '--brief', 'short');
    assert.equal(brief.status, 0, brief.stderr);
    assert.equal(brief.stdout, `${plan({ tasks: [task('short')] }).briefs[0].text}\n`);
    const oversized = cli(file, '--brief', 'large');
    assert.equal(oversized.status, 1);
    assert.equal(oversized.stdout, '');
    assert.match(oversized.stderr, /large: brief is/);
  });
});

test('current handoffs still reject invalid future tasks and invalid global state', async () => {
  const cases = [
    [{ tasks: [task('a'), task('future', { after: ['a'], checks: [] })] }, /checks/],
    [{ tasks: [task('a'), task('future', { after: ['a'], writes: ['../secret'] })] }, /traversal/],
    [{ tasks: [task('a'), task('future', { after: ['missing'] })] }, /unknown dependency/],
    [{ tasks: [task('a'), task('future', { after: ['future'] })] }, /self-dependency/],
    [{ tasks: [task('a'), task('b', { after: ['c'] }), task('c', { after: ['b'] })] }, /cycle/],
    [{ tasks: [task('a'), task('b')], completed: ['b'], failed: ['b'] }, /both/],
    [{ tasks: [task('a')], completed: ['missing'] }, /Unknown state/],
    [{ tasks: [task('a'), task('b', { after: ['a'] })], completed: ['b'] }, /incomplete prerequisite/],
    [{ tasks: [task('a'), task('a')] }, /Duplicate/],
    [{ tasks: [task('a')], max_workers: 0 }, /max_workers/],
    [{ tasks: [task('a')], max_brief_chars: 0 }, /max_brief_chars/],
    [{ tasks: [task('a')], unexpected: true }, /Unknown/]
  ];
  for (const [input, error] of cases) assert.throws(() => next(input), error);
  await withPlanFile(cases[0][0], file => {
    for (const args of [['--next'], ['--brief', 'a']]) {
      const run = cli(file, ...args);
      assert.equal(run.status, 1);
      assert.equal(run.stdout, '');
      assert.match(run.stderr, /checks/);
    }
  });
});

test('brief errors distinguish recorded completed, failed, blocked, later and unknown tasks', async () => {
  const input = {
    tasks: [task('done'), task('failed'), task('blocked', { after: ['failed'] }), task('current'), task('later', { after: ['current'] })],
    completed: ['done'], failed: ['failed']
  };
  await withPlanFile(input, file => {
    const cases = [['done', /recorded as completed/], ['failed', /recorded as failed/], ['blocked', /blocked by failed or blocked prerequisites: failed/], ['later', /next runnable wave/], ['missing', /Unknown brief task: missing/]];
    for (const [id, message] of cases) {
      const run = cli(file, '--brief', id);
      assert.equal(run.status, 1);
      assert.equal(run.stdout, '');
      assert.match(run.stderr, message);
      if (id !== 'missing') assert.doesNotMatch(run.stderr, /Unknown brief task/);
    }
    const current = cli(file, '--brief', 'current');
    assert.equal(current.status, 0, current.stderr);
    assert.equal(current.stdout, `${next(input).briefs[0].text}\n`);
  });
});

test('next CLI accepts either format-flag order and prints current capsules with recorded state', async () => {
  const file = fileURLToPath(new URL('../examples/failure-resume.plan.json', import.meta.url));
  const input = JSON.parse(await readFile(file, 'utf8'));
  for (const args of [['--next', '--format', 'json'], ['--format', 'json', '--next']]) {
    const run = cli(file, ...args);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), next(input));
  }
  const outputs = [['--next', '--format', 'markdown'], ['--format', 'markdown', '--next']].map(args => cli(file, ...args));
  for (const run of outputs) {
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Status: ready\./);
    assert.match(run.stdout, /Current wave: ui/);
    assert.match(run.stdout, /Recorded completed: contract/);
    assert.match(run.stdout, /Recorded failed: api/);
    assert.match(run.stdout, /Blocked docs: requires api/);
    assert.match(run.stdout, /Blocked review: requires api, docs/);
    assert.match(run.stdout, /## Handoff: ui/);
    assert.ok(run.stdout.includes(next(input).briefs[0].text));
    assert.doesNotMatch(run.stdout, /## Handoff: (api|docs|review)/);
    assert.doesNotMatch(run.stdout, /Verified completed/);
    assert.match(run.stdout, /does not verify completion or run checks/);
  }
  assert.equal(outputs[0].stdout, outputs[1].stdout);
});

test('CLI rejects duplicate, mixed, incomplete and unknown flags without stdout', () => {
  const file = fileURLToPath(new URL('../examples/feature.plan.json', import.meta.url));
  const cases = [
    ['--next', '--next'], ['--next', 'true'], ['--next', '--brief', 'api'], ['--brief', 'api', '--next'],
    ['--next', '--format', 'json', '--brief', 'api'], ['--brief', 'api', '--format', 'json'],
    ['--format', 'json', '--format', 'markdown'], ['--brief', 'api', '--brief', 'ui'],
    ['--next', '--format'], ['--format', '--next'], ['--brief'], ['--brief', '--next'],
    ['--next', '--format', 'xml'], ['--next', '--unknown'], ['--help', '--next']
  ];
  for (const args of cases) {
    const run = cli(file, ...args);
    assert.equal(run.status, 1, args.join(' '));
    assert.equal(run.stdout, '', args.join(' '));
    assert.match(run.stderr, /RelayCrew:/);
  }
});

test('CLI accepts one UTF-8 BOM and continues to reject malformed JSON', async () => {
  const input = { tasks: [task('a')] };
  await withPlanFile(`\uFEFF${JSON.stringify(input)}`, async file => {
    const before = await readFile(file);
    for (const args of [[], ['--next'], ['--brief', 'a']]) {
      const run = cli(file, ...args);
      assert.equal(run.status, 0, run.stderr);
      if (args[0] === '--brief') assert.equal(run.stdout, `${next(input).briefs[0].text}\n`);
      else assert.deepEqual(JSON.parse(run.stdout), args.length ? next(input) : plan(input));
    }
    assert.deepEqual(await readFile(file), before);
  });
  for (const contents of ['{"tasks":', `\uFEFF{"tasks":`, `\uFEFF\uFEFF${JSON.stringify(input)}`]) {
    await withPlanFile(contents, file => {
      for (const args of [[], ['--next'], ['--brief', 'a']]) {
        const run = cli(file, ...args);
        assert.equal(run.status, 1);
        assert.equal(run.stdout, '');
        assert.match(run.stderr, /RelayCrew:/);
      }
    });
  }
});

test('active work keeps its slot while an independently ready task fills a free one', () => {
  const tasks = [task('parse'), task('summarize'), task('docs', { after: ['parse'] }), task('review', { after: ['summarize'] })];
  const input = { tasks, completed: ['parse'], in_progress: ['summarize'] };
  const result = next(input);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.task_ids, ['docs']);
  assert.deepEqual(result.in_progress, ['summarize']);
  assert.deepEqual(result.briefs.map(brief => brief.id), ['docs']);
  assert.deepEqual(plan(input).waves, [['docs'], ['review']]);
  assert.deepEqual(next({ ...input, max_workers: 1 }).task_ids, []);
  assert.equal(next({ ...input, max_workers: 1 }).status, 'waiting');
});

test('active file and resource claims hold incompatible new work', () => {
  const tasks = [
    task('active', { writes: ['src/API'], reads: ['config'], resources: ['Test-DB'] }),
    task('reader', { reads: ['src/api/index.ts'] }),
    task('writer', { writes: ['src/api/other.ts'] }),
    task('config', { writes: ['config/test.json'] }),
    task('database', { resources: ['test-db'] }),
    task('docs', { writes: ['docs'] })
  ];
  const input = { tasks, in_progress: ['active'], max_workers: 3 };
  assert.deepEqual(next(input).task_ids, ['docs']);
  const projection = plan(input);
  assert.deepEqual(projection.waves[0], ['docs']);
  assert.equal(projection.waves.flat().includes('active'), false);
  assert.deepEqual(new Set(projection.waves.flat()), new Set(['reader', 'writer', 'config', 'database', 'docs']));
});

test('active readers can share reads but prevent a new overlapping writer', () => {
  const input = { tasks: [task('active', { reads: ['src'] }), task('reader', { reads: ['src/a'] }), task('writer', { writes: ['src/b'] })], in_progress: ['active'] };
  assert.deepEqual(next(input).task_ids, ['reader']);
  assert.deepEqual(next({ ...input, completed: ['reader'] }).task_ids, []);
  assert.equal(next({ ...input, completed: ['reader'] }).status, 'waiting');
});

test('a full projection exposes the initial wait barrier and projects active completion only later', () => {
  const input = { tasks: [task('active'), task('dependent', { after: ['active'] })], in_progress: ['active'] };
  assert.equal(next(input).status, 'waiting');
  assert.deepEqual(next(input).task_ids, []);
  const result = plan(input);
  assert.deepEqual(result.waves, [[], ['dependent']]);
  assert.deepEqual(result.briefs.map(brief => brief.id), ['dependent']);
  assert.match(markdown(result), /Wave 1: wait for active work/);
  assert.match(markdown(result), /Recorded in progress: active/);
  assert.deepEqual(plan({ tasks: [task('active')], in_progress: ['active'] }).waves, [[]]);
});

test('waiting takes precedence over held failures until active work stops', () => {
  const input = { tasks: [task('active'), task('failed'), task('blocked', { after: ['failed'] })], failed: ['failed'], in_progress: ['active'] };
  assert.equal(next(input).status, 'waiting');
  assert.equal(next({ ...input, completed: ['active'], in_progress: [] }).status, 'held');
  assert.equal(next({ tasks: [task('active')], completed: ['active'], in_progress: [] }).status, 'complete');
});

test('rejects impossible active task state before planning or rendering briefs', () => {
  const tasks = [task('a', { writes: ['src'] }), task('b', { reads: ['src/a'] }), task('dependent', { after: ['a'] })];
  const cases = [
    [{ in_progress: ['missing'] }, /Unknown state/],
    [{ in_progress: null }, /in_progress/],
    [{ in_progress: 'a' }, /in_progress/],
    [{ in_progress: ['a'], completed: ['a'] }, /in_progress cannot also/],
    [{ in_progress: ['a'], failed: ['a'] }, /in_progress cannot also/],
    [{ in_progress: ['dependent'] }, /incomplete prerequisite/],
    [{ in_progress: ['a', 'b'], max_workers: 1 }, /exceeds max_workers/],
    [{ in_progress: ['a', 'b'] }, /Conflicting in_progress tasks/]
  ];
  for (const [state, message] of cases) for (const api of [plan, next, validate]) {
    assert.throws(() => api({ tasks, ...state }), message);
  }
  assert.throws(() => next({ tasks: [task('a', { resources: ['db'] }), task('b', { resources: ['DB'] })], in_progress: ['a', 'b'] }), /Conflicting in_progress tasks/);
});

test('validation returns normalized state without rendering oversized pending or active capsules', () => {
  const input = { tasks: [task('a', { context: 'x'.repeat(3000), writes: ['./src\\file/'] })] };
  const before = JSON.stringify(input);
  const result = validate(input);
  assert.deepEqual(Object.keys(result), ['tasks', 'max_workers', 'max_brief_chars', 'completed', 'failed', 'in_progress']);
  assert.equal(result.max_workers, 2);
  assert.equal(result.max_brief_chars, 2400);
  assert.deepEqual(result.tasks[0].writes, ['src/file']);
  assert.deepEqual(result.in_progress, []);
  assert.throws(() => next(input), /brief is/);
  const active = { ...input, in_progress: ['a'] };
  assert.equal(next(active).status, 'waiting');
  assert.deepEqual(plan(active).briefs, []);
  assert.equal(JSON.stringify(input), before);
});

test('empty active state is explicit while absent state keeps the legacy output shape', () => {
  const input = { tasks: [task('a')] };
  for (const api of [plan, next]) {
    const legacy = api(input);
    assert.equal(Object.hasOwn(legacy, 'in_progress'), false);
    assert.deepEqual(api({ ...input, in_progress: [] }), { ...legacy, in_progress: [] });
  }
});

test('active CLI reports waiting and refuses to emit an active handoff', async () => {
  await withPlanFile({ tasks: [task('a')], in_progress: ['a'] }, file => {
    const run = cli(file, '--next', '--format', 'markdown');
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Status: waiting/);
    assert.match(run.stdout, /Recorded in progress: a/);
    assert.match(run.stdout, /Active work still reserves capacity or claims/);
    assert.doesNotMatch(run.stdout, /No pending tasks remain/);
    const brief = cli(file, '--brief', 'a');
    assert.equal(brief.status, 1);
    assert.equal(brief.stdout, '');
    assert.match(brief.stderr, /recorded as in_progress/);
  });
});
