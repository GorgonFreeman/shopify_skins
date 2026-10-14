# Shopify Skins

Chrome extension that applies custom Slack-style colour themes to the Shopify admin, plus double-click theme rename via [@foxtware/mineral](https://www.npmjs.com/package/@foxtware/mineral).

## Theme colours

Paste a Slack theme string in the popup:

```text
#B9A3FF,#FFFFFF,#FF61DF,#94FFB2
```

Mapped as **primary**, **secondary**, **text**, **accent**. Colour pickers update the admin live. Export CSV from the popup when you want a snapshot.

## Theme rename

1. Install deps and start mineral from this folder:

```bash
npm install
npm run mineral
```

2. In the extension popup, paste a Shopify Admin API token (`shpat_…` with theme write access) and confirm the Mineral URL (default `http://127.0.0.1:8000`).
3. In admin, double-click a theme name → edit → Enter. Escape cancels.

Rename calls mineral `shopifyThemeUpdate` with an inline `credsObject` (`STORE_HANDLE` from the admin URL + your token). Token is stored in `chrome.storage.local` only.

## Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (or run `./install.sh`)
4. Reload the extension after code changes, then hard-refresh admin tabs
