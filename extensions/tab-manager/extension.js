(async () => {
  const [currentTab] = await browser.tabs.query();
  const storage = await browser.storage.local.get({ recentTabs: [] });
  const recentTabs = Array.isArray(storage.recentTabs) ? storage.recentTabs : [];
  const nextRecentTabs = [currentTab, ...recentTabs.filter((entry) => entry.url !== currentTab.url)].slice(0, 10);
  await browser.storage.local.set({ recentTabs: nextRecentTabs });
})();
