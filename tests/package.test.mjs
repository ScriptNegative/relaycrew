import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, cp, mkdtemp, rm} from 'node:fs/promises';
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
});
