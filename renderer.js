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
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebar: document.getElementById('sidebar'),
  sidebarClose: document.getElementById('sidebarClose'),
  webViewsContainer: document.getElementById('webViewsContainer'),
  statusText: document.getElementById('statusText'),
  adBlockToggle: document.getElementById('adBlockToggle'),
  trackingToggle: document.getElementById('trackingToggle'),
  proxyToggle: document.getElementById('proxyToggle'),
  proxyHost: document.getElementById('proxyHost'),
  proxyPort: document.getElementById('proxyPort'),
  applyProxyButton: document.getElementById('applyProxyButton'),
  clearCacheButton: document.getElementById('clearCacheButton'),
  bookmarkButton: document.getElementById('bookmarkButton'),
  bookmarkList: document.getElementById('bookmarkList')
};

const sidebarElements = {
  tabs: document.querySelectorAll('.sidebar-tab'),
  contents: document.querySelectorAll('.sidebar-content'),
  adBlockToggle: document.getElementById('adBlockToggleSidebar'),
  trackingToggle: document.getElementById('trackingToggleSidebar'),
  proxyToggle: document.getElementById('proxyToggleSidebar'),
  proxyHost: document.getElementById('proxyHostSidebar'),
  proxyPort: document.getElementById('proxyPortSidebar'),
  applyProxyButton: document.getElementById('applyProxySidebar'),
  clearCacheButton: document.getElementById('clearCacheSidebar'),
  extensionsList: document.getElementById('extensionsList'),
  bookmarksList: document.getElementById('bookmarksList'),
  clearAllDataButton: document.getElementById('clearAllData')
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

// SIDEBAR FUNCTIONS
const toggleSidebar = () => {
  elements.sidebar.classList.toggle('open');
};

const closeSidebar = () => {
  elements.sidebar.classList.remove('open');
};

const switchSidebarTab = (tabName) => {
  sidebarElements.tabs.forEach(tab => tab.classList.remove('active'));
  sidebarElements.contents.forEach(content => content.classList.remove('active'));
  
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
};

// BOOKMARK FUNCTIONS
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

const renderBookmarks = () => {
  const bookmarks = getBookmarks();
  
  // Main dropdown
  if (elements.bookmarkList) {
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
  }
  
  // Sidebar list
  if (sidebarElements.bookmarksList) {
    if (bookmarks.length === 0) {
      sidebarElements.bookmarksList.innerHTML = '<p class="empty-message">No bookmarks</p>';
    } else {
      sidebarElements.bookmarksList.innerHTML = bookmarks.map((bookmark, index) => `
        <div class="bookmark-item" data-index="${index}">
          <span class="bookmark-item-title" title="${bookmark.title || bookmark.url}">${bookmark.title || bookmark.url}</span>
          <button class="bookmark-item-delete" title="Delete">×</button>
        </div>
      `).join('');

      // Bookmark click handlers
      sidebarElements.bookmarksList.querySelectorAll('.bookmark-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (!e.target.classList.contains('bookmark-item-delete')) {
            const index = item.dataset.index;
            const bookmark = bookmarks[index];
            if (elements.addressBar) elements.addressBar.value = bookmark.url;
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
  }
};

const setStatus = (text) => {
  if (elements.statusText) {
    elements.statusText.textContent = text;
    if (statusTimeoutId) {
      window.clearTimeout(statusTimeoutId);
    }
    statusTimeoutId = window.setTimeout(() => {
      if (elements.statusText && elements.statusText.textContent === text) {
        elements.statusText.textContent = '';
      }
    }, 2500);
  }
};

const updateNavButtons = () => {
  if (elements.backButton) elements.backButton.disabled = !canGoBack;
  if (elements.forwardButton) elements.forwardButton.disabled = !canGoForward;
};

const saveSettings = () => {
  localStorage.setItem('adBlockEnabled', String(settings.adBlock));
  localStorage.setItem('trackingProtectionEnabled', String(settings.trackingProtection));
  localStorage.setItem('proxyEnabled', String(settings.proxyEnabled));
  localStorage.setItem('proxyHost', settings.proxyHost);
  localStorage.setItem('proxyPort', settings.proxyPort);
};

const applySettingsToUi = () => {
  // Main toolbar
  if (elements.adBlockToggle) elements.adBlockToggle.checked = settings.adBlock;
  if (elements.trackingToggle) elements.trackingToggle.checked = settings.trackingProtection;
  if (elements.proxyToggle) elements.proxyToggle.checked = settings.proxyEnabled;
  if (elements.proxyHost) elements.proxyHost.value = settings.proxyHost;
  if (elements.proxyPort) elements.proxyPort.value = settings.proxyPort;
  
  // Sidebar
  if (sidebarElements.adBlockToggle) sidebarElements.adBlockToggle.checked = settings.adBlock;
  if (sidebarElements.trackingToggle) sidebarElements.trackingToggle.checked = settings.trackingProtection;
  if (sidebarElements.proxyToggle) sidebarElements.proxyToggle.checked = settings.proxyEnabled;
  if (sidebarElements.proxyHost) sidebarElements.proxyHost.value = settings.proxyHost;
  if (sidebarElements.proxyPort) sidebarElements.proxyPort.value = settings.proxyPort;
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

const navigateToInput = async () => {
  const value = elements.addressBar.value.trim();
  if (!value) return;

  const urlToLoad = processInput(value);
  if (!urlToLoad) return;

  try {
    await window.browserAPI.navigate('go', urlToLoad);
  } catch {
    setStatus('Navigation failed');
  }
};

// EVENT LISTENERS - SIDEBAR
if (elements.sidebarToggle) elements.sidebarToggle.addEventListener('click', toggleSidebar);
if (elements.sidebarClose) elements.sidebarClose.addEventListener('click', closeSidebar);

sidebarElements.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    switchSidebarTab(tab.dataset.tab);
  });
});

