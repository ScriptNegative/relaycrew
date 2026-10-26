import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

// Public-CLI black-box evaluation. All reports, check evidence, worker labels,
// and stopped assertions are SYNTHETIC; no workers or project exist.
const skillDir = process.env.RELAYCREW_SKILL_DIR;
if (!skillDir) throw new Error('Set RELAYCREW_SKILL_DIR to the public skill directory.');
const root = process.cwd();
const transcript = [];
fs.mkdirSync('events', {recursive:true});
fs.mkdirSync('snapshots', {recursive:true});
fs.mkdirSync('outputs', {recursive:true});
function write(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha(file) { return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null; }
function sanitize(value) {
  return String(value).replaceAll(skillDir, '<skill-dir>').replaceAll(skillDir.replaceAll('\\', '/'), '<skill-dir>')
    .replaceAll(root, '.').replaceAll(root.replaceAll('\\', '/'), '.');
}
function call(label, args, checkpoint, expectedExit = 0) {
  const before = checkpoint && fs.existsSync(checkpoint) ? read(checkpoint) : null;
  const beforeHash = checkpoint ? sha(checkpoint) : null;
  const proc = spawnSync(process.execPath, [path.join(skillDir, 'scripts/session.mjs'), ...args], {encoding:'utf8', cwd:root});
  const stdout = sanitize(proc.stdout || '');
  const stderr = sanitize(proc.stderr || '');
  let result = null;
  try { result = JSON.parse(stdout); } catch {}
  const after = checkpoint && fs.existsSync(checkpoint) ? read(checkpoint) : null;
  const entry = {label, command:['node','<skill-dir>/scripts/session.mjs',...args], cwd:'.', exit_code:proc.status,
    checkpoint:checkpoint ?? null, checkpoint_sha256_before:beforeHash, checkpoint_sha256_after:checkpoint ? sha(checkpoint) : null,
    revision_before:before?.revision ?? null, revision_after:after?.revision ?? null, stdout, stderr, result};
  transcript.push(entry);
  write(`outputs/${String(transcript.length).padStart(2,'0')}-${label}.json`, entry);
  write('transcript.json', {synthetic:true, runtime:process.version, entries:transcript});
  if (proc.status !== expectedExit) throw new Error(`${label}: expected exit ${expectedExit}, got ${proc.status}: ${stderr}`);
  if (expectedExit !== 0 && entry.checkpoint_sha256_before !== entry.checkpoint_sha256_after) throw new Error(`${label}: failed command changed checkpoint`);
  return result;
}
function event(label, checkpoint, plan, value, expectedExit = 0, revision) {
  const file = `events/${label}.json`;
  write(file, value);
  return call(label, ['apply',plan,checkpoint,file,'--revision',String(revision ?? read(checkpoint).revision)], checkpoint, expectedExit);
}
function snapshot(file, name) { fs.copyFileSync(file, `snapshots/${name}.json`); }
function taskState(checkpoint) { return read(checkpoint); }
const fixtureContext = 'SYNTHETIC fixture only. No worker, project, checks, or actual implementation exists.';
const oldPlan = {max_workers:2, max_brief_chars:2400, tasks:[
  {id:'api', goal:'Implement API contract v1', context:fixtureContext, reads:['contracts/api-v1.json'], writes:['src/api','tests/api'], resources:[], after:[], checks:['SYNTHETIC API v1 contract check']},
  {id:'ui', goal:'Implement the independent user interface', context:fixtureContext, reads:['design/ui.json'], writes:['src/ui','tests/ui'], resources:[], after:[], checks:['SYNTHETIC UI acceptance check']},
  {id:'docs', goal:'Document the accepted API', context:fixtureContext, reads:['src/api'], writes:['docs/api.md'], resources:[], after:['api'], checks:['SYNTHETIC API documentation check']},
  {id:'spike', goal:'Evaluate an optional experiment', context:fixtureContext, reads:['experiments/input.json'], writes:['experiments/spike'], resources:[], after:[], checks:['SYNTHETIC spike feasibility check']}
]};
const newPlan = structuredClone(oldPlan);
newPlan.tasks[0].goal = 'Implement API contract v2 with revised response fields';
newPlan.tasks[0].reads = ['contracts/api-v2.json'];
newPlan.tasks[0].checks = ['SYNTHETIC API v2 response contract check','SYNTHETIC API v2 compatibility check'];
newPlan.tasks = newPlan.tasks.filter(t => t.id !== 'spike');
newPlan.tasks.push({id:'review',goal:'Independently review the revised API and documentation',context:fixtureContext,
  reads:['src/api','tests/api','docs/api.md'],writes:['review/findings.md'],resources:[],after:['api','docs'],checks:['SYNTHETIC API and documentation review check']});
write('old-plan.json',oldPlan);
write('new-plan.json',newPlan);
call('help',['--help']);
call('init',['init','old-plan.json','checkpoint-main.json'],'checkpoint-main.json');
call('initial-next',['next','old-plan.json','checkpoint-main.json'],'checkpoint-main.json');
const attempts = {};
function currentAttempt(checkpoint, id) {
  const data = read(checkpoint);
  const task = data.tasks.find(task => task.id === id);
  return task.attempt_id;
}
function completeSynthetic(id, plan='old-plan.json', checkpoint='checkpoint-main.json') {
  const p = read(plan).tasks.find(t => t.id === id);
  event(`start-${id}-${plan==='new-plan.json'?'v2':'v1'}`,checkpoint,plan,{type:'start',task_id:id,worker:`SYNTHETIC-${id}-worker`});
  const attempt = currentAttempt(checkpoint,id);
  const report = {type:'report',task_id:id,attempt_id:attempt,report:{summary:`SYNTHETIC reported ${id} result; no work actually ran`,
    changed_paths:[p.writes[0].includes('.') ? p.writes[0] : `${p.writes[0]}/synthetic.txt`],
    checks:p.checks.map(check => ({check,outcome:'passed',evidence:'SYNTHETIC evidence for bookkeeping evaluation. No command or acceptance check was executed.'}))}};
  event(`report-${id}-${plan==='new-plan.json'?'v2':'v1'}`,checkpoint,plan,report);
  event(`accept-${id}-${plan==='new-plan.json'?'v2':'v1'}`,checkpoint,plan,{type:'accept',task_id:id,attempt_id:attempt,worker_stopped:true,
    review:'SYNTHETIC coordinator acceptance and stopped assertion. No actual worker, diff, or acceptance check exists.'});
  return {attempt, report};
}
for (const id of ['api','ui','docs']) attempts[id] = completeSynthetic(id);
event('start-spike-v1','checkpoint-main.json','old-plan.json',{type:'start',task_id:'spike',worker:'SYNTHETIC-spike-worker'});
attempts.spike = {attempt:currentAttempt('checkpoint-main.json','spike')};
event('report-spike-failed','checkpoint-main.json','old-plan.json',{type:'report',task_id:'spike',attempt_id:attempts.spike.attempt,
  report:{summary:'SYNTHETIC failed spike result; no work ran',changed_paths:['experiments/spike/synthetic.txt'],
    checks:[{check:oldPlan.tasks.find(t=>t.id==='spike').checks[0],outcome:'failed',evidence:'SYNTHETIC intentional failure. No experiment was executed.'}]}});
event('fail-spike-v1','checkpoint-main.json','old-plan.json',{type:'fail',task_id:'spike',attempt_id:attempts.spike.attempt,worker_stopped:true,
  reason:'SYNTHETIC failed experiment and stopped assertion. No actual worker exists.'});
snapshot('checkpoint-main.json','baseline');
const preview = call('compare-main',['compare','old-plan.json','new-plan.json','checkpoint-main.json'],'checkpoint-main.json');
write('migration-request.json',{new_plan_hash:preview.new_plan_hash,workers_stopped:true,
  review:'SYNTHETIC reviewed migration. UI definition and synthetic accepted record remain independent and unchanged. API checks/contract changed; dependent docs require fresh evidence. Remove failed spike and add review. No real results or stopped workers were verified.'});
call('direct-new-plan-rejected',['next','new-plan.json','checkpoint-main.json'],'checkpoint-main.json',1);
call('stale-revision-rejected',['migrate','old-plan.json','new-plan.json','checkpoint-main.json','migration-request.json','--revision',String(preview.revision-1)],'checkpoint-main.json',1);

// A deliberately separate authority fork: it must never be merged back.
fs.copyFileSync('snapshots/baseline.json','checkpoint-active.json');
event('active-copy-retry-spike','checkpoint-active.json','old-plan.json',{type:'retry',task_id:'spike',attempt_id:attempts.spike.attempt});
event('active-copy-start-spike','checkpoint-active.json','old-plan.json',{type:'start',task_id:'spike',worker:'SYNTHETIC-still-running-spike-worker'});
call('active-copy-next-old',['next','old-plan.json','checkpoint-active.json'],'checkpoint-active.json');
call('active-copy-compare-rejected',['compare','old-plan.json','new-plan.json','checkpoint-active.json'],'checkpoint-active.json',1);
call('active-copy-migrate-rejected',['migrate','old-plan.json','new-plan.json','checkpoint-active.json','migration-request.json','--revision',String(read('checkpoint-active.json').revision)],'checkpoint-active.json',1);
snapshot('checkpoint-active.json','active-copy-held');

const migrated = call('migrate-reviewed',['migrate','old-plan.json','new-plan.json','checkpoint-main.json','migration-request.json','--revision',String(preview.revision)],'checkpoint-main.json');
snapshot('checkpoint-main.json','immediately-migrated');
call('next-after-migration',['next','new-plan.json','checkpoint-main.json'],'checkpoint-main.json');
call('old-plan-rejected-after-migration',['next','old-plan.json','checkpoint-main.json'],'checkpoint-main.json',1);
event('old-api-report-rejected-before-restart','checkpoint-main.json','new-plan.json',attempts.api.report,1);
event('start-api-v2','checkpoint-main.json','new-plan.json',{type:'start',task_id:'api',worker:'SYNTHETIC-api-v2-worker'});
const newApiAttempt = currentAttempt('checkpoint-main.json','api');
event('old-api-report-rejected-after-restart','checkpoint-main.json','new-plan.json',attempts.api.report,1);
event('report-api-v2','checkpoint-main.json','new-plan.json',{type:'report',task_id:'api',attempt_id:newApiAttempt,
  report:{summary:'SYNTHETIC revised API result; no work ran',changed_paths:['src/api/synthetic.txt'],checks:newPlan.tasks[0].checks.map(check=>({check,outcome:'passed',evidence:'SYNTHETIC bookkeeping evidence; no acceptance command was executed.'}))}});
event('accept-api-v2','checkpoint-main.json','new-plan.json',{type:'accept',task_id:'api',attempt_id:newApiAttempt,worker_stopped:true,review:'SYNTHETIC acceptance and stopped assertion only; no actual worker or checks.'});
call('next-after-api-v2',['next','new-plan.json','checkpoint-main.json'],'checkpoint-main.json');
attempts.docsV2 = completeSynthetic('docs','new-plan.json');
call('next-after-docs-v2',['next','new-plan.json','checkpoint-main.json'],'checkpoint-main.json');
snapshot('checkpoint-main.json','final');
write('results.json',{synthetic:true,scope:'Black-box public documentation and CLI only; no implementation, project README, or product tests read.',
  runtime:process.version,preview,migration:migrated,baseline:read('snapshots/baseline.json'),immediately_migrated:read('snapshots/immediately-migrated.json'),
  active_copy:read('snapshots/active-copy-held.json'),final:taskState('checkpoint-main.json'),attempt_ids:{old_api:attempts.api.attempt,new_api:newApiAttempt},
  failure_integrity:transcript.filter(t=>t.exit_code!==0).map(t=>({label:t.label,exit_code:t.exit_code,revision_before:t.revision_before,revision_after:t.revision_after,
    sha256_before:t.checkpoint_sha256_before,sha256_after:t.checkpoint_sha256_after,unchanged:t.checkpoint_sha256_before===t.checkpoint_sha256_after,error:t.stderr.trim()})),
  command_count:transcript.length,all_expected_exit_codes_observed:true});
console.log(JSON.stringify({command_count:transcript.length,baseline_revision:preview.revision,final_revision:read('checkpoint-main.json').revision,failures:transcript.filter(t=>t.exit_code!==0).length}));
