import { Notification } from 'electron';

const PRETTY = { epic: 'Epic Games', prime: 'Prime Gaming', gog: 'GOG' };
const pretty = s => PRETTY[s] ?? s;

const ERROR_MESSAGES = {
  login_expired: store => `${pretty(store)} needs you to log in again — open NextClaim`,
  captcha: store => `${pretty(store)} showed a captcha — open NextClaim and click Log in to ${pretty(store)}`,
  linking_needed: () => `A Prime offer needs you to link your Twitch/store account — open NextClaim`,
  crash: store => `NextClaim hit an error on ${pretty(store)} — open to see logs`,
};

export function notifyError(storeName, classification, onClick) {
  const builder = ERROR_MESSAGES[classification.class];
  if (!builder) return;
  const n = new Notification({ title: 'NextClaim', body: builder(storeName) });
  if (onClick) n.on('click', onClick);
  n.show();
}

export function notifyDailySummary(results, onClick) {
  const claimed = [];
  let codeCount = 0;
  for (const [storeName, c] of Object.entries(results)) {
    if (c.class === 'ok_claimed') claimed.push(`${c.claimedCount} from ${pretty(storeName)}`);
    codeCount += c.codes?.length ?? 0;
  }
  if (claimed.length === 0 && codeCount === 0) return;
  const parts = [];
  if (claimed.length) parts.push(`Claimed ${claimed.join(', ')}`);
  if (codeCount) parts.push(`${codeCount} code${codeCount > 1 ? 's' : ''} to redeem`);
  const n = new Notification({ title: 'NextClaim', body: parts.join(' — ') });
  if (onClick) n.on('click', onClick);
  n.show();
}
