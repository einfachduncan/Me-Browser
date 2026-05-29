const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const extract = require('extract-zip');
const { dialog, Notification } = require('electron');

const EXTENSION_WORLD_BASE = 1000;
const ALLOWED_PERMISSIONS = new Set([
  'webRequest',
  'storage',
  'tabs',
  'scripting',
  'notifications',
  'cookieStore'
]);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const toSerializableObject = (value) => JSON.parse(JSON.stringify(isPlainObject(value) ? value : {}));

const safeJsonParse = async (filePath, fallbackValue) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
};

const escapePattern = (pattern) => pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');

const matchesPattern = (value, pattern) => {
  if (!pattern) return false;
  if (pattern === '<all_urls>') {
    return /^(https?:|file:)/i.test(value);
  }

  try {
    return new RegExp(`^${escapePattern(pattern)}$`, 'i').test(value);
  } catch {
    return false;
  }
};

const sanitizeArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];

class ExtensionManager {
  constructor({ rootDir, getMainWindow, getBrowserViews, getCurrentTabId, getHomepage }) {
    this.rootDir = rootDir;
    this.getMainWindow = getMainWindow;
    this.getBrowserViews = getBrowserViews;
    this.getCurrentTabId = getCurrentTabId;
    this.getHomepage = getHomepage;
    this.extensions = new Map();
    this.webContentsToTabId = new Map();
  }

  async initialize() {
    await fs.mkdir(this.rootDir, { recursive: true });
    await this.loadExtensions();
  }

  computeWorldId(extensionId) {
    let hash = 0;
    for (const char of extensionId) {
      hash = ((hash << 5) - hash + char.charCodeAt(0)) >>> 0;
    }
    return EXTENSION_WORLD_BASE + (hash % 10000);
  }

  async loadExtensions() {
    this.extensions.clear();

    let directoryEntries = [];
    try {
      directoryEntries = await fs.readdir(this.rootDir, { withFileTypes: true });
    } catch {
      directoryEntries = [];
    }

    for (const entry of directoryEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const extensionDir = path.join(this.rootDir, entry.name);
      const manifestPath = path.join(extensionDir, 'manifest.json');
      const manifest = await safeJsonParse(manifestPath, null);
      if (!manifest) {
        continue;
      }

      try {
        this.validateManifest(manifest);
      } catch (error) {
        console.error(`Skipping invalid extension in ${extensionDir}`, error);
        continue;
      }

      try {
        if (manifest.entry) {
          await fs.access(path.join(extensionDir, manifest.entry));
        }
        if (manifest.settings) {
          await fs.access(path.join(extensionDir, manifest.settings));
        }
      } catch (error) {
        console.error(`Skipping extension with missing files in ${extensionDir}`, error);
        continue;
      }

      const configPath = path.join(extensionDir, 'config.json');
      const config = this.normalizeConfig(manifest, await safeJsonParse(configPath, {}));
      const extension = {
        id: manifest.id,
        directory: extensionDir,
        manifest,
        config,
        worldId: this.computeWorldId(manifest.id)
      };

      this.extensions.set(extension.id, extension);
      await this.saveConfig(extension);
    }
  }

  normalizeConfig(manifest, config) {
    const normalized = isPlainObject(config) ? config : {};
    const defaultSettings = toSerializableObject(manifest.defaultConfig || {});

    return {
      installed: normalized.installed !== false,
      enabled: normalized.enabled !== false,
      settings: {
        ...defaultSettings,
        ...toSerializableObject(normalized.settings || {})
      },
      storage: toSerializableObject(normalized.storage || {}),
      runtime: {
        blockPatterns: sanitizeArray(normalized.runtime?.blockPatterns)
      },
      stats: {
        blockedRequests: Number(normalized.stats?.blockedRequests || 0)
      }
    };
  }

