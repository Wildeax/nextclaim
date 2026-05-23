import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { createStore } from './store.js';
import { createRunner } from './runner.js';
import { notifyError, notifyDailySummary } from './notifier.js';
import { createScheduler } from './scheduler.js';
import { setAutostart } from './autostart.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const EXE_DIR = app.isPackaged ? dirname(process.execPath) : ROOT;
const PORTABLE_DATA_ROOT = app.isPackaged ? join(EXE_DIR, 'data') : join(ROOT, 'portable-data');
const FGC_DIR = app.isPackaged ? join(process.resourcesPath, 'free-games-claimer') : join(ROOT, 'free-games-claimer');
const FGC_DATA_DIR = app.isPackaged ? join(PORTABLE_DATA_ROOT, 'fgc') : join(FGC_DIR, 'data');

const SCRIPT_FOR = { epic: 'epic-games', prime: 'prime-gaming', gog: 'gog' };
const ERROR_CLASSES = new Set(['login_expired', 'captcha', 'linking_needed', 'crash']);

let win = null;
let tray = null;
const store = createStore({ cwd: PORTABLE_DATA_ROOT });
const runner = createRunner();
let scheduler = null;

function createWindow() {
  win = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 560,
    show: false,
    backgroundColor: '#10131a',
    icon: join(ROOT, 'assets', 'app-icon.ico'),
    title: 'NextClaim',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(join(__dirname, 'renderer', 'index.html'));
  win.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function setTrayIcon(variant) {
  if (!tray) return;
  const file = variant === 'error' ? 'isotipo-error.ico' : 'isotipo.ico';
  tray.setImage(nativeImage.createFromPath(join(ROOT, 'assets', file)));
}

function rebuildTrayMenu() {
  if (!tray) return;
  const paused = store.get('paused');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => win.show() },
    { label: 'Claim Now', click: () => runClaim('tray') },
    { type: 'separator' },
    {
      label: paused ? 'Resume schedule' : 'Pause schedule',
      click: () => {
        store.set('paused', !paused);
        if (scheduler) scheduler.start();
        rebuildTrayMenu();
      },
    },
    { type: 'separator' },
    { label: 'Exit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(join(ROOT, 'assets', 'isotipo.ico'));
  tray = new Tray(icon);
  tray.setToolTip('NextClaim');
  tray.on('click', () => {
    if (win.isVisible()) win.hide();
    else win.show();
  });
  rebuildTrayMenu();
}

const PLAYWRIGHT_BROWSERS_PATH = app.isPackaged
  ? join(process.resourcesPath, 'playwright-browsers')
  : undefined;

function specFor(storeName, { show, loginOnly }) {
  const env = {
    ELECTRON_RUN_AS_NODE: '1',
    SHOW: show ? '1' : '0',
    FGC_DATA_DIR,
    BROWSER_DIR: join(FGC_DATA_DIR, 'browser'),
    SCREENSHOTS_DIR: join(FGC_DATA_DIR, 'screenshots'),
  };
  if (loginOnly) env.LOGIN_ONLY = '1';
  if (show) {
    // Cap viewport so the login form fits on common laptop displays (1366x768 / 1536x864).
    // Using 1366x720 keeps the Chromium window under 800px tall including chrome.
    env.WIDTH = '1366';
    env.HEIGHT = '720';
    // Default 180s is too short when waiting for an email verification code.
    env.LOGIN_TIMEOUT = '600';
    // Force on-screen position. Chromium's persistent context (shared user-data-dir
    // across all stores) remembers the last window position in its Preferences file,
    // so a previous scheduled run with --window-position=offscreen would otherwise
    // make this re-login open off the visible desktop.
    const primary = screen.getPrimaryDisplay();
    const wa = primary.workArea;
    env.WINDOW_POS_X = String(Math.max(wa.x, wa.x + Math.round((wa.width - 1366) / 2)));
    env.WINDOW_POS_Y = String(Math.max(wa.y, wa.y + Math.round((wa.height - 720) / 2)));
  } else {
    // Non-interactive scheduled run: Epic still forces a visible Chromium (upstream dev branch
    // hardcodes headless:false because hCaptcha detects headless mode). Position off-screen +
    // start minimized so it runs invisibly for the user. Works on any monitor size.
    const primary = screen.getPrimaryDisplay();
    const offscreenX = primary.bounds.x + primary.bounds.width + 100;
    env.WINDOW_POS_X = String(offscreenX);
    env.WINDOW_POS_Y = '0';
    env.WINDOW_MINIMIZED = '1';
  }
  if (PLAYWRIGHT_BROWSERS_PATH) env.PLAYWRIGHT_BROWSERS_PATH = PLAYWRIGHT_BROWSERS_PATH;
  return {
    cmd: process.execPath,
    args: [`${SCRIPT_FOR[storeName]}.js`],
    cwd: FGC_DIR,
    env,
  };
}

function broadcast(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

runner.on('run:start', e => broadcast('run:start', e));
runner.on('run:line', e => broadcast('run:line', e));
runner.on('run:end', e => {
  store.recordRun(e.store, e.classification);
  broadcast('run:end', e);
  if (ERROR_CLASSES.has(e.classification.class)) {
    notifyError(e.store, e.classification, () => win.show());
    setTrayIcon('error');
  }
});

async function runClaim(_reason) {
  const enabled = store.get('enabledStores');
  const specs = {};
  for (const s of ['epic', 'prime', 'gog']) {
    if (enabled[s]) specs[s] = specFor(s, { show: false });
  }
  const results = await runner.runAll(specs);
  notifyDailySummary(results, () => win.show());
  const anyError = Object.values(results).some(r => ERROR_CLASSES.has(r.class));
  setTrayIcon(anyError ? 'error' : 'normal');
  return results;
}

ipcMain.handle('ping', () => 'pong');

ipcMain.handle('get-status', () => ({
  lastRunAt: store.get('lastRunAt'),
  lastRunPerStore: store.get('lastRunPerStore'),
  scheduleTime: store.get('scheduleTime'),
  paused: store.get('paused'),
  enabledStores: store.get('enabledStores'),
  firstRunCompleted: store.get('firstRunCompleted'),
}));

ipcMain.handle('get-history', () => {
  const FILES = {
    epic: join(FGC_DATA_DIR, 'epic-games.json'),
    prime: join(FGC_DATA_DIR, 'prime-gaming.json'),
    gog: join(FGC_DATA_DIR, 'gog.json'),
  };
  const rows = [];
  for (const [storeName, path] of Object.entries(FILES)) {
    if (!existsSync(path)) continue;
    try {
      const db = JSON.parse(readFileSync(path, 'utf8'));
      for (const user of Object.keys(db)) {
        for (const [gameId, game] of Object.entries(db[user] ?? {})) {
          rows.push({
            store: storeName,
            user,
            id: gameId,
            title: game.title,
            time: game.time,
            status: game.status,
            url: game.url,
            code: game.code ?? null,
          });
        }
      }
    } catch {
      // ignore malformed JSON files
    }
  }
  // Dedup by store+title (fallback to id). Same title appears under multiple ids when
  // Epic mobile publishes separate Android/iOS slugs, and under multiple user keys when
  // an earlier run's user-resolution raced SPA hydration. Keep the most recent record.
  const dedup = new Map();
  for (const r of rows) {
    const key = `${r.store}:${r.title || r.id}`;
    const existing = dedup.get(key);
    if (!existing || new Date(r.time) > new Date(existing.time)) dedup.set(key, r);
  }
  const out = Array.from(dedup.values());
  out.sort((a, b) => new Date(b.time) - new Date(a.time));
  return out.slice(0, 50);
});

ipcMain.handle('run-all', () => runClaim('manual'));

ipcMain.handle('login', (_e, storeName) => {
  return runner.runOne(storeName, specFor(storeName, { show: true, loginOnly: true }));
});

ipcMain.handle('save-settings', (_e, settings) => {
  if (settings.scheduleTime) store.set('scheduleTime', settings.scheduleTime);
  if (typeof settings.autostartOnLogin === 'boolean') {
    store.set('autostartOnLogin', settings.autostartOnLogin);
    setAutostart(settings.autostartOnLogin);
  }
  if (settings.enabledStores) store.set('enabledStores', settings.enabledStores);
  if (scheduler) scheduler.start();
});

ipcMain.handle('complete-first-run', () => {
  store.set('firstRunCompleted', true);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  createTray();
  setAutostart(store.get('autostartOnLogin'));
  scheduler = createScheduler({ store, runClaim });
  scheduler.start();
  scheduler.runOnLaunchIfStale();
  if (!store.get('firstRunCompleted')) win.show();
});

app.on('window-all-closed', e => e.preventDefault());
