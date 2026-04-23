import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRunner } from '../ui/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE = join(__dirname, 'fixtures', 'fake-claimer.js');

function spawnFake(script, exitCode = 0) {
  return {
    cmd: process.execPath,
    args: [FAKE],
    env: { SCRIPT: script, EXIT_CODE: String(exitCode) },
  };
}

describe('runner', () => {
  it('emits run:start, run:line per stdout line, run:end with classification', async () => {
    const runner = createRunner();
    const events = [];
    runner.on('run:start', e => events.push({ t: 'start', ...e }));
    runner.on('run:line', e => events.push({ t: 'line', ...e }));
    runner.on('run:end', e => events.push({ t: 'end', ...e }));

    await runner.runOne('epic', spawnFake('Signed in as alice;Claimed successfully!', 0));

    expect(events[0]).toMatchObject({ t: 'start', store: 'epic' });
    expect(events.filter(e => e.t === 'line')).toHaveLength(2);
    const end = events.find(e => e.t === 'end');
    expect(end).toMatchObject({ store: 'epic', classification: { class: 'ok_claimed', claimedCount: 1 } });
  });

  it('classifies non-zero exit with no login_ok as login_expired', async () => {
    const runner = createRunner();
    let endEvent;
    runner.on('run:end', e => (endEvent = e));

    await runner.runOne('gog', spawnFake('', 1));

    expect(endEvent.classification.class).toBe('login_expired');
  });

  it('queue serializes runs (only one at a time)', async () => {
    const runner = createRunner();
    const ends = [];
    runner.on('run:end', e => ends.push(e.store));

    const p1 = runner.runOne('epic', spawnFake('Signed in as a;Claimed successfully!', 0));
    const p2 = runner.runOne('prime', spawnFake('Signed in as b;Redeemed successfully.', 0));

    await Promise.all([p1, p2]);

    expect(ends).toEqual(['epic', 'prime']);
    expect(runner.isBusy()).toBe(false);
  });

  it('runAll runs three stores in epic→prime→gog order', async () => {
    const runner = createRunner();
    const ends = [];
    runner.on('run:end', e => ends.push(e.store));

    await runner.runAll({
      epic: spawnFake('Signed in as a;Claimed successfully!', 0),
      prime: spawnFake('Signed in as b;Redeemed successfully.', 0),
      gog: spawnFake('Signed in as c;Already in library! Nothing to claim.', 0),
    });

    expect(ends).toEqual(['epic', 'prime', 'gog']);
  });
});
