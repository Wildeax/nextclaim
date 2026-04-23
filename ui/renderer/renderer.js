import { showWelcome } from './welcome.js';

const STORES = [
  { id: 'epic', name: 'Epic Games', logo: '../../assets/epic-games-logo.webp' },
  { id: 'prime', name: 'Prime Gaming', logo: '../../assets/prime-gaming-logo.png' },
  { id: 'gog', name: 'GOG', logo: '../../assets/gog-logo.webp' },
];

const CLASS_LABEL = {
  ok_claimed: 'Claimed',
  ok_nothing: 'Up to date',
  login_expired: 'Login expired',
  captcha: 'Captcha needed',
  linking_needed: 'Account linking needed',
  crash: 'Error',
};

function classToDot(c) {
  if (c === 'ok_claimed' || c === 'ok_nothing') return 'green';
  if (c === 'login_expired' || c === 'captcha' || c === 'linking_needed') return 'yellow';
  if (c === 'crash') return 'red';
  return 'gray';
}

function formatRelative(ts) {
  if (!ts) return 'never';
  const delta = Date.now() - ts;
  const mins = Math.round(delta / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

async function init() {
  await window.api.ping();
  const showingWelcome = await showWelcome();
  if (!showingWelcome) {
    document.getElementById('dashboard').classList.remove('hidden');
    await refreshAll();
  }
}

async function refreshAll() {
  const status = await window.api.getStatus();
  renderHeader(status);
  renderStoreCards(status);
  await refreshHistory();
}

function renderHeader(status) {
  const sub = document.getElementById('header-subtitle');
  if (status.paused) {
    sub.innerHTML = '<span class="dot yellow"></span>Schedule paused';
    return;
  }
  const anyError = Object.values(status.lastRunPerStore ?? {}).some(r =>
    ['login_expired', 'captcha', 'linking_needed', 'crash'].includes(r.class)
  );
  const bits = [];
  if (anyError) bits.push('<span class="dot red"></span>Needs attention');
  else bits.push('<span class="dot green"></span>Active');
  bits.push(`Next run: ${status.scheduleTime ?? '03:00'}`);
  if (status.lastRunAt) bits.push(`Last run: ${formatRelative(status.lastRunAt)}`);
  sub.innerHTML = bits.join(' <span style="color:#4a5764">·</span> ');
}

function renderStoreCards(status) {
  const enabled = status.enabledStores ?? {};
  const container = document.getElementById('store-cards');
  const html = STORES.map(s => {
    const run = status.lastRunPerStore?.[s.id];
    const isEnabled = enabled[s.id];
    let statusHtml;
    if (!isEnabled) {
      statusHtml = `<span class="dot gray"></span>Disabled`;
    } else if (!run) {
      statusHtml = `<span class="dot gray"></span>Not run yet`;
    } else {
      const dot = classToDot(run.class);
      const label = CLASS_LABEL[run.class] ?? run.class;
      const extra = run.claimedCount > 0 ? ` · ${run.claimedCount} new` : '';
      statusHtml = `<span class="dot ${dot}"></span>${label}${extra}`;
    }
    const meta = run
      ? `<span>${formatRelative(run.at)}</span><button data-store="${s.id}" class="relogin">Re-login</button>`
      : `<span>—</span><button data-store="${s.id}" class="relogin">Log in</button>`;
    return `
      <div class="store-card" data-store="${s.id}">
        <div class="store-card-top">
          <div class="store-badge"><img src="${s.logo}" alt="${s.name}" /></div>
          <div class="store-name">${s.name}</div>
        </div>
        <div class="store-status">${statusHtml}</div>
        <div class="store-meta">${meta}</div>
      </div>`;
  }).join('');
  container.innerHTML = html;
  document.querySelectorAll('.store-card .relogin').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      clearLog();
      await window.api.login(btn.dataset.store);
      await refreshAll();
    });
  });
  const enabledCount = STORES.filter(s => enabled[s.id]).length;
  document.getElementById('stores-sub').textContent = `${enabledCount} of ${STORES.length} enabled`;
}

async function refreshHistory() {
  const rows = await window.api.getHistory();
  const container = document.getElementById('history-content');
  const sub = document.getElementById('history-sub');
  if (rows.length === 0) {
    container.innerHTML = '<div class="empty">No games claimed yet. Hit "Claim now" to run the first check.</div>';
    sub.textContent = '';
    return;
  }
  const html = rows.map(r => {
    const code = r.code ? `<button class="btn btn-ghost btn-sm" data-code="${r.code}">Copy code</button>` : '<span></span>';
    const store = STORES.find(s => s.id === r.store)?.name ?? r.store;
    const when = formatRelative(new Date(r.time).getTime());
    return `
      <div class="history-row">
        <span class="history-store">${store}</span>
        <span class="history-title">${escapeHtml(r.title ?? '(untitled)')}</span>
        <span class="history-time">${when}</span>
        ${code}
      </div>`;
  }).join('');
  container.innerHTML = html;
  sub.textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
  container.querySelectorAll('button[data-code]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(btn.dataset.code);
      const original = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = original; }, 1200);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function clearLog() {
  document.getElementById('log-content').textContent = '';
}

window.api.onRunLine(({ store, line }) => {
  const log = document.getElementById('log-content');
  log.textContent += `[${store}] ${line}\n`;
  log.scrollTop = log.scrollHeight;
});

window.api.onRunEnd?.(() => {
  refreshAll();
});

document.getElementById('claim-now').addEventListener('click', async () => {
  const btn = document.getElementById('claim-now');
  btn.disabled = true;
  btn.querySelector('span:last-child').textContent = 'Running…';
  clearLog();
  try {
    await window.api.runAll();
    await refreshAll();
  } finally {
    btn.disabled = false;
    btn.querySelector('span:last-child').textContent = 'Claim now';
  }
});

document.getElementById('clear-log').addEventListener('click', clearLog);

document.getElementById('copy-log').addEventListener('click', async () => {
  const btn = document.getElementById('copy-log');
  const text = document.getElementById('log-content').textContent;
  if (!text.trim()) return;
  await navigator.clipboard.writeText(text);
  const original = btn.textContent;
  btn.textContent = 'Copied';
  setTimeout(() => { btn.textContent = original; }, 1200);
});

init();
