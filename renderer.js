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
  privateWindowButton: document.getElementById('privateWindowButton'),
  extensionsButton: document.getElementById('extensionsButton'),
  tabsContainer: document.getElementById('tabsContainer'),
  newTabButton: document.getElementById('newTabButton'),
  webViewsContainer: document.getElementById('webViewsContainer'),
  extensionsModal: document.getElementById('extensionsModal'),
  closeExtensionsButton: document.getElementById('closeExtensionsButton'),
  installZipButton: document.getElementById('installZipButton'),
  installedExtensionsList: document.getElementById('installedExtensionsList'),
  marketplaceExtensionsList: document.getElementById('marketplaceExtensionsList'),
  extensionDetailName: document.getElementById('extensionDetailName'),
  extensionDetailMeta: document.getElementById('extensionDetailMeta'),
  extensionDetailPermissions: document.getElementById('extensionDetailPermissions'),
  extensionDetailStats: document.getElementById('extensionDetailStats'),
  extensionSettingsFrame: document.getElementById('extensionSettingsFrame'),
  extensionSettingsEditor: document.getElementById('extensionSettingsEditor'),
  saveExtensionSettingsButton: document.getElementById('saveExtensionSettingsButton'),
  extensionActions: document.getElementById('extensionActions')
};

const settings = {
  adBlock: localStorage.getItem('adBlockEnabled') !== 'false',
  trackingProtection: localStorage.getItem('trackingProtectionEnabled') !== 'false',
  proxyEnabled: localStorage.getItem('proxyEnabled') === 'true',
  proxyHost: localStorage.getItem('proxyHost') || '',
  proxyPort: localStorage.getItem('proxyPort') || ''
};

const extensionState = {
  installed: [],
  marketplace: [],
  selectedId: null,
  selectedDetails: null
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

const saveExtensionToggleState = () => {
  const extensionStates = extensionState.installed.reduce((result, extension) => ({
    ...result,
    [extension.id]: extension.enabled
  }), {});
  localStorage.setItem('extensionEnabledStates', JSON.stringify(extensionStates));
};

const setStatus = (text) => {
  if (!elements.statusText) return;
  elements.statusText.textContent = text;
  if (statusTimeoutId) {
    window.clearTimeout(statusTimeoutId);
  }
  statusTimeoutId = window.setTimeout(() => {
    if (elements.statusText && elements.statusText.textContent === text) {
      elements.statusText.textContent = '';
    }
  }, 2500);
};

const renderBookmarks = () => {
  if (!elements.bookmarkList) return;
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
  if (elements.adBlockToggle) elements.adBlockToggle.checked = settings.adBlock;
  if (elements.trackingToggle) elements.trackingToggle.checked = settings.trackingProtection;
  if (elements.proxyToggle) elements.proxyToggle.checked = settings.proxyEnabled;
  if (elements.proxyHost) elements.proxyHost.value = settings.proxyHost;
  if (elements.proxyPort) elements.proxyPort.value = settings.proxyPort;
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
      value = `https://${value}`;
    }
    return value;
  }

  return GOOGLE_SEARCH_URL + encodeURIComponent(value);
};

const getCurrentTab = () => tabs.find((tab) => tab.id === currentTabId);

const updateNavButtons = () => {
  const currentTab = getCurrentTab();
  if (elements.backButton) elements.backButton.disabled = !currentTab || !currentTab.canGoBack;
  if (elements.forwardButton) elements.forwardButton.disabled = !currentTab || !currentTab.canGoForward;
};

const updateAddressBar = () => {
  const currentTab = getCurrentTab();
  if (elements.addressBar) elements.addressBar.value = currentTab ? currentTab.url : DEFAULT_HOMEPAGE;
};

const renderTabs = () => {
  if (!elements.tabsContainer) return;
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

    tabEl.addEventListener('click', (event) => {
      if (event.target !== closeButton) {
        switchTab(tab.id);
      }
    });

    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });

    elements.tabsContainer.appendChild(tabEl);
  });
};

