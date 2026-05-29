const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
  navigate: (tabId, action, url = '') => ipcRenderer.invoke('private:navigate', tabId, action, url),
  createTab: (tabId) => ipcRenderer.invoke('private:createTab', tabId),
  switchTab: (tabId) => ipcRenderer.invoke('private:switchTab', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('private:closeTab', tabId),
  setAdBlock: () => Promise.resolve(true),
  setProxy: () => Promise.resolve({}),
  setTrackingProtection: () => Promise.resolve(true),
  clearCache: () => Promise.resolve(true),
  onBrowserState: (callback) => {
    const listener = (_event, tabId, payload) => callback(tabId, payload);
    ipcRenderer.on('private:state', listener);
    return () => ipcRenderer.removeListener('private:state', listener);
  },
  onLoadingState: (callback) => {
    const listener = (_event, tabId, loading) => callback(tabId, loading);
    ipcRenderer.on('private:loading', listener);
    return () => ipcRenderer.removeListener('private:loading', listener);
  },
  onDownloadState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('private:download', listener);
    return () => ipcRenderer.removeListener('private:download', listener);
  }
});
