const path = require('path');
const { app, BrowserWindow, BrowserView, ipcMain, shell, session } = require('electron');

const HOMEPAGE = 'https://www.google.com';
const TOOLBAR_HEIGHT = 130;

let mainWindow;
let browserViews = new Map();
let currentTabId = null;
let adBlockEnabled = true;
let trackingProtectionEnabled = true;
let proxySettings = {
  enabled: false,
  host: '',
  port: ''
};

// Ad blocker filter list
const AD_FILTERS = [
  '*doubleclick*',
  '*googlesyndication*',
  '*ads*',
  '*advertisement*',
  '*adservice*',
  '*adserver*',
  '*adnetwork*',
  '*tracking*',
  '*analytics*',
  '*facebook.com/tr*',
  '*stats*',
  '*beacon*',
  '*crashlytics*'
];

const shouldBlockByFilter = (requestUrl) => {
  if (!adBlockEnabled || !requestUrl) {
    return false;
  }

  const loweredUrl = requestUrl.toLowerCase();
  return AD_FILTERS.some((filter) => {
    const pattern = filter.toLowerCase().replace(/\*/g, '');
    return pattern && loweredUrl.includes(pattern);
  });
};

const isThirdPartyRequest = (requestUrl, initiator) => {
  if (!initiator || initiator === 'null') {
    return false;
  }

  try {
    const requestHost = new URL(requestUrl).hostname;
    const initiatorHost = new URL(initiator).hostname;
    return requestHost !== initiatorHost;
  } catch {
    return false;
  }
};

const applyProxySettings = async () => {
  const ses = session.defaultSession;
  if (proxySettings.enabled && proxySettings.host && proxySettings.port) {
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http://${proxySettings.host}:${proxySettings.port};https://${proxySettings.host}:${proxySettings.port}`
    });
  } else {
    await ses.setProxy({ mode: 'direct' });
  }

  ses.closeAllConnections();
};

const isValidProxyHost = (host) =>
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(host);
const isValidProxyPort = (port) => /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;

const updateBrowserViewBounds = () => {
  if (!mainWindow) return;
  const [width, height] = mainWindow.getContentSize();
  
  browserViews.forEach((view) => {
    view.setBounds({
      x: 0,
      y: TOOLBAR_HEIGHT,
      width,
      height: Math.max(0, height - TOOLBAR_HEIGHT)
    });
  });
};

const sendBrowserState = (tabId) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const view = browserViews.get(tabId);
  if (!view) return;

  mainWindow.webContents.send('browser:state', tabId, {
    url: view.webContents.getURL() || HOMEPAGE,
    canGoBack: view.webContents.canGoBack(),
    canGoForward: view.webContents.canGoForward(),
    title: view.webContents.getTitle() || 'New Tab'
  });
};

const notifyLoading = (isLoading) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('browser:loading', currentTabId, isLoading);
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    backgroundColor: '#0f1116',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.on('resize', updateBrowserViewBounds);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const ses = session.defaultSession;
  
  // Ad blocker
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    callback({ cancel: shouldBlockByFilter(details.url) });
  });

  // Tracking protection & DNT header
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders, DNT: '1' };

    if (trackingProtectionEnabled && isThirdPartyRequest(details.url, details.initiator)) {
      for (const headerName of Object.keys(requestHeaders)) {
        if (headerName.toLowerCase() === 'cookie') {
          delete requestHeaders[headerName];
        }
      }
    }

    callback({ requestHeaders });
  });

  // Download handler
  ses.on('will-download', (event, item) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.webContents.send('browser:download', {
      filename: item.getFilename(),
      state: 'started'
    });

    item.once('done', (_e, state) => {
      mainWindow.webContents.send('browser:download', {
        filename: item.getFilename(),
        state
      });
    });
  });

  await applyProxySettings();
  await mainWindow.loadFile(path.join(__dirname, 'index.html'));
};

// Tab management
ipcMain.handle('browser:createTab', async (_event, tabId) => {
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.addBrowserView(view);
  browserViews.set(tabId, view);
  
  view.webContents.loadURL(HOMEPAGE);
  
  view.webContents.on('did-start-loading', () => notifyLoading(true));
  view.webContents.on('did-stop-loading', () => {
    notifyLoading(false);
    sendBrowserState(tabId);
  });

  view.webContents.on('did-navigate', () => sendBrowserState(tabId));
  view.webContents.on('did-navigate-in-page', () => sendBrowserState(tabId));
  view.webContents.on('page-title-updated', () => sendBrowserState(tabId));
  
  updateBrowserViewBounds();
});

ipcMain.handle('browser:switchTab', async (_event, tabId) => {
  currentTabId = tabId;
  
  browserViews.forEach((view, id) => {
    if (id === tabId) {
      mainWindow.setTopBrowserView(view);
      view.webContents.focus();
    }
  });
  
  sendBrowserState(tabId);
});

ipcMain.handle('browser:closeTab', async (_event, tabId) => {
  const view = browserViews.get(tabId);
  if (view) {
    mainWindow.removeBrowserView(view);
    browserViews.delete(tabId);
  }
});

// Navigation
ipcMain.handle('browser:navigate', async (_event, tabId, action, url) => {
  const view = browserViews.get(tabId);
  if (!view) return;

  switch (action) {
    case 'back':
      if (view.webContents.canGoBack()) {
        view.webContents.goBack();
      }
      break;
    case 'forward':
      if (view.webContents.canGoForward()) {
        view.webContents.goForward();
      }
      break;
    case 'reload':
      view.webContents.reload();
      break;
    case 'home':
      await view.webContents.loadURL(HOMEPAGE);
      break;
    case 'go':
      if (url && typeof url === 'string') {
        await view.webContents.loadURL(url);
      }
      break;
  }
});

// Settings
ipcMain.handle('browser:setAdBlock', (_event, enabled) => {
  adBlockEnabled = Boolean(enabled);
  return adBlockEnabled;
});

ipcMain.handle('browser:setTrackingProtection', (_event, enabled) => {
  trackingProtectionEnabled = Boolean(enabled);
  return trackingProtectionEnabled;
});

ipcMain.handle('browser:setProxy', async (_event, payload = {}) => {
  const host = String(payload.host || '').trim();
  const port = String(payload.port || '').trim();
  const enabled = Boolean(payload.enabled);

  if (enabled && (!isValidProxyHost(host) || !isValidProxyPort(port))) {
    throw new Error('Invalid proxy host or port');
  }

  proxySettings = {
    enabled,
    host,
    port
  };

  await applyProxySettings();
  return proxySettings;
});

ipcMain.handle('browser:clearCache', async () => {
  const ses = session.defaultSession;
  await ses.clearCache();
  await ses.clearStorageData({ storages: ['cookies'] });
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
