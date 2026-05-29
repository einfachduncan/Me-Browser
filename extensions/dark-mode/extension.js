(async () => {
  const state = await browser.storage.local.get({
    brightness: 0.92,
    whitelist: [],
    autoDomains: []
  });

  const hostname = window.location.hostname;
  const whitelist = Array.isArray(state.whitelist) ? state.whitelist : [];
  const autoDomains = Array.isArray(state.autoDomains) ? state.autoDomains : [];

  if (whitelist.some((entry) => hostname.includes(entry))) {
    return;
  }

  if (autoDomains.length && !autoDomains.some((entry) => hostname.includes(entry))) {
    return;
  }

  const brightness = Number(state.brightness || 0.92);
  await browser.page.inject({
    css: `
      html {
        background: #111 !important;
        filter: invert(1) hue-rotate(180deg) brightness(${brightness});
      }

      img, video, picture, iframe {
        filter: invert(1) hue-rotate(180deg) !important;
      }
    `
  });
})();
