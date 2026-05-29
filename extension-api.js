const registerExtensionApi = ({ ipcMain, extensionManager }) => {
  ipcMain.handle('browser:extensions:list', () => extensionManager.listExtensions());
  ipcMain.handle('browser:extensions:details', (_event, extensionId) => extensionManager.getExtensionDetails(extensionId));
  ipcMain.handle('browser:extensions:toggle', (_event, extensionId, enabled) => extensionManager.setExtensionEnabled(extensionId, enabled));
  ipcMain.handle('browser:extensions:install-bundled', (_event, extensionId) => extensionManager.installBundledExtension(extensionId));
  ipcMain.handle('browser:extensions:remove', (_event, extensionId) => extensionManager.removeExtension(extensionId));
  ipcMain.handle('browser:extensions:save-settings', (_event, extensionId, nextSettings) => extensionManager.saveExtensionSettings(extensionId, nextSettings));
  ipcMain.handle('browser:extensions:install-zip', () => extensionManager.installFromZip());
  ipcMain.handle('browser:extensions:run-action', (_event, extensionId, actionId) => extensionManager.runExtensionAction(extensionId, actionId));
  ipcMain.handle('extensions:api:call', (event, payload) => extensionManager.invokeApi(event.sender, payload));
};

module.exports = {
  registerExtensionApi
};
