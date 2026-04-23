export function classify(events, exitCode) {
  const has = type => events.some(e => e.type === type);
  const claimedCount = events.filter(e => e.type === 'claimed').length;
  const codes = events.filter(e => e.type === 'code').map(e => e.code);
  const user = events.find(e => e.type === 'login_ok')?.user ?? null;

  let cls;
  if (has('captcha')) cls = 'captcha';
  else if (has('linking_needed')) cls = 'linking_needed';
  else if (has('login_lost') || (exitCode !== 0 && !has('login_ok'))) cls = 'login_expired';
  else if (exitCode !== 0) cls = 'crash';
  else if (claimedCount > 0) cls = 'ok_claimed';
  else cls = 'ok_nothing';

  return { class: cls, claimedCount, codes, user, exitCode };
}
