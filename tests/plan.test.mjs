import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { plan, markdown } from '../skills/relaycrew/scripts/plan.mjs';

const task = (id, extra = {}) => ({ id, goal: `Complete ${id}`, checks: ['Verify the outcome'], ...extra });
const schedule = (tasks, extra = {}) => plan({ tasks, ...extra });

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
