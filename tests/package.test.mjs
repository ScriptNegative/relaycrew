import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, cp, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const skill = path.join(root, 'skills', 'relaycrew');

test('the skill is self-contained with readable relative references and a compact entry point', async () => {
  const source = await readFile(path.join(skill,'SKILL.md'),'utf8');
  assert.ok(source.startsWith('---\n'));
  assert.match(source,/^name: relaycrew$/m);
  assert.ok(Buffer.byteLength(source) < 12000);
  const inspect = async directory => {
    for (const file of await readdir(directory,{withFileTypes:true})) {
      const absolute = path.join(directory,file.name);
      if (file.isDirectory()) await inspect(absolute);
      else if (file.name.endsWith('.md')) {
        const content = await readFile(absolute,'utf8');
        for (const link of content.matchAll(/\]\(([^)]+)\)/g)) {
          if (/^[a-z]+:|^#/i.test(link[1])) continue;
          const target = path.resolve(directory,link[1].split('#')[0]);
          assert.ok(target.startsWith(`${path.resolve(skill)}${path.sep}`), `Reference escapes skill: ${link[1]}`);
          await readFile(target);
        }
      }
    }
  };
  await inspect(skill);
});

test('a copied skill runs from a different directory with no package installation', async () => {
  const tempRoot = path.resolve(tmpdir());
  const scratch = await mkdtemp(path.join(tempRoot,'relaycrew-package-'));
  try {
    await cp(skill,path.join(scratch,'relaycrew'),{recursive:true});
    const script=path.join(scratch,'relaycrew','scripts','plan.mjs');
    const result=spawnSync(process.execPath,[script,path.join(root,'examples','feature.plan.json'),'--format','markdown'],{cwd:scratch,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Wave 1: api \+ ui/);
    const handoffs=spawnSync(process.execPath,[script,path.join(root,'examples','feature.plan.json'),'--next'],{cwd:scratch,encoding:'utf8'});
    assert.equal(handoffs.status,0,handoffs.stderr);
    const bundle=JSON.parse(handoffs.stdout);
    assert.equal(bundle.status,'ready');
    assert.deepEqual(bundle.task_ids,['api','ui']);
    assert.deepEqual(bundle.briefs.map(brief=>brief.id),['api','ui']);
    const readable=spawnSync(process.execPath,[script,path.join(root,'examples','feature.plan.json'),'--format','markdown','--next'],{cwd:scratch,encoding:'utf8'});
    assert.equal(readable.status,0,readable.stderr);
    assert.match(readable.stdout,/Status: ready\./);
    assert.match(readable.stdout,/Current wave: api \+ ui/);
    assert.ok(bundle.briefs.every(brief=>readable.stdout.includes(brief.text)));
    assert.doesNotMatch(readable.stdout,/## Handoff: (docs|review)/);
    const sessionScript=path.join(scratch,'relaycrew','scripts','session.mjs');
    const checkpoint=path.join(scratch,'checkpoint.json');
    const initialized=spawnSync(process.execPath,[sessionScript,'init',path.join(root,'examples','feature.plan.json'),checkpoint],{cwd:scratch,encoding:'utf8'});
    assert.equal(initialized.status,0,initialized.stderr);
    const sessionHandoffs=spawnSync(process.execPath,[sessionScript,'next',path.join(root,'examples','feature.plan.json'),checkpoint],{cwd:scratch,encoding:'utf8'});
    assert.equal(sessionHandoffs.status,0,sessionHandoffs.stderr);
    assert.deepEqual(JSON.parse(sessionHandoffs.stdout).task_ids,['api','ui']);
    const revisedPlan=JSON.parse(await readFile(path.join(root,'examples','feature.plan.json'),'utf8'));
    revisedPlan.tasks[0].goal+=' with a revised requirement';
    const revisedPath=path.join(scratch,'revised-plan.json');
    await writeFile(revisedPath,JSON.stringify(revisedPlan));
    const compared=spawnSync(process.execPath,[sessionScript,'compare',path.join(root,'examples','feature.plan.json'),revisedPath,checkpoint],{cwd:scratch,encoding:'utf8'});
    assert.equal(compared.status,0,compared.stderr);
    const preview=JSON.parse(compared.stdout);
    const requestPath=path.join(scratch,'migration.json');
    await writeFile(requestPath,JSON.stringify({new_plan_hash:preview.new_plan_hash,workers_stopped:true,review:'Synthetic copied-package migration fixture.'}));
    const migrated=spawnSync(process.execPath,[sessionScript,'migrate',path.join(root,'examples','feature.plan.json'),revisedPath,checkpoint,requestPath,'--revision','0'],{cwd:scratch,encoding:'utf8'});
    assert.equal(migrated.status,0,migrated.stderr);
    assert.equal(JSON.parse(migrated.stdout).checkpoint.revision,1);
    assert.equal(JSON.parse(await readFile(checkpoint,'utf8')).plan_hash,preview.new_plan_hash);
  } finally {
    const resolved=path.resolve(scratch);
    assert.ok(resolved.startsWith(`${tempRoot}${path.sep}`) && path.basename(resolved).startsWith('relaycrew-package-'));
    await rm(resolved,{recursive:true,force:true});
  }
});

test('failure and lockfile demonstrations produce their documented next waves', async () => {
  const {plan}=await import('../skills/relaycrew/scripts/plan.mjs');
  const failure=plan(JSON.parse(await readFile(path.join(root,'examples','failure-resume.plan.json'),'utf8')));
  assert.deepEqual(failure.waves,[['ui']]);
  assert.deepEqual(failure.blocked.map(task=>task.id),['docs','review']);
  const locks=plan(JSON.parse(await readFile(path.join(root,'examples','shared-lockfile.plan.json'),'utf8')));
  assert.deepEqual(locks.waves,[['api-deps','docs'],['ui-deps']]);
  assert.ok(locks.conflicts.some(conflict=>conflict.reasons.some(reason=>reason.includes('package-lock.json'))));
  const {next}=await import('../skills/relaycrew/scripts/plan.mjs');
  const active=next(JSON.parse(await readFile(path.join(root,'examples','active-work.plan.json'),'utf8')));
  assert.deepEqual(active.task_ids,['docs']);
  assert.deepEqual(active.in_progress,['ui']);
});
