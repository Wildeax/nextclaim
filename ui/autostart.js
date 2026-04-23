import { app } from 'electron';

export function setAutostart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: [],
  });
}

export function isAutostartEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}
