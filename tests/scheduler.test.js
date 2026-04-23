import { describe, it, expect, vi } from 'vitest';
import { timeToCron, createScheduler } from '../ui/scheduler.js';

describe('timeToCron', () => {
  it('converts HH:MM to cron expression', () => {
    expect(timeToCron('03:00')).toBe('0 3 * * *');
    expect(timeToCron('14:30')).toBe('30 14 * * *');
    expect(timeToCron('00:00')).toBe('0 0 * * *');
  });

  it('throws on invalid format', () => {
    expect(() => timeToCron('25:00')).toThrow();
    expect(() => timeToCron('abc')).toThrow();
    expect(() => timeToCron('')).toThrow();
  });
});

describe('runOnLaunchIfStale', () => {
  function makeStore(overrides = {}) {
    const state = { firstRunCompleted: true, paused: false, stale: true, ...overrides };
    return {
      get: k => state[k],
      isStale: () => state.stale,
    };
  }

  it('skips when first-run wizard is incomplete', () => {
    vi.useFakeTimers();
    const runClaim = vi.fn();
    createScheduler({ store: makeStore({ firstRunCompleted: false }), runClaim }).runOnLaunchIfStale();
    vi.advanceTimersByTime(60_000);
    expect(runClaim).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('skips when paused', () => {
    vi.useFakeTimers();
    const runClaim = vi.fn();
    createScheduler({ store: makeStore({ paused: true }), runClaim }).runOnLaunchIfStale();
    vi.advanceTimersByTime(60_000);
    expect(runClaim).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('schedules a catch-up run when stale after first-run', () => {
    vi.useFakeTimers();
    const runClaim = vi.fn();
    createScheduler({ store: makeStore(), runClaim }).runOnLaunchIfStale();
    vi.advanceTimersByTime(30_000);
    expect(runClaim).toHaveBeenCalledWith('on-launch-catchup');
    vi.useRealTimers();
  });
});
