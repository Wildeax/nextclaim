export function classify(events, exitCode) {
  const has = type => events.some(e => e.type === type);
  const claimedCount = events.filter(e => e.type === 'claimed').length;
  const codes = events.filter(e => e.type === 'code').map(e => e.code);
  const user = events.find(e => e.type === 'login_ok')?.user ?? null;

  let cls;
  if (has('captcha')) cls = 'captcha';
  else if (has('linking_needed')) cls = 'linking_needed';
  else if (has('login_lost') || (exitCode !== 0 && !has('login_ok'))) cls = 'login_expired';
  // Treat any successful claim OR captured external-store key as success,
  // even if the script crashed later on an edge case (e.g. Prime's
  // external-store code readout failing for one game out of many).
  // `claimed` = game added directly to the user's library.
  // `code`    = redemption key captured (user must redeem separately on GOG/Origin/etc.).
  else if (claimedCount > 0 || codes.length > 0) cls = 'ok_claimed';
  else if (exitCode !== 0) cls = 'crash';
  else cls = 'ok_nothing';

  return { class: cls, claimedCount, codes, user, exitCode };
}
