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
  tabsContainer: document.getElementById('tabsContainer'),
  newTabButton: document.getElementById('newTabButton'),
  webViewsContainer: document.getElementById('webViewsContainer'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebar: document.getElementById('sidebar'),
  sidebarClose: document.getElementById('sidebarClose')
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
    return JSON.parse(localStorage.getItem('bookmarks') || '[]');
  } catch {
    return [];
  }
};

const setBookmarks = (bookmarks) => {
  localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
};

const setStatus = (text) => {
  // Status display removed - can add back if needed
};

const toggleSidebar = () => {
  elements.sidebar.classList.toggle('open');
};

const closeSidebar = () => {
  elements.sidebar.classList.remove('open');
};

const switchSidebarTab = (tabName) => {
  document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.sidebar-content').forEach(content => content.classList.remove('active'));
  
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
};

const renderBookmarks = () => {
  const bookmarks = getBookmarks();
  const bookmarksList = document.getElementById('bookmarksList');
  
  if (bookmarks.length === 0) {
    bookmarksList.innerHTML = '<p class="empty-message">No bookmarks</p>';
  } else {
    bookmarksList.innerHTML = bookmarks.map((bookmark, index) => `
      <div class="bookmark-item" data-index="${index}">
        <span class="bookmark-item-title" title="${bookmark.title || bookmark.url}">${bookmark.title || bookmark.url}</span>
        <button class="bookmark-item-delete" title="Delete">×</button>
      </div>
    `).join('');

    bookmarksList.querySelectorAll('.bookmark-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('bookmark-item-delete')) {
          const index = item.dataset.index;
          const bookmark = bookmarks[index];
          elements.addressBar.value = bookmark.url;
          window.browserAPI.navigate('go', bookmark.url);
          closeSidebar();
        }
      });

      item.querySelector('.bookmark-item-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        const index = item.dataset.index;
        const newBookmarks = bookmarks.filter((_, i) => i !== parseInt(index));
        setBookmarks(newBookmarks);
        renderBookmarks();
      });
    });
  }
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