  validateManifest(manifest) {
    if (!isPlainObject(manifest)) {
      throw new Error('Invalid manifest format');
    }

    const requiredStrings = ['id', 'name', 'version', 'description'];
    for (const key of requiredStrings) {
      if (typeof manifest[key] !== 'string' || !manifest[key].trim()) {
        throw new Error(`Manifest field ${key} is required`);
      }
    }

    if (!/^[a-z0-9-]+$/i.test(manifest.id)) {
      throw new Error('Manifest id may only contain letters, numbers, and hyphens');
    }

    if (!Array.isArray(manifest.permissions)) {
      throw new Error('Manifest permissions must be an array');
    }

    for (const permission of manifest.permissions) {
      if (!ALLOWED_PERMISSIONS.has(permission)) {
        throw new Error(`Unsupported permission requested: ${permission}`);
      }
    }

    if (manifest.entry && typeof manifest.entry !== 'string') {
      throw new Error('Manifest entry must be a string');
    }

    if (manifest.settings && typeof manifest.settings !== 'string') {
      throw new Error('Manifest settings must be a string');
    }

    const relativeFiles = [
      manifest.entry,
      manifest.settings,
      ...(Array.isArray(manifest.contentScripts)
        ? manifest.contentScripts.flatMap((script) => Array.isArray(script.css) ? script.css : [])
        : [])
    ].filter(Boolean);

    for (const filePath of relativeFiles) {
      if (path.isAbsolute(filePath) || filePath.includes('..')) {
        throw new Error(`Manifest file paths must stay inside the extension directory: ${filePath}`);
      }
    }
  }

  async saveConfig(extension) {
    const configPath = path.join(extension.directory, 'config.json');
    await fs.writeFile(configPath, `${JSON.stringify(extension.config, null, 2)}\n`, 'utf8');
  }

  async readSettingsHtml(extension) {
    if (!extension.manifest.settings) {
      return '';
    }

    try {
      return await fs.readFile(path.join(extension.directory, extension.manifest.settings), 'utf8');
    } catch {
      return '';
    }
  }

  toSummary(extension) {
    return {
      id: extension.id,
      name: extension.manifest.name,
      version: extension.manifest.version,
      description: extension.manifest.description,
      icon: extension.manifest.icon || '🧩',
      permissions: extension.manifest.permissions,
      bundled: Boolean(extension.manifest.bundled),
      enabled: Boolean(extension.config.enabled && extension.config.installed),
      installed: extension.config.installed !== false,
      stats: extension.config.stats,
      hasSettings: Boolean(extension.manifest.settings),
      actions: Array.isArray(extension.manifest.actions) ? extension.manifest.actions : []
    };
  }

  listExtensions() {
    const installed = [];
    const marketplace = [];

    for (const extension of [...this.extensions.values()].sort((left, right) => left.manifest.name.localeCompare(right.manifest.name))) {
      const summary = this.toSummary(extension);
      if (summary.installed) {
        installed.push(summary);
      } else if (summary.bundled) {
        marketplace.push(summary);
      }
    }

    return { installed, marketplace };
  }

  async getExtensionDetails(extensionId) {
    const extension = this.requireExtension(extensionId);
    return {
      ...this.toSummary(extension),
      config: extension.config,
      manifest: extension.manifest,
      settingsHtml: await this.readSettingsHtml(extension)
    };
  }

  requireExtension(extensionId) {
    const extension = this.extensions.get(extensionId);
    if (!extension) {
      throw new Error(`Unknown extension: ${extensionId}`);
    }
    return extension;
  }

  requirePermission(extension, permission) {
    if (!extension.manifest.permissions.includes(permission)) {
      throw new Error(`${extension.manifest.name} does not have ${permission} permission`);
    }
  }

  getCurrentView() {
    return this.getBrowserViews().get(this.getCurrentTabId());
  }

  getTabInfoFromContents(webContents) {
    const tabId = this.webContentsToTabId.get(webContents.id) ?? this.getCurrentTabId();
    const url = webContents.getURL() || this.getHomepage();
    return [{
      id: tabId,
      active: tabId === this.getCurrentTabId(),
      title: webContents.getTitle() || 'New Tab',
      url
    }];
  }

  registerTabView(tabId, view) {
    this.webContentsToTabId.set(view.webContents.id, tabId);
    view.webContents.on('did-finish-load', () => {
      this.injectEnabledExtensions(tabId, view).catch((error) => {
        console.error('Extension injection failed', error);
      });
    });
  }

  unregisterTabView(tabId, view) {
    if (view?.webContents) {
      this.webContentsToTabId.delete(view.webContents.id);
    }
  }

  getMatchingExtensions(url) {
    if (!/^(https?:|file:)/i.test(url || '')) {
      return [];
    }

    return [...this.extensions.values()].filter((extension) => {
      if (!extension.config.installed || !extension.config.enabled) {
        return false;
      }

      const contentScripts = Array.isArray(extension.manifest.contentScripts) ? extension.manifest.contentScripts : [];
      if (!contentScripts.length) {
        return false;
      }

      return contentScripts.some((script) => (Array.isArray(script.matches) ? script.matches : ['<all_urls>']).some((pattern) => matchesPattern(url, pattern)));
    });
  }

