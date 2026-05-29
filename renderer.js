const DEFAULT_HOMEPAGE = 'https://www.google.com';

const elements = {
  backButton: document.getElementById('backButton'),
  forwardButton: document.getElementById('forwardButton'),
  reloadButton: document.getElementById('reloadButton'),
  homeButton: document.getElementById('homeButton'),
  addressBar: document.getElementById('addressBar'),
  goButton: document.getElementById('goButton'),
  loadingSpinner: document.getElementById('loadingSpinner'),
  adBlockToggle: document.getElementById('adBlockToggle'),
  trackingToggle: document.getElementById('trackingToggle'),
  proxyToggle: document.getElementById('proxyToggle'),
  proxyHost: document.getElementById('proxyHost'),
  proxyPort: document.getElementById('proxyPort'),
  applyProxyButton: document.getElementById('applyProxyButton'),
  clearCacheButton: document.getElementById('clearCacheButton'),
  bookmarkButton: document.getElementById('bookmarkButton'),
  bookmarkList: document.getElementById('bookmarkList'),
  statusText: document.getElementById('statusText')
};

const settings = {
  adBlock: localStorage.getItem('adBlockEnabled') !== 'false',
  trackingProtection: localStorage.getItem('trackingProtectionEnabled') !== 'false',
  proxyEnabled: localStorage.getItem('proxyEnabled') === 'true',
  proxyHost: localStorage.getItem('proxyHost') || '',
  proxyPort: localStorage.getItem('proxyPort') || ''
};

let currentUrl = DEFAULT_HOMEPAGE;
let currentTitle = 'Me Browser';
let canGoBack = false;
let canGoForward = false;
let statusTimeoutId;

const getBookmarks = () => {
  try {
    const value = localStorage.getItem('bookmarks');
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
};

const setBookmarks = (bookmarks) => {
  localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
};

const setStatus = (text) => {
  elements.statusText.textContent = text;
  if (statusTimeoutId) {
    window.clearTimeout(statusTimeoutId);
  }
  statusTimeoutId = window.setTimeout(() => {
    if (elements.statusText.textContent === text) {
      elements.statusText.textContent = '';
    }
  }, 2500);
};

const updateNavButtons = () => {
  elements.backButton.disabled = !canGoBack;
  elements.forwardButton.disabled = !canGoForward;
};

const renderBookmarks = () => {
  const bookmarks = getBookmarks();
  elements.bookmarkList.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Bookmarks';
  elements.bookmarkList.appendChild(placeholder);

  bookmarks.forEach((bookmark, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = bookmark.title || bookmark.url;
    elements.bookmarkList.appendChild(option);
  });
};

const saveSettings = () => {
  localStorage.setItem('adBlockEnabled', String(settings.adBlock));
  localStorage.setItem('trackingProtectionEnabled', String(settings.trackingProtection));
  localStorage.setItem('proxyEnabled', String(settings.proxyEnabled));
  localStorage.setItem('proxyHost', settings.proxyHost);
  localStorage.setItem('proxyPort', settings.proxyPort);
};

const applySettingsToUi = () => {
  elements.adBlockToggle.checked = settings.adBlock;
  elements.trackingToggle.checked = settings.trackingProtection;
  elements.proxyToggle.checked = settings.proxyEnabled;
  elements.proxyHost.value = settings.proxyHost;
  elements.proxyPort.value = settings.proxyPort;
};

const pushSettingsToMain = async () => {
  await window.browserAPI.setAdBlock(settings.adBlock);
  await window.browserAPI.setTrackingProtection(settings.trackingProtection);
  await window.browserAPI.setProxy({
    enabled: settings.proxyEnabled,
    host: settings.proxyHost,
    port: settings.proxyPort
  });
};

const navigateToInput = async () => {
  const value = elements.addressBar.value.trim();
  if (!value) {
    return;
  }

  try {
    await window.browserAPI.navigate('go', value);
  } catch {
    setStatus('Navigation failed');
  }
};

elements.backButton.addEventListener('click', () => window.browserAPI.navigate('back'));
elements.forwardButton.addEventListener('click', () => window.browserAPI.navigate('forward'));
elements.reloadButton.addEventListener('click', () => window.browserAPI.navigate('reload'));
elements.homeButton.addEventListener('click', () => window.browserAPI.navigate('home'));
elements.goButton.addEventListener('click', navigateToInput);

elements.addressBar.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    navigateToInput();
  }
});

elements.adBlockToggle.addEventListener('change', async () => {
  settings.adBlock = elements.adBlockToggle.checked;
  saveSettings();
  await window.browserAPI.setAdBlock(settings.adBlock);
});

elements.trackingToggle.addEventListener('change', async () => {
  settings.trackingProtection = elements.trackingToggle.checked;
  saveSettings();
  await window.browserAPI.setTrackingProtection(settings.trackingProtection);
});

elements.applyProxyButton.addEventListener('click', async () => {
  settings.proxyEnabled = elements.proxyToggle.checked;
  settings.proxyHost = elements.proxyHost.value.trim();
  settings.proxyPort = elements.proxyPort.value.trim();
  saveSettings();

  try {
    await window.browserAPI.setProxy({
      enabled: settings.proxyEnabled,
      host: settings.proxyHost,
      port: settings.proxyPort
    });
    setStatus('Proxy settings updated');
  } catch {
    setStatus('Invalid proxy settings');
  }
});

elements.clearCacheButton.addEventListener('click', async () => {
  await window.browserAPI.clearCache();
  setStatus('Cache cleared');
});

elements.bookmarkButton.addEventListener('click', () => {
  const bookmarks = getBookmarks();
  const alreadySaved = bookmarks.some((bookmark) => bookmark.url === currentUrl);
  if (alreadySaved) {
    setStatus('Bookmark already exists');
    return;
  }

  bookmarks.push({ title: currentTitle || currentUrl, url: currentUrl });
  setBookmarks(bookmarks);
  renderBookmarks();
  setStatus('Bookmark added');
});

elements.bookmarkList.addEventListener('change', async () => {
  if (!elements.bookmarkList.value) {
    return;
  }

  const index = Number(elements.bookmarkList.value);
  if (Number.isNaN(index)) {
    return;
  }

  const bookmarks = getBookmarks();
  const bookmark = bookmarks[index];
  if (!bookmark) {
    return;
  }

  elements.addressBar.value = bookmark.url;
  await window.browserAPI.navigate('go', bookmark.url);
  elements.bookmarkList.value = '';
});

window.browserAPI.onBrowserState((state) => {
  currentUrl = state.url || DEFAULT_HOMEPAGE;
  currentTitle = state.title || currentUrl;
  canGoBack = Boolean(state.canGoBack);
  canGoForward = Boolean(state.canGoForward);
  elements.addressBar.value = currentUrl;
  document.title = state.title ? `${state.title} - Me Browser` : 'Me Browser';
  updateNavButtons();
});

window.browserAPI.onLoadingState((loading) => {
  elements.loadingSpinner.classList.toggle('hidden', !loading);
});

window.browserAPI.onDownloadState((download) => {
  setStatus(`Download ${download.state}: ${download.filename}`);
});

applySettingsToUi();
renderBookmarks();
updateNavButtons();
pushSettingsToMain();
