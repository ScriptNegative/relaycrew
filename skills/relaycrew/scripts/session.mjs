import {readFile, open, lstat, link, rename, unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createSession, sessionNext, transition} from './session-core.mjs';

const fail = message => { throw new Error(message); };
const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));

async function regular(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) fail('Checkpoint must be a regular file, not a symlink');
}

async function withLock(file, action) {
  const lockPath = `${file}.lock`;
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') fail(`Checkpoint is locked: ${lockPath}. Confirm all checkpoint writers have stopped before removing a stale lock. Running task reservations remain in the checkpoint.`);
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({pid: process.pid, created_at: new Date().toISOString()}));
    await lock.sync();
    return await action();
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function save(file, value, exclusive) {
  const temporary = `${file}.tmp-${randomUUID()}`;
  const handle = await open(temporary, 'wx', 0o600);
  let exists = true;
  try {
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (exclusive) {
      // A same-directory hard link publishes a complete file without replacing an existing one.
      await link(temporary, file);
      await unlink(temporary);
    } else {
      await rename(temporary, file);
    }
    exists = false;
  } finally {
    if (exists) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function initFile(planPath, checkpointPath) {
  const file = path.resolve(checkpointPath);
  const checkpoint = createSession(await json(planPath));
  return withLock(file, async () => {
    await save(file, checkpoint, true);
    return checkpoint;
  });
}

export async function nextFile(planPath, checkpointPath) {
  const file = path.resolve(checkpointPath);
  await regular(file);
  const [plan, checkpoint] = await Promise.all([json(planPath), json(file)]);
  return sessionNext(plan, checkpoint);
}

export async function applyFile(planPath, checkpointPath, eventPath, expectedRevision) {
  const file = path.resolve(checkpointPath);
  const [plan, event] = await Promise.all([json(planPath), json(eventPath)]);
  return withLock(file, async () => {
    await regular(file);
    const current = await json(file);
    const updated = transition(plan, current, event, expectedRevision);
    await save(file, updated, false);
    return updated;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const usage = 'Usage: node session.mjs init|next <plan.json> <checkpoint.json> OR node session.mjs apply <plan.json> <checkpoint.json> <event.json> --revision N';
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
      process.stdout.write(`${usage}\n`);
    } else {
      const [command, planPath, checkpointPath] = args;
      if (!planPath || !checkpointPath) fail(usage);
      let result;
      if (command === 'init' && args.length === 3) result = await initFile(planPath, checkpointPath);
      else if (command === 'next' && args.length === 3) result = await nextFile(planPath, checkpointPath);
      else if (command === 'apply' && args.length === 6 && args[4] === '--revision' && /^(0|[1-9]\d*)$/.test(args[5])) {
        const revision = Number(args[5]);
        if (!Number.isSafeInteger(revision)) fail('revision must be a non-negative safe integer');
        result = await applyFile(planPath, checkpointPath, args[3], revision);
      } else fail(usage);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    console.error(`RelayCrew: ${error.message}`);
    process.exitCode = 1;
  }
}