const createNewTab = async () => {
  const tabId = currentTabId + nextTabId;
  nextTabId += 1;

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
  tabs = tabs.filter((tab) => tab.id !== tabId);

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

const renderExtensionDetail = () => {
  const details = extensionState.selectedDetails;
  if (!details) {
    elements.extensionDetailName.textContent = 'Select an extension';
    elements.extensionDetailMeta.textContent = 'Choose an installed or bundled extension to inspect it.';
    elements.extensionDetailPermissions.textContent = '';
    elements.extensionDetailStats.textContent = '';
    elements.extensionSettingsFrame.srcdoc = '<p>No settings selected.</p>';
    elements.extensionSettingsEditor.value = '{}';
    elements.extensionActions.innerHTML = '';
    return;
  }

  elements.extensionDetailName.textContent = `${details.icon} ${details.name}`;
  elements.extensionDetailMeta.textContent = `${details.version} • ${details.enabled ? 'Enabled' : 'Disabled'} • ${details.bundled ? 'Bundled' : 'Local'}`;
  elements.extensionDetailPermissions.textContent = details.permissions.length
    ? `Permissions: ${details.permissions.join(', ')}`
    : 'Permissions: none';
  elements.extensionDetailStats.textContent = `Statistics: ${details.config?.stats?.blockedRequests || 0} blocked requests`;
  elements.extensionSettingsFrame.srcdoc = details.settingsHtml || '<p>No settings UI provided for this extension.</p>';
  elements.extensionSettingsEditor.value = JSON.stringify(details.config?.settings || {}, null, 2);

  elements.extensionActions.innerHTML = '';
  (details.actions || []).forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-btn';
    button.textContent = action.label;
    button.addEventListener('click', async () => {
      const result = await window.browserAPI.runExtensionAction(details.id, action.id);
      setStatus(result.message || `${details.name} action finished`);
      if (details.id === 'tab-manager') {
        await selectExtension(details.id);
      }
    });
    elements.extensionActions.appendChild(button);
  });
};

const createExtensionCard = (extension, options = {}) => {
  const card = document.createElement('article');
  card.className = `extension-card ${extensionState.selectedId === extension.id ? 'selected' : ''}`;

  const header = document.createElement('div');
  header.className = 'extension-card-header';
  const icon = document.createElement('span');
  icon.className = 'extension-card-icon';
  icon.textContent = extension.icon;
  const titleGroup = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = extension.name;
  const version = document.createElement('div');
  version.className = 'extension-card-version';
  version.textContent = `v${extension.version}`;
  titleGroup.append(title, version);
  header.append(icon, titleGroup);

  const description = document.createElement('p');
  description.className = 'extension-card-description';
  description.textContent = extension.description;

  const permissions = document.createElement('div');
  permissions.className = 'extension-card-permissions';
  permissions.textContent = extension.permissions.length ? extension.permissions.join(', ') : 'No permissions';

  const actions = document.createElement('div');
  actions.className = 'extension-card-actions';

  if (options.installed) {
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'checkbox-label';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = extension.enabled;
    const text = document.createElement('span');
    text.textContent = 'Enabled';
    toggleLabel.append(toggle, text);

    toggle.addEventListener('change', async () => {
      await window.browserAPI.toggleExtension(extension.id, toggle.checked);
      setStatus(`${extension.name} ${toggle.checked ? 'enabled' : 'disabled'} (reload pages for full effect)`);
      await loadExtensions(extension.id);
    });

    const detailsButton = document.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'settings-btn';
    detailsButton.textContent = 'Settings';
    detailsButton.addEventListener('click', () => selectExtension(extension.id));

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'settings-btn danger-btn';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', async () => {
      await window.browserAPI.removeExtension(extension.id);
      setStatus(`${extension.name} removed`);
      await loadExtensions();
    });

    actions.append(toggleLabel, detailsButton, removeButton);
  } else {
    const installButton = document.createElement('button');
    installButton.type = 'button';
    installButton.className = 'settings-btn';
    installButton.textContent = 'Install';
    installButton.addEventListener('click', async () => {
      await window.browserAPI.installBundledExtension(extension.id);
      setStatus(`${extension.name} installed`);
      await loadExtensions(extension.id);
    });
    actions.appendChild(installButton);
  }

  card.append(header, description, permissions, actions);
  card.addEventListener('click', () => selectExtension(extension.id));
  return card;
};

const renderExtensionLists = () => {
  elements.installedExtensionsList.innerHTML = '';
  elements.marketplaceExtensionsList.innerHTML = '';

  extensionState.installed.forEach((extension) => {
    elements.installedExtensionsList.appendChild(createExtensionCard(extension, { installed: true }));
  });

  extensionState.marketplace.forEach((extension) => {
    elements.marketplaceExtensionsList.appendChild(createExtensionCard(extension));
  });

  if (!extensionState.installed.length) {
    elements.installedExtensionsList.innerHTML = '<p class="extensions-empty">No installed extensions yet.</p>';
  }

  if (!extensionState.marketplace.length) {
    elements.marketplaceExtensionsList.innerHTML = '<p class="extensions-empty">All bundled extensions are already installed.</p>';
  }
};

