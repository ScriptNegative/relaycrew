import {createSession, transition, previewMigration, migrateSession, sessionNext} from '../skills/relaycrew/scripts/session-core.mjs';

// Synthetic bookkeeping only: no native workers, project edits, or checks run here.
const oldPlan = {
  max_workers: 2,
  tasks: [
    {id:'api',goal:'Implement the catalog response shape',writes:['src/api/catalog.mjs'],checks:['API contract checks pass']},
    {id:'ui',goal:'Fix keyboard focus in the unrelated settings dialog',writes:['src/ui/settings.mjs'],checks:['Settings keyboard checks pass']},
    {id:'docs',goal:'Document the catalog response',reads:['src/api/catalog.mjs'],writes:['docs/catalog.md'],after:['api'],checks:['Examples match the catalog response']},
    {id:'spike',goal:'Explore an optional future export',writes:['docs/export-spike.md'],checks:['Record the exploration findings']}
  ]
};

let checkpoint = createSession(oldPlan);
for (const id of ['api','ui','docs']) {
  const task = oldPlan.tasks.find(task => task.id === id);
  checkpoint = transition(oldPlan,checkpoint,{type:'start',task_id:id,worker:`synthetic-${id}`},checkpoint.revision);
  const attempt = checkpoint.tasks.find(task => task.id === id).attempt_id;
  checkpoint = transition(oldPlan,checkpoint,{
    type:'report',task_id:id,attempt_id:attempt,
    report:{
      summary:'SIMULATION ONLY: synthetic completed result',
      changed_paths:task.writes,
      checks:task.checks.map(check => ({check,outcome:'passed',evidence:'SIMULATION ONLY: no project check was executed'}))
    }
  },checkpoint.revision);
  checkpoint = transition(oldPlan,checkpoint,{
    type:'accept',task_id:id,attempt_id:attempt,worker_stopped:true,
    review:'SIMULATION ONLY: synthetic coordinator review and stopped-worker assertion'
  },checkpoint.revision);
}

const newPlan = structuredClone(oldPlan);
newPlan.tasks = newPlan.tasks.filter(task => task.id !== 'spike');
newPlan.tasks.find(task => task.id === 'api').goal = 'Implement the catalog response shape with a total field';
newPlan.tasks.push({id:'review',goal:'Review the revised catalog and documentation',reads:['src/api/catalog.mjs','docs/catalog.md'],after:['api','docs'],checks:['Review the revised catalog contract']});

const preview = previewMigration(oldPlan,newPlan,checkpoint);
const result = migrateSession(oldPlan,newPlan,checkpoint,{
  new_plan_hash:preview.new_plan_hash,workers_stopped:true,
  review:'SIMULATION ONLY: retain the unrelated settings result; recheck catalog work after its requirement change'
},preview.revision);

process.stdout.write(`${JSON.stringify({
  notice:'Synthetic bookkeeping demo. No workers were started, files changed, or project checks executed.',
  before:{revision:checkpoint.revision,completed:checkpoint.tasks.filter(task => task.status==='completed').map(task => task.id)},
  migration:result.migration,
  after:{revision:result.checkpoint.revision,tasks:result.checkpoint.tasks.map(({id,status,attempt}) => ({id,status,attempt}))},
  next:sessionNext(newPlan,result.checkpoint)
},null,2)}\n`);
