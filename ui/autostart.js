import { app } from 'electron';

// In dev mode (`npm start` / `electron .`) `process.execPath` points to
// `node_modules/electron/dist/electron.exe`. If we register that as the Windows
// login item, the next boot launches Electron's default landing window instead
// of NextClaim. So: only ever touch login items when packaged. In dev we also
// proactively clear our entry, in case a previous dev run left a bogus one
// (the registry value is keyed on app name, so a packaged install will rewrite
// it to the correct path on its next launch).
export function setAutostart(enabled) {
  if (!app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: false });
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: [],
  });
}

export function isAutostartEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}
