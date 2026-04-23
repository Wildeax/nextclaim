import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { createStore } from './store.js';
import { createRunner } from './runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FGC_DIR = join(ROOT, 'free-games-claimer');

const SCRIPT_FOR = { epic: 'epic-games', prime: 'prime-gaming', gog: 'gog' };

let win = null;
let tray = null;
const store = createStore();
const runner = createRunner();

function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 560,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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

function createTray() {
  const icon = nativeImage.createFromPath(join(ROOT, 'assets', 'tray-icon.ico'));
  tray = new Tray(icon);
  tray.setToolTip('Auto Claimer');
  tray.on('click', () => {
    if (win.isVisible()) win.hide();
    else win.show();
  });
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => win.show() },
    { label: 'Claim Now', click: () => runClaim('tray') },
    { type: 'separator' },
    { label: 'Exit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function specFor(storeName, { show }) {
  return {
    cmd: process.execPath,
    args: [`${SCRIPT_FOR[storeName]}.js`],
    cwd: FGC_DIR,
    env: { ELECTRON_RUN_AS_NODE: '1', SHOW: show ? '1' : '0' },
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
});

async function runClaim(_reason) {
  const enabled = store.get('enabledStores');
  const specs = {};
  for (const s of ['epic', 'prime', 'gog']) {
    if (enabled[s]) specs[s] = specFor(s, { show: false });
  }
  return runner.runAll(specs);
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
    epic: join(FGC_DIR, 'data', 'epic-games.json'),
    prime: join(FGC_DIR, 'data', 'prime-gaming.json'),
    gog: join(FGC_DIR, 'data', 'gog.json'),
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

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', e => e.preventDefault());
