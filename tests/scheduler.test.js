import { describe, it, expect } from 'vitest';
import { timeToCron } from '../ui/scheduler.js';

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
