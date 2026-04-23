async function init() {
  await window.api.ping();
  await refresh();
  await refreshHistory();
}

async function refresh() {
  const status = await window.api.getStatus();
  const stores = ['epic', 'prime', 'gog'];
  const rows = stores.map(s => {
    const run = status.lastRunPerStore?.[s];
    if (!run) return `<div><span class="dot gray"></span>${s} — never run</div>`;
    const cls = run.class;
    const dot = (cls === 'ok_claimed' || cls === 'ok_nothing') ? 'green'
              : (cls === 'login_expired' || cls === 'captcha' || cls === 'linking_needed') ? 'yellow'
              : 'red';
    const when = new Date(run.at).toLocaleString();
    return `<div><span class="dot ${dot}"></span>${s} — ${cls} (${when})</div>`;
  }).join('');
  const next = status.paused ? 'paused' : `next at ${status.scheduleTime}`;
  document.getElementById('status-content').innerHTML = rows + `<div style="margin-top:8px;color:#999">Schedule: ${next}</div>`;
}

async function refreshHistory() {
  const rows = await window.api.getHistory();
  if (rows.length === 0) {
    document.getElementById('history-content').innerHTML = '<div style="color:#999">No games claimed yet.</div>';
    return;
  }
  const html = rows.map(r => {
    const code = r.code ? `<button class="copy-btn" data-code="${r.code}">Copy code</button>` : '';
    const t = new Date(r.time).toLocaleDateString();
    return `<div style="padding:4px 0;border-bottom:1px solid #333"><b>${r.store}</b> — ${r.title} <span style="color:#999">(${t})</span> ${code}</div>`;
  }).join('');
  document.getElementById('history-content').innerHTML = html;
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => navigator.clipboard.writeText(btn.dataset.code));
  });
}

window.api.onRunLine(({ store, line }) => {
  const log = document.getElementById('log-content');
  log.textContent += `[${store}] ${line}\n`;
  log.scrollTop = log.scrollHeight;
});

document.getElementById('claim-now').addEventListener('click', async () => {
  document.getElementById('log-content').textContent = '';
  await window.api.runAll();
  await refresh();
  await refreshHistory();
});

document.querySelectorAll('#login-buttons button').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.getElementById('log-content').textContent = '';
    await window.api.login(btn.dataset.store);
    await refresh();
    await refreshHistory();
  });
});

init();
