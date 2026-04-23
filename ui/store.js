import Store from 'electron-store';

const DEFAULTS = {
  firstRunCompleted: false,
  scheduleTime: '03:00',
  autostartOnLogin: true,
  paused: false,
  lastRunAt: null,
  lastRunPerStore: {},
  enabledStores: { epic: true, prime: true, gog: true },
};

const STALE_MS = 18 * 3600 * 1000;

export function createStore({ cwd } = {}) {
  const store = new Store({
    name: 'nextclaim',
    cwd,
    defaults: DEFAULTS,
  });
  return {
    get: key => store.get(key),
    set: (key, value) => store.set(key, value),
    recordRun(storeName, classification) {
      const now = Date.now();
      const lastRunPerStore = { ...store.get('lastRunPerStore') };
      lastRunPerStore[storeName] = { ...classification, at: now };
      store.set('lastRunPerStore', lastRunPerStore);
      store.set('lastRunAt', now);
    },
    isStale() {
      const last = store.get('lastRunAt');
      if (last == null) return true;
      return Date.now() - last > STALE_MS;
    },
  };
}