const selectExtension = async (extensionId) => {
  extensionState.selectedId = extensionId;
  try {
    extensionState.selectedDetails = await window.browserAPI.getExtensionDetails(extensionId);
  } catch {
    extensionState.selectedDetails = null;
  }
  renderExtensionLists();
  renderExtensionDetail();
};

const loadExtensions = async (preferredId) => {
  const data = await window.browserAPI.listExtensions();
  extensionState.installed = data.installed;
  extensionState.marketplace = data.marketplace;
  saveExtensionToggleState();
  renderExtensionLists();

  const nextSelection = preferredId
    || extensionState.selectedId
    || extensionState.installed[0]?.id
    || extensionState.marketplace[0]?.id
    || null;

  if (nextSelection) {
    await selectExtension(nextSelection);
  } else {
    extensionState.selectedId = null;
    extensionState.selectedDetails = null;
    renderExtensionDetail();
  }
};

const openExtensionsManager = async () => {
  await loadExtensions();
  elements.extensionsModal.classList.remove('hidden');
};

const closeExtensionsManager = () => {
  elements.extensionsModal.classList.add('hidden');
};

if (elements.backButton) elements.backButton.addEventListener('click', () => window.browserAPI.navigate(currentTabId, 'back'));
if (elements.forwardButton) elements.forwardButton.addEventListener('click', () => window.browserAPI.navigate(currentTabId, 'forward'));
if (elements.reloadButton) elements.reloadButton.addEventListener('click', () => window.browserAPI.navigate(currentTabId, 'reload'));
if (elements.homeButton) elements.homeButton.addEventListener('click', () => window.browserAPI.navigate(currentTabId, 'home'));
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

if (elements.adBlockToggle) {
  elements.adBlockToggle.addEventListener('change', async () => {
    settings.adBlock = elements.adBlockToggle.checked;
    saveSettings();
    await window.browserAPI.setAdBlock(settings.adBlock);
  });
}

if (elements.trackingToggle) {
  elements.trackingToggle.addEventListener('change', async () => {
    settings.trackingProtection = elements.trackingToggle.checked;
    saveSettings();
    await window.browserAPI.setTrackingProtection(settings.trackingProtection);
  });
}

if (elements.applyProxyButton) {
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
}

if (elements.clearCacheButton) {
  elements.clearCacheButton.addEventListener('click', async () => {
    await window.browserAPI.clearCache();
    setStatus('Cache cleared');
  });
}

if (elements.bookmarkButton) {
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
}

if (elements.bookmarkList) {
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

    if (elements.addressBar) elements.addressBar.value = bookmark.url;
    await window.browserAPI.navigate(currentTabId, 'go', bookmark.url);
    elements.bookmarkList.value = '';
  });
}

if (elements.privateWindowButton) {
  elements.privateWindowButton.addEventListener('click', () => {
    window.browserAPI.openPrivateWindow();
  });
}

if (elements.extensionsButton) {
  elements.extensionsButton.addEventListener('click', openExtensionsManager);
}

if (elements.closeExtensionsButton) {
  elements.closeExtensionsButton.addEventListener('click', closeExtensionsManager);
}

if (elements.installZipButton) {
  elements.installZipButton.addEventListener('click', async () => {
    const installed = await window.browserAPI.installExtensionZip();
    if (installed) {
      setStatus(`${installed.name} installed`);
      await loadExtensions(installed.id);
    }
  });
}

if (elements.saveExtensionSettingsButton) {
  elements.saveExtensionSettingsButton.addEventListener('click', async () => {
    if (!extensionState.selectedId) {
      return;
    }

    try {
      const nextSettings = JSON.parse(elements.extensionSettingsEditor.value || '{}');
      await window.browserAPI.saveExtensionSettings(extensionState.selectedId, nextSettings);
      setStatus('Extension settings saved');
      await selectExtension(extensionState.selectedId);
    } catch (error) {
      setStatus(`Invalid extension settings JSON: ${error.message}`);
    }
  });
}

if (elements.extensionsModal) {
  elements.extensionsModal.addEventListener('click', (event) => {
    if (event.target === elements.extensionsModal) {
      closeExtensionsManager();
    }
  });
}

window.browserAPI.onBrowserState((tabId, state) => {
  const tab = tabs.find((entry) => entry.id === tabId);
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

window.browserAPI.onLoadingState((_tabId, loading) => {
  if (elements.loadingSpinner) {
    elements.loadingSpinner.classList.toggle('hidden', !loading);
  }
});

window.browserAPI.onDownloadState((download) => {
  setStatus(`Download ${download.state}: ${download.filename}`);
});

applySettingsToUi();
renderBookmarks();
pushSettingsToMain();
createNewTab();
