import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../ui/store.js';

let tmp;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ac-store-'));
});

describe('createStore', () => {
  it('returns defaults on first run', () => {
    const s = createStore({ cwd: tmp });
    expect(s.get('firstRunCompleted')).toBe(false);
    expect(s.get('scheduleTime')).toBe('03:00');
    expect(s.get('autostartOnLogin')).toBe(true);
    expect(s.get('paused')).toBe(false);
    expect(s.get('lastRunAt')).toBeNull();
    expect(s.get('enabledStores')).toEqual({ epic: true, prime: true, gog: true });
  });

  it('persists writes across instances', () => {
    const s1 = createStore({ cwd: tmp });
    s1.set('scheduleTime', '04:30');
    s1.set('firstRunCompleted', true);
    const s2 = createStore({ cwd: tmp });
    expect(s2.get('scheduleTime')).toBe('04:30');
    expect(s2.get('firstRunCompleted')).toBe(true);
  });

  it('recordRun appends to lastRunPerStore and updates lastRunAt', () => {
    const s = createStore({ cwd: tmp });
    const before = Date.now();
    s.recordRun('epic', { class: 'ok_claimed', claimedCount: 1, codes: [], user: 'alice' });
    const last = s.get('lastRunPerStore');
    expect(last.epic.class).toBe('ok_claimed');
    expect(last.epic.at).toBeGreaterThanOrEqual(before);
    expect(s.get('lastRunAt')).toBeGreaterThanOrEqual(before);
  });

  it('isStale returns true when lastRunAt > 18h ago', () => {
    const s = createStore({ cwd: tmp });
    expect(s.isStale()).toBe(true);
    s.set('lastRunAt', Date.now() - 19 * 3600 * 1000);
    expect(s.isStale()).toBe(true);
    s.set('lastRunAt', Date.now() - 1000);
    expect(s.isStale()).toBe(false);
  });
});
