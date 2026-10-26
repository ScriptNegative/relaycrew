import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, readdir, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';

const script = fileURLToPath(new URL('../skills/relaycrew/scripts/session.mjs', import.meta.url));
const definition = {
  max_workers: 2,
  tasks: [
    {id:'api',goal:'Implement API',writes:['src/api'],checks:['API tests pass']},
    {id:'ui',goal:'Implement UI',writes:['src/ui'],checks:['UI tests pass']},
    {id:'docs',goal:'Document API',reads:['src/api'],writes:['docs'],after:['api'],checks:['Examples match API']}
  ]
};

async function fixture(run) {
  const base = path.resolve(tmpdir());
  const directory = await mkdtemp(path.join(base, 'relaycrew-session-'));
  const plan = path.join(directory, 'plan.json');
  const checkpoint = path.join(directory, 'checkpoint.json');
  await writeFile(plan, `\uFEFF${JSON.stringify(definition)}`);
  const command = (...args) => spawnSync(process.execPath, [script, ...args], {cwd:directory,encoding:'utf8'});
  const event = async (value, revision, name='event.json') => {
    const file = path.join(directory,name);
    await writeFile(file,JSON.stringify(value));
    return command('apply',plan,checkpoint,file,'--revision',String(revision));
  };
  try { await run({directory,plan,checkpoint,command,event}); }
  finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(`${base}${path.sep}`) && path.basename(resolved).startsWith('relaycrew-session-'));
    await rm(resolved,{recursive:true,force:true});
  }
}