  async injectEnabledExtensions(tabId, view) {
    const url = view.webContents.getURL();
    const extensions = this.getMatchingExtensions(url);
    if (!extensions.length) {
      return;
    }

    view.webContents.send('extensions:bootstrap', extensions.map((extension) => ({
      id: extension.id,
      worldId: extension.worldId,
      permissions: extension.manifest.permissions,
      manifest: {
        id: extension.manifest.id,
        name: extension.manifest.name,
        version: extension.manifest.version,
        description: extension.manifest.description,
        icon: extension.manifest.icon || '🧩'
      }
    })));

    for (const extension of extensions) {
      const contentScripts = Array.isArray(extension.manifest.contentScripts) ? extension.manifest.contentScripts : [];
      for (const scriptDef of contentScripts) {
        const matches = (Array.isArray(scriptDef.matches) ? scriptDef.matches : ['<all_urls>']).some((pattern) => matchesPattern(url, pattern));
        if (!matches) {
          continue;
        }

        for (const cssFile of Array.isArray(scriptDef.css) ? scriptDef.css : []) {
          try {
            const css = await fs.readFile(path.join(extension.directory, cssFile), 'utf8');
            await view.webContents.insertCSS(css);
          } catch (error) {
            console.error(`Failed to inject CSS for ${extension.id}`, error);
          }
        }
      }

      try {
        const entryFile = extension.manifest.entry || 'extension.js';
        const source = await fs.readFile(path.join(extension.directory, entryFile), 'utf8');
        await view.webContents.executeJavaScriptInIsolatedWorld(extension.worldId, [{
          code: `(async () => { try {\n${source}\n} catch (error) { console.error('[Extension:${extension.id}]', error); } })();`
        }], true);
      } catch (error) {
        console.error(`Failed to inject extension ${extension.id}`, error);
      }
    }
  }

  async refreshEnabledExtensions() {
    for (const [tabId, view] of this.getBrowserViews()) {
      await this.injectEnabledExtensions(tabId, view);
    }
  }

  getWebRequestBlockResult(details) {
    const url = details.url || '';
    const loweredUrl = url.toLowerCase();

    for (const extension of this.extensions.values()) {
      if (!extension.config.installed || !extension.config.enabled) {
        continue;
      }

      if (!extension.manifest.permissions.includes('webRequest')) {
        continue;
      }

      const settings = extension.config.settings || {};
      const blockedPatterns = [
        ...sanitizeArray(settings.blockPatterns),
        ...sanitizeArray(extension.config.runtime.blockPatterns)
      ];
      const whitelist = sanitizeArray(settings.whitelist);

      if (whitelist.some((pattern) => matchesPattern(url, pattern) || url.includes(pattern))) {
        continue;
      }

      const shouldBlock = blockedPatterns.some((pattern) => {
        if (pattern.includes('*')) {
          return matchesPattern(url, pattern);
        }
        return loweredUrl.includes(pattern.toLowerCase());
      });
      if (shouldBlock) {
        extension.config.stats.blockedRequests += 1;
        return { cancel: true, extensionId: extension.id };
      }
    }

    return { cancel: false, extensionId: null };
  }

  async setExtensionEnabled(extensionId, enabled) {
    const extension = this.requireExtension(extensionId);
    extension.config.enabled = Boolean(enabled) && extension.config.installed !== false;
    await this.saveConfig(extension);
    if (extension.config.enabled) {
      await this.refreshEnabledExtensions();
    }
    return this.toSummary(extension);
  }

  async installBundledExtension(extensionId) {
    const extension = this.requireExtension(extensionId);
    if (!extension.manifest.bundled) {
      throw new Error('Only bundled extensions can be installed from the marketplace');
    }

    extension.config.installed = true;
    extension.config.enabled = true;
    await this.saveConfig(extension);
    await this.refreshEnabledExtensions();
    return this.toSummary(extension);
  }

  async removeExtension(extensionId) {
    const extension = this.requireExtension(extensionId);

    if (extension.manifest.bundled) {
      extension.config.installed = false;
      extension.config.enabled = false;
      await this.saveConfig(extension);
      return true;
    }

    await fs.rm(extension.directory, { recursive: true, force: true });
    this.extensions.delete(extensionId);
    return true;
  }

