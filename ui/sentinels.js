const ANSI_RE = /\x1b\[[0-9;]*m/g;

const PATTERNS = [
  { re: /^Signed in as (.+)$/, build: m => ({ type: 'login_ok', user: m[1] }) },
  { re: /^Not signed in anymore\.?$/, build: () => ({ type: 'login_lost' }) },
  { re: /^Claimed successfully!$/, build: () => ({ type: 'claimed' }) },
  { re: /^Redeemed successfully\.$/, build: () => ({ type: 'claimed' }) },
  { re: /^Already in library! Nothing to claim\.$/, build: () => ({ type: 'already_owned' }) },
  { re: /^Code was already used!$/, build: () => ({ type: 'already_owned' }) },
  { re: /^Failed to claim!$/, build: () => ({ type: 'failed' }) },
  { re: /^Got hcaptcha challenge!$/, build: () => ({ type: 'captcha' }) },
  { re: /^Got a captcha during login.*$/, build: () => ({ type: 'captcha' }) },
  { re: /^Got captcha; could not redeem!$/, build: () => ({ type: 'captcha' }) },
  { re: /^Code to redeem game:\s*(\S+)\s*$/, build: m => ({ type: 'code', code: m[1] }) },
  { re: /^Account linking is required to claim this offer!$/, build: () => ({ type: 'linking_needed' }) },
  { re: /^This product is unavailable in your region!$/, build: () => ({ type: 'region_locked' }) },
];

export function parseLine(line) {
  if (!line) return null;
  const stripped = line.replace(ANSI_RE, '').trim();
  for (const { re, build } of PATTERNS) {
    const m = stripped.match(re);
    if (m) return build(m);
  }
  return null;
}
