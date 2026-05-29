# Me-Browser

Minimal Electron browser with security and privacy defaults.

## Run

```bash
npm install
npm start
```

## Features

- BrowserView-based browsing UI (Back/Forward/Reload/Home + address bar)
- Default homepage: `https://www.google.com`
- Loading spinner indicator
- Basic ad-blocking via `session.webRequest.onBeforeRequest` and `filters.json`
- Proxy mode settings (enable + host + port)
- Tracking protection (third-party cookie request stripping)
- Do Not Track request header (`DNT: 1`)
- Clear cache button
- Dark minimal UI
- Secure Electron settings (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`)
- Local bookmarks persistence (`localStorage`)
- Download state notifications
- URL auto-fix (`https://` prefix)
- Bundled/browser-installable extension system with a manager UI, manifest validation, and isolated content script injection
