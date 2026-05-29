(async () => {
  const state = await browser.storage.local.get({
    volume: 0.8,
    brightness: 1,
    contrast: 1,
    supportedSites: ['youtube.com', 'vimeo.com']
  });

  const applyMediaSettings = () => {
    document.querySelectorAll('video, audio').forEach((mediaElement) => {
      mediaElement.volume = Math.max(0, Math.min(1, Number(state.volume || 0.8)));
      mediaElement.style.filter = `brightness(${Number(state.brightness || 1)}) contrast(${Number(state.contrast || 1)})`;
    });
  };

  applyMediaSettings();
  const observer = new MutationObserver(() => applyMediaSettings());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
