import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { parseLine } from './sentinels.js';
import { classify } from './classifier.js';

export function createRunner() {
  const emitter = new EventEmitter();
  let busy = false;
  const queue = [];

  function next() {
    if (busy || queue.length === 0) return;
    const { store, spec, resolve } = queue.shift();
    busy = true;
    emitter.emit('run:start', { store });

    const child = spawn(spec.cmd, spec.args, {
      env: { ...process.env, ...(spec.env ?? {}) },
      cwd: spec.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      child.stdin.write('\n\n\n\n\n');
      child.stdin.end();
    } catch { /* child already exited */ }

    const events = [];
    let buf = '';

    const onData = chunk => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        emitter.emit('run:line', { store, line });
        const ev = parseLine(line);
        if (ev) events.push(ev);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('close', exitCode => {
      if (buf) {
        emitter.emit('run:line', { store, line: buf });
        const ev = parseLine(buf);
        if (ev) events.push(ev);
      }
      const classification = classify(events, exitCode ?? 0);
      emitter.emit('run:end', { store, classification });
      busy = false;
      resolve(classification);
      next();
    });

    child.on('error', err => {
      emitter.emit('run:line', { store, line: `[spawn error] ${err.message}` });
      const classification = classify([], 1);
      emitter.emit('run:end', { store, classification });
      busy = false;
      resolve(classification);
      next();
    });
  }

  return Object.assign(emitter, {
    runOne(store, spec) {
      return new Promise((resolve, reject) => {
        queue.push({ store, spec, resolve, reject });
        next();
      });
    },
    async runAll(specs) {
      const order = ['epic', 'prime', 'gog'];
      const results = {};
      for (const store of order) {
        if (specs[store]) results[store] = await this.runOne(store, specs[store]);
      }
      return results;
    },
    isBusy: () => busy,
    queueLength: () => queue.length,
  });
}
