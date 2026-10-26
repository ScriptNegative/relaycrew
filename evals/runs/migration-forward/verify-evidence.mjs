import fs from 'node:fs';
import assert from 'node:assert/strict';
const results = JSON.parse(fs.readFileSync('results.json','utf8'));
const transcript = JSON.parse(fs.readFileSync('transcript.json','utf8')).entries;
const before = Object.fromEntries(results.baseline.tasks.map(t=>[t.id,t]));
const after = Object.fromEntries(results.immediately_migrated.tasks.map(t=>[t.id,t]));
const find = label => transcript.find(entry=>entry.label===label);
assert.deepEqual(after.ui, before.ui);
assert.equal(results.baseline.session_id, results.immediately_migrated.session_id);
assert.equal(results.immediately_migrated.revision, results.baseline.revision+1);
for (const id of ['api','docs']) {
  assert.equal(after[id].status,'pending');
  assert.equal(after[id].attempt,1);
  for (const key of ['attempt_id','worker','report','failure','review']) assert.equal(after[id][key],null);
}
assert.equal(after.spike,undefined);
assert.equal(after.review.status,'pending');
assert.equal(after.review.attempt,0);
assert.equal(find('compare-main').checkpoint_sha256_before,find('compare-main').checkpoint_sha256_after);
assert(results.failure_integrity.every(f=>f.exit_code===1 && f.unchanged && f.revision_before===f.revision_after));
assert.notEqual(results.attempt_ids.old_api,results.attempt_ids.new_api);
assert.deepEqual(find('next-after-migration').result.task_ids,['api']);
assert.deepEqual(find('next-after-api-v2').result.task_ids,['docs']);
assert.deepEqual(find('next-after-docs-v2').result.task_ids,['review']);
assert.equal(find('active-copy-next-old').result.status,'waiting');
assert.deepEqual(find('active-copy-next-old').result.in_progress,['spike']);
const checkedFiles=[];
function scan(dir) {
  for (const name of fs.readdirSync(dir)) {
    const file = dir==='.' ? name : `${dir}/${name}`;
    if (fs.statSync(file).isDirectory()) scan(file);
    else {
      const contents = fs.readFileSync(file,'utf8');
      assert(!/[A-Za-z]:[\\/](?:Users|Documents|private)[\\/]/i.test(contents),`Absolute private path in ${file}`);
      checkedFiles.push(file);
    }
  }
}
scan('.');
const verification = {passed:true,assertion_scope:'Saved public CLI artifacts only; no RelayCrew implementation or product tests read or run.',
  ui_record_identical:true,session_id_retained:true,migration_revision_increment:1,reset_receipts_cleared:true,old_attempt_fenced:true,
  next_task_sequence:['api','docs','review'],failed_command_count:results.failure_integrity.length,all_failed_commands_unchanged:true,
  private_absolute_path_scan_passed:true,scanned_file_count:checkedFiles.length};
fs.writeFileSync('verification.json',JSON.stringify(verification,null,2)+'\n');
console.log(JSON.stringify(verification));