  async saveExtensionSettings(extensionId, nextSettings) {
    const extension = this.requireExtension(extensionId);
    extension.config.settings = toSerializableObject(nextSettings);
    await this.saveConfig(extension);
    if (extension.config.enabled) {
      await this.refreshEnabledExtensions();
    }
    return this.getExtensionDetails(extensionId);
  }

  applyStorageGet(storage, query) {
    if (typeof query === 'string') {
      return { [query]: storage[query] };
    }

    if (Array.isArray(query)) {
      return query.reduce((result, key) => ({ ...result, [key]: storage[key] }), {});
    }

    if (isPlainObject(query)) {
      return Object.keys(query).reduce((result, key) => ({
        ...result,
        [key]: storage[key] === undefined ? query[key] : storage[key]
      }), {});
    }

    return { ...storage };
  }

  async invokeApi(webContents, payload = {}) {
    const extension = this.requireExtension(payload.extensionId);
    if (!extension.config.installed || !extension.config.enabled) {
      throw new Error(`${extension.manifest.name} is not enabled`);
    }

    switch (payload.method) {
      case 'tabs.query':
        this.requirePermission(extension, 'tabs');
        return this.getTabInfoFromContents(webContents);
      case 'tabs.executeScript': {
        this.requirePermission(extension, 'scripting');
        const details = isPlainObject(payload.args?.[0]) ? payload.args[0] : {};
        const code = typeof details.code === 'string' ? details.code : '';
        if (!code.trim()) {
          return null;
        }
        return webContents.executeJavaScriptInIsolatedWorld(extension.worldId, [{ code }], true);
      }
      case 'storage.get':
        this.requirePermission(extension, 'storage');
        return this.applyStorageGet({
          ...extension.config.storage,
          ...extension.config.settings
        }, payload.args?.[0]);
      case 'storage.set': {
        this.requirePermission(extension, 'storage');
        const nextValues = toSerializableObject(payload.args?.[0]);
        extension.config.storage = {
          ...extension.config.storage,
          ...nextValues
        };
        await this.saveConfig(extension);
        return true;
      }
      case 'messaging.send': {
        const [channel, message] = payload.args || [];
        for (const [, view] of this.getBrowserViews()) {
          view.webContents.send('extensions:message', {
            extensionId: extension.id,
            channel: typeof channel === 'string' ? channel : 'default',
            payload: message ?? null
          });
        }
        return true;
      }
      case 'page.inject': {
        this.requirePermission(extension, 'scripting');
        const details = isPlainObject(payload.args?.[0]) ? payload.args[0] : {};
        if (typeof details.css === 'string' && details.css.trim()) {
          await webContents.insertCSS(details.css);
        }
        if (typeof details.js === 'string' && details.js.trim()) {
          await webContents.executeJavaScriptInIsolatedWorld(extension.worldId, [{ code: details.js }], true);
        }
        return true;
      }
      case 'notifications.create': {
        this.requirePermission(extension, 'notifications');
        const details = isPlainObject(payload.args?.[0]) ? payload.args[0] : {};
        const notification = new Notification({
          title: String(details.title || extension.manifest.name),
          body: String(details.body || extension.manifest.description)
        });
        notification.show();
        return true;
      }
      case 'webRequest.onBeforeRequest': {
        this.requirePermission(extension, 'webRequest');
        const details = isPlainObject(payload.args?.[0]) ? payload.args[0] : {};
        extension.config.runtime.blockPatterns = sanitizeArray(details.block);
        await this.saveConfig(extension);
        return true;
      }
      case 'cookieStore.getAll': {
        this.requirePermission(extension, 'cookieStore');
        const details = isPlainObject(payload.args?.[0]) ? payload.args[0] : {};
        const [currentTab] = this.getTabInfoFromContents(webContents);
        return webContents.session.cookies.get({
          url: typeof details.url === 'string' ? details.url : currentTab.url
        });
      }
      case 'cookieStore.remove': {
        this.requirePermission(extension, 'cookieStore');
        const details = isPlainObject(payload.args?.[0]) ? payload.args[0] : {};
        const [currentTab] = this.getTabInfoFromContents(webContents);
        if (!details.name) {
          throw new Error('Cookie name is required');
        }
        await webContents.session.cookies.remove(details.url || currentTab.url, details.name);
        return true;
      }
      default:
        throw new Error(`Unsupported extension API method: ${payload.method}`);
    }
  }

