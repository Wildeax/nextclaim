import { describe, it, expect } from 'vitest';
import { classify } from '../ui/classifier.js';

describe('classify', () => {
  it('returns ok_claimed when claimed sentinels present', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'claimed' }, { type: 'claimed' }];
    expect(classify(events, 0)).toMatchObject({
      class: 'ok_claimed',
      claimedCount: 2,
    });
  });

  it('returns ok_nothing when only already_owned + login_ok and exit 0', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'already_owned' }];
    expect(classify(events, 0)).toMatchObject({ class: 'ok_nothing' });
  });

  it('returns login_expired when login_lost seen', () => {
    const events = [{ type: 'login_lost' }];
    expect(classify(events, 1)).toMatchObject({ class: 'login_expired' });
  });

  it('returns login_expired when exit non-zero and no login_ok ever seen', () => {
    expect(classify([], 1)).toMatchObject({ class: 'login_expired' });
  });

  it('returns captcha when captcha sentinel present', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'captcha' }];
    expect(classify(events, 1)).toMatchObject({ class: 'captcha' });
  });

  it('captcha takes precedence over login_expired', () => {
    const events = [{ type: 'login_lost' }, { type: 'captcha' }];
    expect(classify(events, 1)).toMatchObject({ class: 'captcha' });
  });

  it('returns linking_needed when linking_needed sentinel present', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'linking_needed' }];
    expect(classify(events, 0)).toMatchObject({ class: 'linking_needed' });
  });

  it('collects codes', () => {
    const events = [
      { type: 'login_ok', user: 'alice' },
      { type: 'code', code: 'ABC-123' },
      { type: 'code', code: 'XYZ-789' },
    ];
    const result = classify(events, 0);
    expect(result.codes).toEqual(['ABC-123', 'XYZ-789']);
  });

  it('returns crash when exit non-zero with login_ok and no other classification', () => {
    const events = [{ type: 'login_ok', user: 'alice' }];
    expect(classify(events, 1)).toMatchObject({ class: 'crash' });
  });

  it('region_locked alone with exit 0 is ok_nothing', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'region_locked' }];
    expect(classify(events, 0)).toMatchObject({ class: 'ok_nothing' });
  });

  it('precedence: captcha > linking_needed > login_expired > crash > ok_claimed > ok_nothing', () => {
    const all = [
      { type: 'login_ok', user: 'alice' },
      { type: 'claimed' },
      { type: 'linking_needed' },
      { type: 'captcha' },
    ];
    expect(classify(all, 1).class).toBe('captcha');
  });
});
