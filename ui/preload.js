import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ping'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  runAll: () => ipcRenderer.invoke('run-all'),
  login: store => ipcRenderer.invoke('login', store),
  saveSettings: settings => ipcRenderer.invoke('save-settings', settings),
  completeFirstRun: () => ipcRenderer.invoke('complete-first-run'),
  onRunLine: cb => ipcRenderer.on('run:line', (_e, payload) => cb(payload)),
  onRunStart: cb => ipcRenderer.on('run:start', (_e, payload) => cb(payload)),
  onRunEnd: cb => ipcRenderer.on('run:end', (_e, payload) => cb(payload)),
});