  async runExtensionAction(extensionId, actionId) {
    const extension = this.requireExtension(extensionId);
    const currentView = this.getCurrentView();
    if (!currentView) {
      throw new Error('No active tab is available');
    }

    switch (`${extensionId}:${actionId}`) {
      case 'screenshot:capture-visible': {
        const image = await currentView.webContents.capturePage();
        const saveResult = await dialog.showSaveDialog(this.getMainWindow(), {
          title: 'Save Screenshot',
          defaultPath: path.join(os.homedir(), `me-browser-${Date.now()}.png`),
          filters: [{ name: 'PNG Images', extensions: ['png'] }]
        });

        if (saveResult.canceled || !saveResult.filePath) {
          return { success: false, message: 'Screenshot capture cancelled' };
        }

        const outputPath = saveResult.filePath;
        await fs.writeFile(outputPath, image.toPNG());
        return { success: true, message: `Saved screenshot to ${outputPath}` };
      }
      case 'tab-manager:save-current-group': {
        extension.config.settings.savedGroups = [
          ...(Array.isArray(extension.config.settings.savedGroups) ? extension.config.settings.savedGroups : []),
          {
            name: `Group ${new Date().toLocaleString()}`,
            tabs: [...this.getBrowserViews().values()].map((view) => ({
              title: view.webContents.getTitle() || 'New Tab',
              url: view.webContents.getURL() || this.getHomepage()
            }))
          }
        ];
        await this.saveConfig(extension);
        return { success: true, message: 'Saved the current tab group' };
      }
      case 'cookie-manager:clear-current-domain': {
        const currentUrl = currentView.webContents.getURL();
        const cookies = await currentView.webContents.session.cookies.get({ url: currentUrl });
        await Promise.all(cookies.map((cookie) => currentView.webContents.session.cookies.remove(currentUrl, cookie.name)));
        return { success: true, message: `Cleared ${cookies.length} cookies for the current site` };
      }
      default:
        return { success: false, message: `${extension.manifest.name} has no runnable action for ${actionId}` };
    }
  }

  async installFromZip() {
    const win = this.getMainWindow();
    const selection = await dialog.showOpenDialog(win, {
      title: 'Install Browser Extension',
      properties: ['openFile'],
      filters: [{ name: 'Extension Packages', extensions: ['zip'] }]
    });

    if (selection.canceled || !selection.filePaths.length) {
      return null;
    }

    const zipPath = selection.filePaths[0];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'me-browser-extension-'));

    try {
      await extract(zipPath, { dir: tempDir });
      const sourceDir = await this.findManifestDirectory(tempDir, 0, 3);
      const manifest = await safeJsonParse(path.join(sourceDir, 'manifest.json'), null);
      this.validateManifest(manifest);

      const prompt = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Install', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        title: 'Install Extension',
        message: `Install ${manifest.name}?`,
        detail: manifest.permissions.length
          ? `Requested permissions:\n• ${manifest.permissions.join('\n• ')}`
          : 'This extension does not request any special permissions.'
      });

      if (prompt.response !== 0) {
        return null;
      }

      const targetDir = path.join(this.rootDir, manifest.id);
      await fs.rm(targetDir, { recursive: true, force: true });
      await this.copyDirectory(sourceDir, targetDir);
      await this.loadExtensions();

      const extension = this.requireExtension(manifest.id);
      extension.config.installed = true;
      extension.config.enabled = true;
      await this.saveConfig(extension);
      await this.refreshEnabledExtensions();
      return this.toSummary(extension);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  async findManifestDirectory(rootDir, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) {
      throw new Error('manifest.json was not found within the supported package depth');
    }

    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === 'manifest.json')) {
      return rootDir;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidate = path.join(rootDir, entry.name);
      try {
        return await this.findManifestDirectory(candidate, depth + 1, maxDepth);
      } catch {
        // Continue searching.
      }
    }

    throw new Error('manifest.json not found inside the extension package');
  }

  async copyDirectory(sourceDir, targetDir) {
    await fs.mkdir(targetDir, { recursive: true });
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    await Promise.all(entries.map(async (entry) => {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }));
  }
}

module.exports = {
  ExtensionManager,
  ALLOWED_PERMISSIONS
};
