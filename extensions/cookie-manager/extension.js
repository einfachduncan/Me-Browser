(async () => {
  const cookies = await browser.cookieStore.getAll();
  await browser.storage.local.set({ lastCookieCount: cookies.length });
})();