function success(result) {
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

function rejected(result) {
  assert.notEqual(result.status,0);
  assert.equal(result.stdout,'');
}

test('CLI persists reservations across processes, reviews evidence, and releases only accepted work', async () => {
  await fixture(async ({plan,checkpoint,command,event,directory}) => {
    const initial = success(command('init',plan,checkpoint));
    assert.equal(initial.revision,0);
    assert.deepEqual(success(command('next',plan,checkpoint)).task_ids,['api','ui']);
    const started = success(await event({type:'start',task_id:'api',worker:'worker-api'},0));
    const attempt = started.tasks.find(t=>t.id==='api').attempt_id;
    assert.deepEqual(success(command('next',plan,checkpoint)).task_ids,['ui']);
    const reported = success(await event({type:'report',task_id:'api',attempt_id:attempt,report:{summary:'API implemented',changed_paths:['src/api/index.mjs'],checks:[{check:'API tests pass',outcome:'passed',evidence:'node --test tests/api.test.mjs: 3 passed'}]}},1));
    assert.equal(reported.tasks[0].status,'reported');
    assert.deepEqual(success(command('next',plan,checkpoint)).task_ids,['ui']);
    success(await event({type:'accept',task_id:'api',attempt_id:attempt,worker_stopped:true,review:'Inspected the API diff and reproduced the contract tests.'},2));
    const resumed = success(command('next',plan,checkpoint));
    assert.deepEqual(resumed.task_ids,['ui','docs']);
    assert.equal(resumed.revision,3);
    assert.deepEqual(resumed.active,[]);
    assert.deepEqual((await readdir(directory)).filter(name=>name.includes('.tmp-')||name.endsWith('.lock')),[]);
  });
});

test('CLI never replaces an existing checkpoint at init and rejects stale revisions without changes', async () => {
  await fixture(async ({plan,checkpoint,command,event}) => {
    success(command('init',plan,checkpoint));
    const before = await readFile(checkpoint,'utf8');
    rejected(command('init',plan,checkpoint));
    assert.equal(await readFile(checkpoint,'utf8'),before);
    rejected(await event({type:'start',task_id:'api',worker:'api'},1));
    assert.equal(await readFile(checkpoint,'utf8'),before);
    rejected(command('apply',plan,checkpoint,plan,'--revision','1.5'));
    assert.equal(await readFile(checkpoint,'utf8'),before);
  });
});

test('stale locks block mutations but preserve read-only recovery and active reservations', async () => {
  await fixture(async ({plan,checkpoint,command,event}) => {
    success(command('init',plan,checkpoint));
    success(await event({type:'start',task_id:'api',worker:'unknown-after-interruption'},0));
    await writeFile(`${checkpoint}.lock`,'interrupted writer');
    const before = await readFile(checkpoint,'utf8');
    const refused = await event({type:'start',task_id:'ui',worker:'ui'},1);
    rejected(refused);
    assert.match(refused.stderr,/Confirm all checkpoint writers have stopped/);
    assert.equal(await readFile(`${checkpoint}.lock`,'utf8'),'interrupted writer');
    assert.equal(await readFile(checkpoint,'utf8'),before);
    const next = success(command('next',plan,checkpoint));
    assert.deepEqual(next.task_ids,['ui']);
    assert.equal(next.active[0].worker,'unknown-after-interruption');
  });
});

test('competing CLI writers at the same revision commit at most once', async () => {
  await fixture(async ({directory,plan,checkpoint,command}) => {
    success(command('init',plan,checkpoint));
    const eventPath = path.join(directory,'start.json');
    await writeFile(eventPath,JSON.stringify({type:'start',task_id:'api',worker:'competing-coordinator'}));
    const call = () => new Promise((resolve,reject) => {
      const child = spawn(process.execPath,[script,'apply',plan,checkpoint,eventPath,'--revision','0'],{cwd:directory});
      let stdout='',stderr='';
      child.stdout.on('data',data=>stdout+=data);
      child.stderr.on('data',data=>stderr+=data);
      child.on('error',reject);
      child.on('close',status=>resolve({status,stdout,stderr}));
    });
    const results = await Promise.all([call(),call()]);
    assert.equal(results.filter(result=>result.status===0).length,1);
    rejected(results.find(result=>result.status!==0));
    const final = JSON.parse(await readFile(checkpoint,'utf8'));
    assert.equal(final.revision,1);
    assert.equal(final.tasks[0].attempt,1);
    assert.deepEqual((await readdir(directory)).filter(name=>name.includes('.tmp-')||name.endsWith('.lock')),[]);
  });
});

test('plan changes and corrupt checkpoints fail closed without rewriting state', async () => {
  await fixture(async ({plan,checkpoint,command,event}) => {
    success(command('init',plan,checkpoint));
    const original = await readFile(checkpoint,'utf8');
    const changed = structuredClone(definition);
    changed.tasks[0].goal='An unrelated API';
    await writeFile(plan,JSON.stringify(changed));
    rejected(command('next',plan,checkpoint));
    rejected(await event({type:'start',task_id:'api',worker:'api'},0));
    assert.equal(await readFile(checkpoint,'utf8'),original);
    await writeFile(plan,JSON.stringify(definition));
    await writeFile(checkpoint,'{"partial":');
    rejected(await event({type:'start',task_id:'api',worker:'api'},0));
    assert.equal(await readFile(checkpoint,'utf8'),'{"partial":');
  });
});

test('checkpoint symlinks cannot be used for reads or replacement', async t => {
  await fixture(async ({directory,plan,checkpoint,command,event}) => {
    const target = path.join(directory,'actual.json');
    success(command('init',plan,target));
    const before = await readFile(target,'utf8');
    try { await symlink(target,checkpoint,'file'); }
    catch (error) {
      if (['EPERM','EACCES','ENOSYS'].includes(error.code)) { t.skip('Host does not permit file symlinks'); return; }
      throw error;
    }
    rejected(command('next',plan,checkpoint));
    rejected(await event({type:'start',task_id:'api',worker:'api'},0));
    assert.equal(await readFile(target,'utf8'),before);
  });
});

async function completeSyntheticTask(event,id,revision) {
  const started=success(await event({type:'start',task_id:id,worker:`synthetic-${id}`},revision));
  const attempt=started.tasks.find(task=>task.id===id).attempt_id;
  const check=id==='api'?'API tests pass':'UI tests pass';
  success(await event({type:'report',task_id:id,attempt_id:attempt,report:{summary:'Synthetic fixture completion',changed_paths:[`src/${id}/index.mjs`],checks:[{check,outcome:'passed',evidence:'Synthetic fixture only; no application test was executed'}]}},revision+1));
  return success(await event({type:'accept',task_id:id,attempt_id:attempt,worker_stopped:true,review:'Synthetic coordinator assertion for CLI protocol test.'},revision+2));
}

test('compare is read-only and migration atomically retains independent evidence while resetting changed work',async()=>{
  await fixture(async({directory,plan,checkpoint,command,event})=>{
    success(command('init',plan,checkpoint));
    await completeSyntheticTask(event,'api',0);
    await completeSyntheticTask(event,'ui',3);
    const before=await readFile(checkpoint,'utf8');
    const nextPlan=structuredClone(definition);
    nextPlan.tasks[0].goal='Implement the revised API contract';
    nextPlan.tasks.push({id:'audit',goal:'Audit separate metadata',writes:['audit'],checks:['Audit is complete']});
    const nextPath=path.join(directory,'next-plan.json');
    await writeFile(nextPath,`\uFEFF${JSON.stringify(nextPlan)}`);
    const preview=success(command('compare',plan,nextPath,checkpoint));
    assert.equal(await readFile(checkpoint,'utf8'),before);
    assert.deepEqual(preview.kept_completed,['ui']);
    assert.deepEqual(preview.reset.map(task=>task.id),['api','docs']);
    const requestPath=path.join(directory,'migration.json');
    await writeFile(requestPath,JSON.stringify({new_plan_hash:preview.new_plan_hash,workers_stopped:true,review:'Synthetic fixture review of retained ui and reset API evidence.'}));
    const result=success(command('migrate',plan,nextPath,checkpoint,requestPath,'--revision','6'));
    assert.equal(result.checkpoint.revision,7);
    assert.equal(result.checkpoint.format,1);
    assert.deepEqual(JSON.parse(await readFile(checkpoint,'utf8')),result.checkpoint);
    assert.equal(result.migration.new_plan_hash,preview.new_plan_hash);
    assert.deepEqual(success(command('next',nextPath,checkpoint)).task_ids,['api','audit']);
    rejected(command('next',plan,checkpoint));
    rejected(command('migrate',plan,nextPath,checkpoint,requestPath,'--revision','6'));
    assert.deepEqual((await readdir(directory)).filter(name=>name.includes('.tmp-')||name.endsWith('.lock')),[]);
  });
});

test('migration refuses stale revision, target hash, missing confirmations and active work without checkpoint changes',async()=>{
  await fixture(async({directory,plan,checkpoint,command,event})=>{
    success(command('init',plan,checkpoint));
    const nextPlan=structuredClone(definition);
    nextPlan.tasks[0].goal='API version 2';
    const nextPath=path.join(directory,'next.json');
    await writeFile(nextPath,JSON.stringify(nextPlan));
    const preview=success(command('compare',plan,nextPath,checkpoint));
    const requestPath=path.join(directory,'request.json');
    const request={new_plan_hash:preview.new_plan_hash,workers_stopped:true,review:'Synthetic fixture review.'};
    const before=await readFile(checkpoint,'utf8');
    for(const value of [{...request,new_plan_hash:'0'.repeat(64)},{...request,workers_stopped:false},{...request,review:''},{...request,extra:1}]) {
      await writeFile(requestPath,JSON.stringify(value));
      rejected(command('migrate',plan,nextPath,checkpoint,requestPath,'--revision','0'));
      assert.equal(await readFile(checkpoint,'utf8'),before);
    }
    await writeFile(requestPath,JSON.stringify(request));
    rejected(command('migrate',plan,nextPath,checkpoint,requestPath,'--revision','1'));
    assert.equal(await readFile(checkpoint,'utf8'),before);
    success(await event({type:'start',task_id:'api',worker:'synthetic-active'},0));
    const active=await readFile(checkpoint,'utf8');
    const refused=command('compare',plan,nextPath,checkpoint);
    rejected(refused);
    assert.match(refused.stderr,/active or reported/);
    rejected(command('migrate',plan,nextPath,checkpoint,requestPath,'--revision','1'));
    assert.equal(await readFile(checkpoint,'utf8'),active);
    assert.deepEqual((await readdir(directory)).filter(name=>name.includes('.tmp-')||name.endsWith('.lock')),[]);
  });
});

test('concurrent migrations at one revision publish exactly one complete checkpoint',async()=>{
  await fixture(async({directory,plan,checkpoint,command})=>{
    success(command('init',plan,checkpoint));
    const nextPath=path.join(directory,'next.json');
    const nextPlan=structuredClone(definition);nextPlan.tasks[0].goal='API version 2';
    await writeFile(nextPath,JSON.stringify(nextPlan));
    const preview=success(command('compare',plan,nextPath,checkpoint));
    const requestPath=path.join(directory,'request.json');
    await writeFile(requestPath,JSON.stringify({new_plan_hash:preview.new_plan_hash,workers_stopped:true,review:'Synthetic concurrency fixture review.'}));
    const invoke=()=>new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[script,'migrate',plan,nextPath,checkpoint,requestPath,'--revision','0'],{cwd:directory});
      let stdout='',stderr='';
      child.stdout.on('data',data=>stdout+=data);
      child.stderr.on('data',data=>stderr+=data);
      child.once('error',reject);
      child.once('close',status=>resolve({status,stdout,stderr}));
    });
    const results=await Promise.all([invoke(),invoke()]);
    assert.equal(results.filter(result=>result.status===0).length,1);
    rejected(results.find(result=>result.status!==0));
    const current=JSON.parse(await readFile(checkpoint,'utf8'));
    assert.equal(current.revision,1);
    assert.equal(current.plan_hash,preview.new_plan_hash);
    assert.equal(current.tasks[0].goal,undefined);
    assert.equal(success(command('next',nextPath,checkpoint)).revision,1);
    assert.deepEqual((await readdir(directory)).filter(name=>name.includes('.tmp-')||name.endsWith('.lock')),[]);
  });
});

test('migration and compare CLI reject malformed invocation shapes without output or state changes',async()=>{
  await fixture(async({plan,checkpoint,command})=>{
    success(command('init',plan,checkpoint));
    const before=await readFile(checkpoint,'utf8');
    for(const args of [
      ['compare',plan,checkpoint],['compare',plan,plan,checkpoint,'extra'],
      ['migrate',plan,plan,checkpoint],['migrate',plan,plan,checkpoint,plan,'--revision','1.5'],
      ['migrate',plan,plan,checkpoint,plan,'--revision','-1'],['migrate',plan,plan,checkpoint,plan,'--revision','9007199254740992']
    ]) {
      rejected(command(...args));
      assert.equal(await readFile(checkpoint,'utf8'),before);
    }
  });
});
