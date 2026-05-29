const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
  navigate: (tabId, action, url = '') => ipcRenderer.invoke('browser:navigate', tabId, action, url),
  createTab: (tabId) => ipcRenderer.invoke('browser:createTab', tabId),
  switchTab: (tabId) => ipcRenderer.invoke('browser:switchTab', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('browser:closeTab', tabId),
  setAdBlock: (enabled) => ipcRenderer.invoke('browser:setAdBlock', enabled),
  setProxy: (settings) => ipcRenderer.invoke('browser:setProxy', settings),
  setTrackingProtection: (enabled) => ipcRenderer.invoke('browser:setTrackingProtection', enabled),
  clearCache: () => ipcRenderer.invoke('browser:clearCache'),
  openPrivateWindow: () => ipcRenderer.invoke('browser:openPrivateWindow'),
  listExtensions: () => ipcRenderer.invoke('browser:extensions:list'),
  getExtensionDetails: (extensionId) => ipcRenderer.invoke('browser:extensions:details', extensionId),
  toggleExtension: (extensionId, enabled) => ipcRenderer.invoke('browser:extensions:toggle', extensionId, enabled),
  installBundledExtension: (extensionId) => ipcRenderer.invoke('browser:extensions:install-bundled', extensionId),
  installExtensionZip: () => ipcRenderer.invoke('browser:extensions:install-zip'),
  removeExtension: (extensionId) => ipcRenderer.invoke('browser:extensions:remove', extensionId),
  saveExtensionSettings: (extensionId, nextSettings) => ipcRenderer.invoke('browser:extensions:save-settings', extensionId, nextSettings),
  runExtensionAction: (extensionId, actionId) => ipcRenderer.invoke('browser:extensions:run-action', extensionId, actionId),
  onBrowserState: (callback) => {
    const listener = (_event, tabId, payload) => callback(tabId, payload);
    ipcRenderer.on('browser:state', listener);
    return () => ipcRenderer.removeListener('browser:state', listener);
  },
  onLoadingState: (callback) => {
    const listener = (_event, tabId, loading) => callback(tabId, loading);
    ipcRenderer.on('browser:loading', listener);
    return () => ipcRenderer.removeListener('browser:loading', listener);
  },
  onDownloadState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('browser:download', listener);
    return () => ipcRenderer.removeListener('browser:download', listener);
  }
});