// EVENT LISTENERS - MAIN TOOLBAR
if (elements.backButton) elements.backButton.addEventListener('click', () => window.browserAPI.navigate('back'));
if (elements.forwardButton) elements.forwardButton.addEventListener('click', () => window.browserAPI.navigate('forward'));
if (elements.reloadButton) elements.reloadButton.addEventListener('click', () => window.browserAPI.navigate('reload'));
if (elements.homeButton) elements.homeButton.addEventListener('click', () => window.browserAPI.navigate('home'));
if (elements.goButton) elements.goButton.addEventListener('click', navigateToInput);

if (elements.addressBar) {
  elements.addressBar.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      navigateToInput();
    }
  });
}

// SETTINGS - MAIN TOOLBAR
if (elements.adBlockToggle) {
  elements.adBlockToggle.addEventListener('change', async () => {
    settings.adBlock = elements.adBlockToggle.checked;
    saveSettings();
    if (sidebarElements.adBlockToggle) sidebarElements.adBlockToggle.checked = settings.adBlock;
    await window.browserAPI.setAdBlock(settings.adBlock);
  });
}

if (elements.trackingToggle) {
  elements.trackingToggle.addEventListener('change', async () => {
    settings.trackingProtection = elements.trackingToggle.checked;
    saveSettings();
    if (sidebarElements.trackingToggle) sidebarElements.trackingToggle.checked = settings.trackingProtection;
    await window.browserAPI.setTrackingProtection(settings.trackingProtection);
  });
}

