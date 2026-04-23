import cron from 'node-cron';

export function timeToCron(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) throw new Error(`Invalid time: ${hhmm}`);
  return `${min} ${h} * * *`;
}

export function createScheduler({ store, runClaim }) {
  let task = null;

  function start() {
    stop();
    if (store.get('paused')) return;
    const expr = timeToCron(store.get('scheduleTime'));
    task = cron.schedule(expr, () => runClaim('scheduled'));
  }

  function stop() {
    if (task) { task.stop(); task = null; }
  }

  function runOnLaunchIfStale() {
    if (store.get('paused')) return;
    if (!store.isStale()) return;
    setTimeout(() => runClaim('on-launch-catchup'), 30_000);
  }

  return { start, stop, runOnLaunchIfStale };
}
