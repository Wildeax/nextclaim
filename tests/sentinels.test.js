import { describe, it, expect } from 'vitest';
import { parseLine } from '../ui/sentinels.js';

describe('parseLine', () => {
  it('parses "Signed in as <user>"', () => {
    expect(parseLine('Signed in as alice')).toEqual({ type: 'login_ok', user: 'alice' });
  });

  it('parses "Signed in as" with multi-word user', () => {
    expect(parseLine('Signed in as alice@example.com')).toEqual({ type: 'login_ok', user: 'alice@example.com' });
  });

  it('parses "Not signed in anymore."', () => {
    expect(parseLine('Not signed in anymore.')).toEqual({ type: 'login_lost' });
  });

  it('parses "Claimed successfully!" (Epic/GOG)', () => {
    expect(parseLine('Claimed successfully!')).toEqual({ type: 'claimed' });
    expect(parseLine('  Claimed successfully!')).toEqual({ type: 'claimed' });
  });

  it('parses "Redeemed successfully." (Prime)', () => {
    expect(parseLine('  Redeemed successfully.')).toEqual({ type: 'claimed' });
  });

  it('parses "Already in library! Nothing to claim."', () => {
    expect(parseLine('Already in library! Nothing to claim.')).toEqual({ type: 'already_owned' });
  });

  it('parses "Code was already used!" (Prime)', () => {
    expect(parseLine('  Code was already used!')).toEqual({ type: 'already_owned' });
  });

  it('parses "Failed to claim!"', () => {
    expect(parseLine('Failed to claim!')).toEqual({ type: 'failed' });
  });

  it('parses Epic captcha', () => {
    expect(parseLine('Got hcaptcha challenge!')).toEqual({ type: 'captcha' });
  });

  it('parses GOG captcha', () => {
    expect(parseLine('Got a captcha during login (likely due to too many attempts)!')).toEqual({ type: 'captcha' });
  });

  it('parses Prime captcha', () => {
    expect(parseLine('  Got captcha; could not redeem!')).toEqual({ type: 'captcha' });
  });

  it('parses Prime "Code to redeem game: <code>"', () => {
    expect(parseLine('  Code to redeem game: ABC-DEF-GHI')).toEqual({ type: 'code', code: 'ABC-DEF-GHI' });
  });

  it('parses Prime "Account linking is required..."', () => {
    expect(parseLine('  Account linking is required to claim this offer!')).toEqual({ type: 'linking_needed' });
  });

  it('parses Epic region-locked', () => {
    expect(parseLine('This product is unavailable in your region!')).toEqual({ type: 'region_locked' });
  });

  it('returns null for unrecognized lines', () => {
    expect(parseLine('Some random log line')).toBeNull();
    expect(parseLine('')).toBeNull();
  });

  it('strips ANSI color codes', () => {
    expect(parseLine('\x1b[32mClaimed successfully!\x1b[0m')).toEqual({ type: 'claimed' });
  });
});
