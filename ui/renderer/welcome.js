const STORES = [
  { id: 'epic', name: 'Epic Games' },
  { id: 'prime', name: 'Prime Gaming' },
  { id: 'gog', name: 'GOG' },
];

const state = { connected: {}, skipped: {}, users: {} };

export async function showWelcome() {
  const status = await window.api.getStatus();
  if (status.firstRunCompleted) {
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    return false;
  }
  document.getElementById('welcome').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  renderCards();
  return true;
}

function renderCards() {
  const html = `
    <h1 style="margin-top:0">Welcome to Auto Claimer</h1>
    <p>Log into the stores you want to claim free games from. You can skip any you don't use.</p>
    ${STORES.map(s => cardFor(s)).join('')}
    <div id="welcome-actions" style="margin-top:16px">
      <button id="welcome-done" disabled>Continue to settings</button>
    </div>
  `;
  document.getElementById('welcome').innerHTML = html;
  STORES.forEach(s => wireCard(s));
  document.getElementById('welcome-done').addEventListener('click', showSettings);
  updateContinue();
}

function cardFor(s) {
  return `
    <div class="welcome-card" data-store="${s.id}" style="background:#2a2a2a;padding:12px;border-radius:8px;margin:8px 0">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div><b>${s.name}</b> <span class="status">— Not connected</span></div>
        <div>
          <button class="login-btn" data-store="${s.id}">Log in</button>
          <button class="skip-btn" data-store="${s.id}" style="background:#555;margin-left:6px">Skip</button>
        </div>
      </div>
      <pre class="card-log" style="background:#000;color:#0f0;font-size:11px;padding:6px;margin:6px 0 0;height:60px;overflow:auto;display:none"></pre>
    </div>`;
}

function wireCard(s) {
  const card = document.querySelector(`.welcome-card[data-store="${s.id}"]`);
  card.querySelector('.login-btn').addEventListener('click', async () => {
    const log = card.querySelector('.card-log');
    log.style.display = 'block'; log.textContent = '';
    const lineHandler = ({ store, line }) => {
      if (store === s.id) { log.textContent += line + '\n'; log.scrollTop = log.scrollHeight; }
    };
    window.api.onRunLine(lineHandler);
    const result = await window.api.login(s.id);
    if (result.class === 'ok_claimed' || result.class === 'ok_nothing') {
      state.connected[s.id] = true;
      state.users[s.id] = result.user ?? '(unknown)';
      card.querySelector('.status').textContent = `— ✓ Connected as ${result.user ?? '(unknown)'}`;
    } else {
      card.querySelector('.status').textContent = `— ⚠ ${result.class} (try again)`;
    }
    updateContinue();
  });
  card.querySelector('.skip-btn').addEventListener('click', () => {
    state.skipped[s.id] = true;
    card.querySelector('.status').textContent = '— Skipped';
    card.querySelector('.login-btn').disabled = true;
    updateContinue();
  });
}

function updateContinue() {
  const allHandled = STORES.every(s => state.connected[s.id] || state.skipped[s.id]);
  document.getElementById('welcome-done').disabled = !allHandled;
}

async function showSettings() {
  const enabledStores = {};
  STORES.forEach(s => { enabledStores[s.id] = !!state.connected[s.id]; });
  document.getElementById('welcome').innerHTML = `
    <h1>Settings</h1>
    <label>Daily run time: <input id="schedule-time" type="time" value="03:00" /></label><br/><br/>
    <label><input id="autostart" type="checkbox" checked /> Start Auto Claimer when I log into Windows</label><br/><br/>
    <button id="settings-done">Done</button>
  `;
  document.getElementById('settings-done').addEventListener('click', async () => {
    const scheduleTime = document.getElementById('schedule-time').value || '03:00';
    await window.api.saveSettings({
      scheduleTime,
      autostartOnLogin: document.getElementById('autostart').checked,
      enabledStores,
    });
    await window.api.completeFirstRun();
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
  });
}
