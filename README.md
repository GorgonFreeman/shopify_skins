# Shopify Skins

Chrome extension that applies custom Slack-style colour themes to the Shopify admin, plus optional theme rename via the Admin API.

**Public repo:** https://github.com/GorgonFreeman/shopify_skins  
**Releases:** https://github.com/GorgonFreeman/shopify_skins/releases

## Install from release

1. Download `shopify_skins.zip` from the [latest release](https://github.com/GorgonFreeman/shopify_skins/releases/latest)
2. Unzip it somewhere permanent
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. **Load unpacked** → select the unzipped folder

## Theme colours

Paste a Slack theme string in the popup:

```text
#B9A3FF,#FFFFFF,#FF61DF,#94FFB2
```

Mapped as **primary**, **secondary**, **text**, **accent**. Colour pickers update the admin live. Use **Colour scheme** to turn styling off without losing your palette. Export CSV from the popup when you want a snapshot.

## Theme rename

1. In the extension popup under **API functionalities**, paste a Shopify Admin API key (`shpat_…`) with theme write access.
2. Turn on **Renaming themes** (greyed out until a key is entered).
3. Open **Online Store → Themes**. The themes UI loads in Shopify’s
   `online-store-web` iframe — pencils appear on theme titles there.
4. Click the pencil → rename in the popover → Save / Enter.
   The pencil uses your accent colour, or teal when the colour scheme is off.

Rename calls Shopify GraphQL `themeUpdate` directly (`STORE_HANDLE` from the admin URL + your key). The key is stored in `chrome.storage.local` only.

Note: Shopify may require a `write_themes` exemption for `themeUpdate` on some apps.

## Colour scheme architecture

- `theme_storage.js` — palette model + chrome.storage load/save
- `colour_scheme.js` — `ColourScheme.apply()` / `ColourScheme.unapply()` / `ColourScheme.sync()`
- `content.js` — listens for storage + DOM remounts and calls `sync()`
- `rename.js` — theme title pencils + rename popover (also on `online-store-web.shopifyapps.com`)

Toggle **Colour scheme** in the popup to apply/unapply live. From an admin console you can also run `shopifySkinsApply()` / `shopifySkinsUnapply()`.

## Load unpacked (development)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (or run `./install.sh`)
4. Reload the extension after code changes, then hard-refresh admin tabs

## Pack

```bash
npm run pack
```

Creates `dist/shopify_skins.zip` for Chrome Web Store upload or GitHub releases.

## Privacy

- Colour themes are stored in `chrome.storage.sync`
- Optional Admin API keys are stored in `chrome.storage.local` (per store when possible)
- No analytics. Keys are only sent to the merchant’s own `{shop}.myshopify.com` Admin GraphQL API when renaming themes