if (elements.applyProxyButton) {
  elements.applyProxyButton.addEventListener('click', async () => {
    settings.proxyEnabled = elements.proxyToggle.checked;
    settings.proxyHost = elements.proxyHost.value.trim();
    settings.proxyPort = elements.proxyPort.value.trim();
    saveSettings();

    if (sidebarElements.proxyToggle) sidebarElements.proxyToggle.checked = settings.proxyEnabled;
    if (sidebarElements.proxyHost) sidebarElements.proxyHost.value = settings.proxyHost;
    if (sidebarElements.proxyPort) sidebarElements.proxyPort.value = settings.proxyPort;

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
}

if (elements.clearCacheButton) {
  elements.clearCacheButton.addEventListener('click', async () => {
    await window.browserAPI.clearCache();
    setStatus('Cache cleared');
  });
}

// SETTINGS - SIDEBAR
if (sidebarElements.adBlockToggle) {
  sidebarElements.adBlockToggle.addEventListener('change', async () => {
    settings.adBlock = sidebarElements.adBlockToggle.checked;
    saveSettings();
    if (elements.adBlockToggle) elements.adBlockToggle.checked = settings.adBlock;
    await window.browserAPI.setAdBlock(settings.adBlock);
  });
}

if (sidebarElements.trackingToggle) {
  sidebarElements.trackingToggle.addEventListener('change', async () => {
    settings.trackingProtection = sidebarElements.trackingToggle.checked;
    saveSettings();
    if (elements.trackingToggle) elements.trackingToggle.checked = settings.trackingProtection;
    await window.browserAPI.setTrackingProtection(settings.trackingProtection);
  });
}

if (sidebarElements.applyProxyButton) {
  sidebarElements.applyProxyButton.addEventListener('click', async () => {
    settings.proxyEnabled = sidebarElements.proxyToggle.checked;
    settings.proxyHost = sidebarElements.proxyHost.value.trim();
    settings.proxyPort = sidebarElements.proxyPort.value.trim();
    saveSettings();

    if (elements.proxyToggle) elements.proxyToggle.checked = settings.proxyEnabled;
    if (elements.proxyHost) elements.proxyHost.value = settings.proxyHost;
    if (elements.proxyPort) elements.proxyPort.value = settings.proxyPort;

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
}

if (sidebarElements.clearCacheButton) {
  sidebarElements.clearCacheButton.addEventListener('click', async () => {
    await window.browserAPI.clearCache();
    setStatus('Cache cleared');
  });
}

if (sidebarElements.clearAllDataButton) {
  sidebarElements.clearAllDataButton.addEventListener('click', async () => {
    if (confirm('Are you sure? This will clear all browser data including history, cookies, and bookmarks.')) {
      localStorage.clear();
      sessionStorage.clear();
      await window.browserAPI.clearCache();
      setStatus('All data cleared');
      renderBookmarks();
    }
  });
}

// BOOKMARKS
if (elements.bookmarkButton) {
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
}

if (elements.bookmarkList) {
  elements.bookmarkList.addEventListener('change', async () => {
    if (!elements.bookmarkList.value) return;

    const index = Number(elements.bookmarkList.value);
    if (Number.isNaN(index)) return;

    const bookmarks = getBookmarks();
    const bookmark = bookmarks[index];
    if (!bookmark) return;

    elements.addressBar.value = bookmark.url;
    await window.browserAPI.navigate('go', bookmark.url);
    elements.bookmarkList.value = '';
  });
}

// BROWSER STATE UPDATES
window.browserAPI.onBrowserState((state) => {
  currentUrl = state.url || DEFAULT_HOMEPAGE;
  currentTitle = state.title || currentUrl;
  canGoBack = Boolean(state.canGoBack);
  canGoForward = Boolean(state.canGoForward);
  if (elements.addressBar) elements.addressBar.value = currentUrl;
  document.title = state.title ? `${state.title} - Me Browser` : 'Me Browser';
  updateNavButtons();
});

window.browserAPI.onLoadingState((loading) => {
  if (elements.loadingSpinner) {
    elements.loadingSpinner.classList.toggle('hidden', !loading);
  }
});

window.browserAPI.onDownloadState((download) => {
  setStatus(`Download ${download.state}: ${download.filename}`);
});

// INITIALIZE
applySettingsToUi();
renderBookmarks();
updateNavButtons();
pushSettingsToMain();
