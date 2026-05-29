const { contextBridge, ipcRenderer } = require('electron');

const worlds = new Set();
const listeners = new Map();

const addMessageListener = (extensionId, channel, callback) => {
  const key = `${extensionId}:${channel}`;
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(callback);
  return () => listeners.get(key)?.delete(callback);
};

const invoke = (extensionId, method, ...args) => ipcRenderer.invoke('extensions:api:call', {
  extensionId,
  method,
  args
});

const createApi = (descriptor) => ({
  tabs: {
    query: () => invoke(descriptor.id, 'tabs.query'),
    executeScript: (details = {}) => invoke(descriptor.id, 'tabs.executeScript', details)
  },
  storage: {
    local: {
      get: (query) => invoke(descriptor.id, 'storage.get', query),
      set: (payload = {}) => invoke(descriptor.id, 'storage.set', payload)
    }
  },
  messaging: {
    send: (channel, payload) => invoke(descriptor.id, 'messaging.send', channel, payload),
    receive: (channel, callback) => addMessageListener(descriptor.id, channel, callback)
  },
  page: {
    inject: (details = {}) => invoke(descriptor.id, 'page.inject', details)
  },
  notifications: {
    create: (details = {}) => invoke(descriptor.id, 'notifications.create', details)
  },
  webRequest: {
    onBeforeRequest: (details = {}) => invoke(descriptor.id, 'webRequest.onBeforeRequest', details)
  },
  cookieStore: {
    getAll: (details = {}) => invoke(descriptor.id, 'cookieStore.getAll', details),
    remove: (details = {}) => invoke(descriptor.id, 'cookieStore.remove', details)
  }
});

ipcRenderer.on('extensions:bootstrap', (_event, descriptors = []) => {
  descriptors.forEach((descriptor) => {
    if (worlds.has(descriptor.worldId)) {
      return;
    }

    worlds.add(descriptor.worldId);
    contextBridge.exposeInIsolatedWorld(descriptor.worldId, 'browser', createApi(descriptor));
    contextBridge.exposeInIsolatedWorld(descriptor.worldId, 'extension', descriptor.manifest);
  });
});

ipcRenderer.on('extensions:message', (_event, payload) => {
  const key = `${payload.extensionId}:${payload.channel}`;
  for (const listener of listeners.get(key) || []) {
    try {
      listener(payload.payload);
    } catch (error) {
      console.error('Extension message listener failed', error);
    }
  }
});
