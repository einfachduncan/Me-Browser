const DEFAULT_HOMEPAGE = 'https://www.google.com';
const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q=';

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
  statusText: document.getElementById('statusText'),
  tabsContainer: document.getElementById('tabsContainer'),
  newTabButton: document.getElementById('newTabButton'),
  webViewsContainer: document.getElementById('webViewsContainer')
};

const settings = {
  adBlock: localStorage.getItem('adBlockEnabled') !== 'false',
  trackingProtection: localStorage.getItem('trackingProtectionEnabled') !== 'false',
  proxyEnabled: localStorage.getItem('proxyEnabled') === 'true',
  proxyHost: localStorage.getItem('proxyHost') || '',
  proxyPort: localStorage.getItem('proxyPort') || ''
};

let tabs = [];
let currentTabId = null;
let statusTimeoutId;
let nextTabId = 1;

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

const processInput = (value) => {
  value = value.trim();
  if (!value) return null;

  if (value.includes('://') || (value.includes('.') && !value.includes(' '))) {
    if (!value.includes('://')) {
      value = 'https://' + value;
    }
    return value;
  }

  return GOOGLE_SEARCH_URL + encodeURIComponent(value);
};

const getCurrentTab = () => tabs.find(t => t.id === currentTabId);

const updateNavButtons = () => {
  const currentTab = getCurrentTab();
  elements.backButton.disabled = !currentTab || !currentTab.canGoBack;
  elements.forwardButton.disabled = !currentTab || !currentTab.canGoForward;
};

const updateAddressBar = () => {
  const currentTab = getCurrentTab();
  elements.addressBar.value = currentTab ? currentTab.url : DEFAULT_HOMEPAGE;
};

const renderTabs = () => {
  elements.tabsContainer.innerHTML = '';
  tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${tab.id === currentTabId ? 'active' : ''}`;
    tabEl.innerHTML = `
      <span class="tab-title" title="${tab.title}">${tab.title}</span>
      <button class="tab-close">×</button>
    `;
    
    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        switchTab(tab.id);
      }
    });
    
    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    
    elements.tabsContainer.appendChild(tabEl);
  });
};

const createNewTab = async () => {
  const tabId = currentTabId + nextTabId;
  nextTabId++;
  
  const tab = {
    id: tabId,
    title: 'New Tab',
    url: DEFAULT_HOMEPAGE,
    canGoBack: false,
    canGoForward: false
  };
  
  tabs.push(tab);
  switchTab(tabId);
  renderTabs();
  
  await window.browserAPI.createTab(tabId);
};

const switchTab = async (tabId) => {
  currentTabId = tabId;
  await window.browserAPI.switchTab(tabId);
  updateAddressBar();
  updateNavButtons();
  renderTabs();
};

const closeTab = async (tabId) => {
  tabs = tabs.filter(t => t.id !== tabId);
  
  if (currentTabId === tabId) {
    if (tabs.length > 0) {
      switchTab(tabs[tabs.length - 1].id);
    } else {
      currentTabId = null;
      await createNewTab();
    }
  } else {
    renderTabs();
  }
  
  await window.browserAPI.closeTab(tabId);
};

const navigateToInput = async () => {
  const value = elements.addressBar.value.trim();
  if (!value) return;

  const urlToLoad = processInput(value);
  if (!urlToLoad) return;

  try {
    await window.browserAPI.navigate(currentTabId, 'go', urlToLoad);
  } catch {
    setStatus('Navigation failed');
  }
};

elements.backButton.addEventListener('click', () => window.browserAPI.navigate(currentTabId, 'back'));
elements.forwardButton.addEventListener('click', () => window.browserAPI.navigate(currentTabId, 'forward'));
elements.reloadButton.addEventListener('click', () => window.browserAPI.navigate(currentTabId, 'reload'));
elements.homeButton.addEventListener('click', () => window.browserAPI.navigate(currentTabId, 'home'));
elements.goButton.addEventListener('click', navigateToInput);
elements.newTabButton.addEventListener('click', createNewTab);

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
  const currentTab = getCurrentTab();
  if (!currentTab) return;
  
  const bookmarks = getBookmarks();
  const alreadySaved = bookmarks.some((bookmark) => bookmark.url === currentTab.url);
  if (alreadySaved) {
    setStatus('Bookmark already exists');
    return;
  }

  bookmarks.push({ title: currentTab.title || currentTab.url, url: currentTab.url });
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
  await window.browserAPI.navigate(currentTabId, 'go', bookmark.url);
  elements.bookmarkList.value = '';
});

window.browserAPI.onBrowserState((tabId, state) => {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  tab.url = state.url || DEFAULT_HOMEPAGE;
  tab.title = state.title || 'New Tab';
  tab.canGoBack = Boolean(state.canGoBack);
  tab.canGoForward = Boolean(state.canGoForward);
  
  document.title = `${tab.title} - Me Browser`;
  
  if (tabId === currentTabId) {
    updateAddressBar();
    updateNavButtons();
  }
  
  renderTabs();
});

window.browserAPI.onLoadingState((tabId, loading) => {
  elements.loadingSpinner.classList.toggle('hidden', !loading);
});

window.browserAPI.onDownloadState((download) => {
  setStatus(`Download ${download.state}: ${download.filename}`);
});

applySettingsToUi();
renderBookmarks();
pushSettingsToMain();
createNewTab();
