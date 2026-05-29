const path = require('path');
const { app, BrowserWindow, BrowserView, ipcMain, shell, session } = require('electron');
const filters = require('./filters.json');

const HOMEPAGE = 'https://www.google.com';
const TOP_BAR_HEIGHT = 104;

let mainWindow;
let browserView;
let adBlockEnabled = true;
let trackingProtectionEnabled = true;
let proxySettings = {
  enabled: false,
  host: '',
  port: ''
};
const adFilters = Array.isArray(filters) ? filters.filter((entry) => typeof entry === 'string') : [];

const sanitizeUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return HOMEPAGE;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return HOMEPAGE;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

const updateBrowserBounds = () => {
  if (!mainWindow || !browserView) {
    return;
  }

  const [width, height] = mainWindow.getContentSize();
  browserView.setBounds({
    x: 0,
    y: TOP_BAR_HEIGHT,
    width,
    height: Math.max(0, height - TOP_BAR_HEIGHT)
  });
  browserView.setAutoResize({ width: true, height: true });
};

const sendBrowserState = () => {
  if (!mainWindow || mainWindow.isDestroyed() || !browserView) {
    return;
  }

  mainWindow.webContents.send('browser:state', {
    url: browserView.webContents.getURL() || HOMEPAGE,
    canGoBack: browserView.webContents.canGoBack(),
    canGoForward: browserView.webContents.canGoForward(),
    title: browserView.webContents.getTitle() || 'Me Browser'
  });
};

const notifyLoading = (isLoading) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('browser:loading', isLoading);
};

const shouldBlockByFilter = (requestUrl) => {
  if (!adBlockEnabled || !requestUrl) {
    return false;
  }

  const loweredUrl = requestUrl.toLowerCase();
  return adFilters.some((filter) => {
    const normalized = filter.toLowerCase().replaceAll('*', '');
    return normalized && loweredUrl.includes(normalized);
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

const isValidProxyHost = (host) => /^[a-zA-Z0-9.-]+$/.test(host);
const isValidProxyPort = (port) => /^\d{2,5}$/.test(port) && Number(port) <= 65535;

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

  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.setBrowserView(browserView);
  updateBrowserBounds();

  mainWindow.on('resize', updateBrowserBounds);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  browserView.webContents.on('did-start-loading', () => notifyLoading(true));
  browserView.webContents.on('did-stop-loading', () => {
    notifyLoading(false);
    sendBrowserState();
  });

  browserView.webContents.on('did-navigate', sendBrowserState);
  browserView.webContents.on('did-navigate-in-page', sendBrowserState);
  browserView.webContents.on('page-title-updated', sendBrowserState);

  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    callback({ cancel: shouldBlockByFilter(details.url) });
  });

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

  ses.on('will-download', (event, item) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

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
  await browserView.webContents.loadURL(HOMEPAGE);
};

ipcMain.handle('browser:navigate', async (_event, payload = {}) => {
  if (!browserView) {
    return;
  }

  const { action, url } = payload;

  switch (action) {
    case 'back':
      if (browserView.webContents.canGoBack()) {
        browserView.webContents.goBack();
      }
      break;
    case 'forward':
      if (browserView.webContents.canGoForward()) {
        browserView.webContents.goForward();
      }
      break;
    case 'reload':
      browserView.webContents.reload();
      break;
    case 'home':
      await browserView.webContents.loadURL(HOMEPAGE);
      break;
    case 'go':
      await browserView.webContents.loadURL(sanitizeUrl(url));
      break;
    default:
      break;
  }
});

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
