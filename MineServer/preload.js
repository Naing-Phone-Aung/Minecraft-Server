const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Server management
  checkServerInstalled: () => ipcRenderer.invoke('check-server-installed'),
  downloadServer: () => ipcRenderer.invoke('download-server'),
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  sendCommand: (command) => ipcRenderer.invoke('send-command', command),
  
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Network
  checkNetwork: () => ipcRenderer.invoke('check-network'),
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  
  // File system
  openServerFolder: () => ipcRenderer.invoke('open-server-folder'),
  
  // Event listeners
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  onServerLog: (callback) => {
    ipcRenderer.on('server-log', (event, data) => callback(data));
  },
  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (event, status) => callback(status));
  }
});