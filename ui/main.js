import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification } from 'electron';
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

function specFor(storeName, { show }) {
  const env = {
    ELECTRON_RUN_AS_NODE: '1',
    SHOW: show ? '1' : '0',
    BROWSER_DIR: join(FGC_DATA_DIR, 'browser'),
    SCREENSHOTS_DIR: join(FGC_DATA_DIR, 'screenshots'),
  };
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
  rows.sort((a, b) => new Date(b.time) - new Date(a.time));
  return rows.slice(0, 50);
});

ipcMain.handle('run-all', () => runClaim('manual'));

ipcMain.handle('login', (_e, storeName) => {
  return runner.runOne(storeName, specFor(storeName, { show: true }));
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
  createWindow();
  createTray();
  setAutostart(store.get('autostartOnLogin'));
  scheduler = createScheduler({ store, runClaim });
  scheduler.start();
  scheduler.runOnLaunchIfStale();
  if (!store.get('firstRunCompleted')) win.show();
});

app.on('window-all-closed', e => e.preventDefault());
