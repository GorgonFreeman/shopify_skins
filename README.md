# Shopify Skins

Chrome extension that applies custom Slack-style colour themes to the Shopify admin, plus double-click theme rename via the Admin API.

## Theme colours

Paste a Slack theme string in the popup:

```text
#B9A3FF,#FFFFFF,#FF61DF,#94FFB2
```

Mapped as **primary**, **secondary**, **text**, **accent**. Colour pickers update the admin live. Use **Colour scheme** to turn styling off without losing your palette. Export CSV from the popup when you want a snapshot.

## Theme rename

1. In the extension popup, paste a Shopify Admin API token (`shpat_…`) with theme write access.
2. In admin, click the pencil next to a theme name → edit → Enter.
   The pencil uses your accent colour, or teal when the colour scheme is off.

Rename calls Shopify GraphQL `themeUpdate` directly (`STORE_HANDLE` from the admin URL + your token). The token is stored in `chrome.storage.local` only.

Note: Shopify may require a `write_themes` exemption for `themeUpdate` on some apps.

## Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (or run `./install.sh`)
4. Reload the extension after code changes, then hard-refresh admin tabs
