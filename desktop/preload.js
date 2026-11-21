const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_event, percent) => callback(percent));
  },
  skipUpdate: () => ipcRenderer.send('update-skip'),
  downloadUpdate: () => ipcRenderer.send('update-download'),
  installUpdate: () => ipcRenderer.send('update-install'),
});

// 后端启停控制（托盘与应用内状态条共用）
contextBridge.exposeInMainWorld('desktopBackend', {
  getStatus: () => ipcRenderer.invoke('backend:status'),
  start: () => ipcRenderer.invoke('backend:start'),
  pause: () => ipcRenderer.invoke('backend:pause'),
  restart: () => ipcRenderer.invoke('backend:restart'),
  onStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('backend:status', handler);
    return () => ipcRenderer.removeListener('backend:status', handler);
  },
});
