const STORES = [
  { id: 'epic', name: 'Epic Games', logo: '../../assets/epic-games-logo.webp' },
  { id: 'prime', name: 'Prime Gaming', logo: '../../assets/prime-gaming-logo.png' },
  { id: 'gog', name: 'GOG', logo: '../../assets/gog-logo.webp' },
];

const state = { connected: {}, skipped: {}, users: {} };

export async function showWelcome() {
  const status = await window.api.getStatus();
  if (status.firstRunCompleted) {
    document.getElementById('welcome').classList.add('hidden');
    return false;
  }
  document.getElementById('welcome').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  renderCards();
  return true;
}

function renderCards() {
  const welcome = document.getElementById('welcome');
  welcome.innerHTML = `
    <div class="welcome-hero">
      <img src="../../assets/isotipo.png" alt="NextClaim" />
      <h1>NextClaim</h1>
      <p>Log into the stores you want to claim free games from. You can skip any you don't use.</p>
    </div>
    <div class="welcome-cards">
      ${STORES.map(cardFor).join('')}
    </div>
    <div class="welcome-footer">
      <span class="welcome-progress" id="welcome-progress">0 of ${STORES.length} handled</span>
      <button id="welcome-done" class="btn btn-primary" disabled>
        <span>Continue to settings</span>
        <span class="btn-icon">→</span>
      </button>
    </div>
  `;
  STORES.forEach(wireCard);
  document.getElementById('welcome-done').addEventListener('click', showSettings);
  updateContinue();
}

function cardFor(s) {
  return `
    <div class="welcome-card" data-store="${s.id}">
      <div class="welcome-card-top">
        <div class="store-badge welcome-badge"><img src="${s.logo}" alt="${s.name}" /></div>
        <div style="flex:1;min-width:0">
          <div class="store-name">${s.name}</div>
          <div class="store-status"><span class="dot gray"></span><span class="status-text">Not connected</span></div>
        </div>
        <div class="welcome-card-buttons">
          <button class="btn btn-primary login-btn" data-store="${s.id}">Log in</button>
          <button class="btn btn-secondary skip-btn" data-store="${s.id}">Skip</button>
        </div>
      </div>
      <pre class="card-log"></pre>
    </div>`;
}

function wireCard(s) {
  const card = document.querySelector(`.welcome-card[data-store="${s.id}"]`);
  const loginBtn = card.querySelector('.login-btn');
  const skipBtn = card.querySelector('.skip-btn');
  const status = card.querySelector('.store-status');
  const log = card.querySelector('.card-log');

  loginBtn.addEventListener('click', async () => {
    loginBtn.disabled = true;
    skipBtn.disabled = true;
    loginBtn.textContent = 'Opening browser…';
    log.style.display = 'block'; log.textContent = '';
    const lineHandler = ({ store, line }) => {
      if (store === s.id) { log.textContent += line + '\n'; log.scrollTop = log.scrollHeight; }
    };
    window.api.onRunLine(lineHandler);
    const result = await window.api.login(s.id);
    loginBtn.disabled = false;
    skipBtn.disabled = false;
    if (result.class === 'ok_claimed' || result.class === 'ok_nothing') {
      state.connected[s.id] = true;
      state.users[s.id] = result.user ?? '(unknown)';
      card.classList.add('connected');
      status.innerHTML = `<span class="dot green"></span><span class="status-text">Connected as ${escapeHtml(result.user ?? '(unknown)')}</span>`;
      loginBtn.textContent = 'Reconnect';
    } else {
      card.classList.remove('connected');
      status.innerHTML = `<span class="dot yellow"></span><span class="status-text">${labelFor(result.class)} — try again</span>`;
      loginBtn.textContent = 'Try again';
    }
    updateContinue();
  });

  skipBtn.addEventListener('click', () => {
    state.skipped[s.id] = true;
    delete state.connected[s.id];
    card.classList.remove('connected');
    card.classList.add('skipped');
    status.innerHTML = `<span class="dot gray"></span><span class="status-text">Skipped</span>`;
    loginBtn.disabled = true;
    skipBtn.disabled = true;
    updateContinue();
  });
}

function updateContinue() {
  const handled = STORES.filter(s => state.connected[s.id] || state.skipped[s.id]).length;
  document.getElementById('welcome-progress').textContent = `${handled} of ${STORES.length} handled`;
  document.getElementById('welcome-done').disabled = handled < STORES.length;
}

async function showSettings() {
  const enabledStores = {};
  STORES.forEach(s => { enabledStores[s.id] = !!state.connected[s.id]; });
  const welcome = document.getElementById('welcome');
  welcome.innerHTML = `
    <div class="welcome-hero">
      <img src="../../assets/isotipo.png" alt="NextClaim" />
      <h1>Almost done</h1>
      <p>Pick when NextClaim should run each day.</p>
    </div>
    <form class="settings-form" id="settings-form">
      <div class="field">
        <label for="schedule-time">Daily run time</label>
        <input id="schedule-time" type="time" value="03:00" />
        <div class="field-hint">NextClaim will log in once a day and claim any free games. 3 AM is fine for most people.</div>
      </div>
      <div class="field checkbox">
        <input id="autostart" type="checkbox" checked />
        <label for="autostart">Start NextClaim automatically when I log into Windows</label>
      </div>
      <div class="settings-actions">
        <button id="settings-done" type="button" class="btn btn-primary">
          <span>Finish setup</span>
          <span class="btn-icon">✓</span>
        </button>
      </div>
    </form>
  `;
  document.getElementById('settings-done').addEventListener('click', async () => {
    const scheduleTime = document.getElementById('schedule-time').value || '03:00';
    await window.api.saveSettings({
      scheduleTime,
      autostartOnLogin: document.getElementById('autostart').checked,
      enabledStores,
    });
    await window.api.completeFirstRun();
    welcome.classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    window.location.reload();
  });
}

function labelFor(cls) {
  return ({
    login_expired: 'Login expired',
    captcha: 'Captcha needed',
    linking_needed: 'Account linking needed',
    crash: 'Error',
  })[cls] ?? cls;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
