const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisAPI', {
  quit: () => ipcRenderer.invoke('app:quit'),
  getVersion: () => process.versions.electron,
});