const navigateToInput = async () => {
  const value = elements.addressBar.value.trim();
  if (!value) return;

  const urlToLoad = processInput(value);
  if (!urlToLoad) return;

  try {
    await window.browserAPI.navigate('go', urlToLoad);
  } catch (e) {
    console.error('Navigation error:', e);
  }
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

  tabs.forEach((tab) => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${tab.id === currentTabId ? 'active' : ''}`;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.title = tab.title;
    title.textContent = tab.title;

    const closeButton = document.createElement('button');
    closeButton.className = 'tab-close';
    closeButton.type = 'button';
    closeButton.textContent = '×';

    tabEl.appendChild(title);
    tabEl.appendChild(closeButton);

    tabEl.addEventListener('click', (e) => {
      if (e.target !== closeButton) {
        switchTab(tab.id);
      }
    });

    closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    elements.tabsContainer.appendChild(tabEl);
  });
};

const createNewTab = async () => {
  const tabId = nextTabId++;
  
  const tab = {
    id: tabId,
    title: 'New Tab',
    url: DEFAULT_HOMEPAGE,
    canGoBack: false,
    canGoForward: false
  };
  
  tabs.push(tab);
  await switchTab(tabId);
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
  tabs = tabs.filter((t) => t.id !== tabId);
  
  if (currentTabId === tabId) {
    if (tabs.length > 0) {
      await switchTab(tabs[tabs.length - 1].id);
    } else {
      currentTabId = null;
      await createNewTab();
    }
  } else {
    renderTabs();
  }
  
  await window.browserAPI.closeTab(tabId);
};

// EVENT LISTENERS
if (elements.backButton) elements.backButton.addEventListener('click', () => window.browserAPI.navigate('back'));
if (elements.forwardButton) elements.forwardButton.addEventListener('click', () => window.browserAPI.navigate('forward'));
if (elements.reloadButton) elements.reloadButton.addEventListener('click', () => window.browserAPI.navigate('reload'));
if (elements.homeButton) elements.homeButton.addEventListener('click', () => window.browserAPI.navigate('home'));
if (elements.goButton) elements.goButton.addEventListener('click', navigateToInput);
if (elements.newTabButton) elements.newTabButton.addEventListener('click', createNewTab);

if (elements.addressBar) {
  elements.addressBar.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      navigateToInput();
    }
  });
}

// SIDEBAR
if (elements.sidebarToggle) elements.sidebarToggle.addEventListener('click', toggleSidebar);
if (elements.sidebarClose) elements.sidebarClose.addEventListener('click', closeSidebar);

document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    switchSidebarTab(tab.dataset.tab);
  });
});

// SETTINGS - Ad Block
const adBlockToggle = document.getElementById('adBlockToggle');
if (adBlockToggle) {
  adBlockToggle.checked = settings.adBlock;
  adBlockToggle.addEventListener('change', async () => {
    settings.adBlock = adBlockToggle.checked;
    localStorage.setItem('adBlockEnabled', String(settings.adBlock));
    await window.browserAPI.setAdBlock(settings.adBlock);
  });
}

// SETTINGS - Tracking
const trackingToggle = document.getElementById('trackingToggle');
if (trackingToggle) {
  trackingToggle.checked = settings.trackingProtection;
  trackingToggle.addEventListener('change', async () => {
    settings.trackingProtection = trackingToggle.checked;
    localStorage.setItem('trackingProtectionEnabled', String(settings.trackingProtection));
    await window.browserAPI.setTrackingProtection(settings.trackingProtection);
  });
}

// SETTINGS - Proxy
const proxyToggle = document.getElementById('proxyToggle');
const proxyHost = document.getElementById('proxyHost');
const proxyPort = document.getElementById('proxyPort');
const applyProxyButton = document.getElementById('applyProxyButton');

if (proxyToggle) proxyToggle.checked = settings.proxyEnabled;
if (proxyHost) proxyHost.value = settings.proxyHost;
if (proxyPort) proxyPort.value = settings.proxyPort;

if (applyProxyButton) {
  applyProxyButton.addEventListener('click', async () => {
    settings.proxyEnabled = proxyToggle?.checked || false;
    settings.proxyHost = proxyHost?.value.trim() || '';
    settings.proxyPort = proxyPort?.value.trim() || '';
    
    localStorage.setItem('proxyEnabled', String(settings.proxyEnabled));
    localStorage.setItem('proxyHost', settings.proxyHost);
    localStorage.setItem('proxyPort', settings.proxyPort);

    try {
      await window.browserAPI.setProxy({
        enabled: settings.proxyEnabled,
        host: settings.proxyHost,
        port: settings.proxyPort
      });
    } catch (e) {
      console.error('Proxy error:', e);
    }
  });
}

// SETTINGS - Cache
const clearCacheButton = document.getElementById('clearCacheButton');
if (clearCacheButton) {
  clearCacheButton.addEventListener('click', async () => {
    await window.browserAPI.clearCache();
  });
}

// BOOKMARKS
const bookmarkButton = document.getElementById('bookmarkButton');
if (bookmarkButton) {
  bookmarkButton.addEventListener('click', () => {
    const currentTab = getCurrentTab();
    if (!currentTab) return;
    
    const bookmarks = getBookmarks();
    const alreadySaved = bookmarks.some(b => b.url === currentTab.url);
    if (alreadySaved) return;

    bookmarks.push({ title: currentTab.title || currentTab.url, url: currentTab.url });
    setBookmarks(bookmarks);
    renderBookmarks();
  });
}

// PRIVATE WINDOW
const privateWindowButton = document.getElementById('privateWindowButton');
if (privateWindowButton) {
  privateWindowButton.addEventListener('click', () => {
    window.browserAPI.openPrivateWindow?.();
  });
}

// CLEAR ALL DATA
const clearAllDataButton = document.getElementById('clearAllData');
if (clearAllDataButton) {
  clearAllDataButton.addEventListener('click', () => {
    if (confirm('Clear all browser data? (history, cookies, bookmarks)')) {
      localStorage.clear();
      sessionStorage.clear();
      window.browserAPI.clearCache?.();
      renderBookmarks();
    }
  });
}

// BROWSER STATE
window.browserAPI.onBrowserState?.((state) => {
  const currentTab = getCurrentTab();
  if (!currentTab) return;

  currentTab.url = state.url || DEFAULT_HOMEPAGE;
  currentTab.title = state.title || 'New Tab';
  currentTab.canGoBack = Boolean(state.canGoBack);
  currentTab.canGoForward = Boolean(state.canGoForward);

  document.title = `${state.title} - Me Browser`;
  updateAddressBar();
  updateNavButtons();
  renderTabs();
});

window.browserAPI.onLoadingState?.((loading) => {
  elements.loadingSpinner.classList.toggle('hidden', !loading);
});

window.browserAPI.onDownloadState?.((download) => {
  console.log('Download:', download);
});

// INITIALIZE
renderBookmarks();
createNewTab();
