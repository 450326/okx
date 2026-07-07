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
