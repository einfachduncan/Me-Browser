(async () => {
  const state = await browser.storage.local.get({ blockPatterns: [] });
  const blockPatterns = Array.isArray(state.blockPatterns) && state.blockPatterns.length
    ? state.blockPatterns
    : ['*doubleclick*', '*googlesyndication*', '*adservice*', '*analytics*'];

  await browser.webRequest.onBeforeRequest({ block: blockPatterns });
})();
